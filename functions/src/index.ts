import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

interface OrderInputItem {
  menuItemId: string;
  quantity: number;
  specialInstruction: string;
}

interface CreateOrderInput {
  restaurantId: string;
  tableId: string;
  qrToken: string;
  customerSessionId?: string;
  items: OrderInputItem[];
  specialInstructions?: string;
}

interface CreateStaffInput {
  restaurantId: string;
  fullName: string;
  email: string;
  password: string;
  role?: "KITCHEN" | "WAITER";
}

function randomToken(): string {
  return admin.firestore().collection("x").doc().id + admin.firestore().collection("x").doc().id;
}

/**
 * Securely creates an order for a customer.
 *
 * Validates restaurant/table/token server-side and uses the prices stored in
 * Firestore to compute the total — the client never supplies price or amount.
 */
export const createSecureOrder = functions.https.onCall(
  async (data: CreateOrderInput, context) => {
    if (!data || !data.restaurantId || !data.tableId || !data.qrToken) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "Order is empty.");
    }

    const restaurantRef = db.doc(`restaurants/${data.restaurantId}`);
    const restaurantSnap = await restaurantRef.get();
    if (!restaurantSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Restaurant not found.");
    }
    const restaurant = restaurantSnap.data()!;
    if (!restaurant.isActive) {
      throw new functions.https.HttpsError("failed-precondition", "Restaurant is not active.");
    }

    const tableRef = restaurantRef.collection("tables").doc(data.tableId);
    const tableSnap = await tableRef.get();
    if (!tableSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Table not found.");
    }
    const table = tableSnap.data()!;
    if (!table.isActive) {
      throw new functions.https.HttpsError("failed-precondition", "Table is not active.");
    }
    if (table.isAccessAvailable === false) {
      throw new functions.https.HttpsError("failed-precondition", "Table is currently unavailable.");
    }
    if (table.qrToken !== data.qrToken) {
      throw new functions.https.HttpsError("permission-denied", "Invalid QR token.");
    }

    // Validate GST/service charge from restaurant (authoritative)
    const gstPercent = Math.max(0, Math.min(100, Number(restaurant.gstPercent) || 0));
    const serviceChargePercent = Math.max(0, Math.min(100, Number(restaurant.serviceChargePercent) || 0));

    // Pre-collect orderItems and stock updates — stock checks must be inside transaction for atomicity,
    // but we first do a lightweight price validation outside to fail fast.
    const seenPre = new Set<string>();
    for (const item of data.items) {
      const qty = Math.floor(Number(item.quantity));
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new functions.https.HttpsError("invalid-argument", "Quantity must be greater than 0.");
      }
      if (seenPre.has(item.menuItemId)) {
        throw new functions.https.HttpsError("invalid-argument", "Duplicate menu item in order.");
      }
      seenPre.add(item.menuItemId);
    }

    const orderRef = restaurantRef.collection("orders").doc();
    const trackingToken = randomToken();

    await db.runTransaction(async (t) => {
      // Re-read restaurant inside transaction to ensure isActive still true (optional but consistent with client)
      const restSnapTx = await t.get(restaurantRef);
      if (!restSnapTx.exists || restSnapTx.data()!.isActive !== true) {
        throw new functions.https.HttpsError("failed-precondition", "Restaurant is not accepting orders.");
      }
      const tableSnapTx = await t.get(tableRef);
      if (!tableSnapTx.exists || tableSnapTx.data()!.isActive !== true || tableSnapTx.data()!.qrToken !== data.qrToken) {
        throw new functions.https.HttpsError("failed-precondition", "Table is not available.");
      }
      if (tableSnapTx.data()!.isAccessAvailable === false) {
        throw new functions.https.HttpsError("failed-precondition", "Table is currently unavailable.");
      }

      const orderItems: Array<{
        menuItemId: string;
        itemName: string;
        price: number;
        quantity: number;
        specialInstruction: string;
        restaurantId: string;
        tableId: string;
        qrToken: string;
      }> = [];
      let totalAmount = 0;
      const seen = new Set<string>();
      const stockUpdates: Array<{ ref: ReturnType<typeof db.doc>; newQty: number }> = [];

      for (const item of data.items) {
        const qty = Math.floor(Number(item.quantity));
        if (seen.has(item.menuItemId)) {
          throw new functions.https.HttpsError("invalid-argument", "Duplicate menu item in order.");
        }
        seen.add(item.menuItemId);

        const menuRef = restaurantRef.collection("menuItems").doc(item.menuItemId);
        const menuSnap = await t.get(menuRef);
        if (!menuSnap.exists) {
          throw new functions.https.HttpsError("not-found", "A menu item is no longer available.");
        }
        const menu = menuSnap.data()!;
        if (!menu.isAvailable) {
          throw new functions.https.HttpsError("failed-precondition", "A menu item is unavailable.");
        }
        const price = Number(menu.price);
        if (!Number.isFinite(price) || price < 0) {
          throw new functions.https.HttpsError("internal", "Invalid menu price.");
        }
        // Stock handling — same as client fallback, transactional
        const enabled = menu.trackStock === true || (menu as { stockEnabled?: boolean }).stockEnabled === true;
        if (enabled) {
          const stock = Number(menu.stockQuantity);
          const availableStock = Number.isFinite(stock) ? stock : 0;
          if (availableStock <= 0) {
            throw new functions.https.HttpsError("failed-precondition", `${menu.name || "Item"} is out of stock.`);
          }
          if (availableStock < qty) {
            throw new functions.https.HttpsError("failed-precondition", `${menu.name || "Item"} has only ${availableStock} left.`);
          }
          stockUpdates.push({ ref: menuRef, newQty: availableStock - qty });
        }
        orderItems.push({
          menuItemId: item.menuItemId,
          itemName: menu.name || "",
          price,
          quantity: qty,
          specialInstruction: (item.specialInstruction || "").slice(0, 300),
          restaurantId: data.restaurantId,
          tableId: data.tableId,
          qrToken: data.qrToken,
        });
        totalAmount += price * qty;
      }

      if (orderItems.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Order is empty.");
      }
      if (totalAmount <= 0) {
        throw new functions.https.HttpsError("invalid-argument", "Order total must be greater than 0.");
      }

      const gstAmount = Math.round(totalAmount * (gstPercent / 100) * 100) / 100;
      const serviceChargeAmount = Math.round(totalAmount * (serviceChargePercent / 100) * 100) / 100;
      const grandTotal = Math.round((totalAmount + gstAmount + serviceChargeAmount) * 100) / 100;

      t.create(orderRef, {
        restaurantId: data.restaurantId,
        tableId: data.tableId,
        qrToken: data.qrToken,
        tableNumber: table.tableNumber,
        customerSessionId: data.customerSessionId || randomToken(),
        status: "PLACED",
        totalAmount,
        gstPercent,
        gstAmount,
        serviceChargePercent,
        serviceChargeAmount,
        grandTotal,
        paymentStatus: "PENDING",
        specialInstructions: (data.specialInstructions || "").slice(0, 500),
        trackingToken,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const itemsCol = orderRef.collection("items");
      orderItems.forEach((oi) => {
        t.create(itemsCol.doc(), {
          ...oi,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      for (const su of stockUpdates) {
        const upd: Record<string, unknown> = {
          stockQuantity: su.newQty,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (su.newQty <= 0) upd.isAvailable = false;
        t.update(su.ref, upd);
      }
    });

    return { orderId: orderRef.id, trackingToken };
  }
);

/**
 * Creates a kitchen staff member: a Firebase Auth user bound to the caller's
 * restaurant with KITCHEN role. Only the owner of the restaurant may call this.
 */
export const createKitchenStaff = functions.https.onCall(
  async (data: CreateStaffInput, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }

    if (!data || !data.restaurantId || !data.fullName || !data.email || !data.password) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const ownerUid = context.auth.uid;

    const restaurantSnap = await db.doc(`restaurants/${data.restaurantId}`).get();
    if (!restaurantSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Restaurant not found.");
    }
    if (restaurantSnap.data()!.ownerId !== ownerUid) {
      throw new functions.https.HttpsError("permission-denied", "You do not own this restaurant.");
    }

    const user = await admin.auth().createUser({
      email: data.email,
      password: data.password,
      displayName: data.fullName,
    });

    const staffRef = restaurantSnap.ref.collection("staff").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await staffRef.set({
      uid: user.uid,
      fullName: data.fullName,
      email: data.email,
      role: "KITCHEN",
      isActive: true,
      createdAt: now,
    });

    await db.doc(`users/${user.uid}`).set(
      {
        uid: user.uid,
        fullName: data.fullName,
        email: data.email,
        role: "KITCHEN",
        restaurantId: data.restaurantId,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return { staffId: staffRef.id };
  }
);

/**
 * Creates a staff member (KITCHEN or WAITER) via Admin SDK.
 * Preferred path for owner dashboard — does NOT switch the owner's browser session.
 * Falls back to secondary-app on client if functions not deployed.
 */
export const createStaff = functions.https.onCall(
  async (data: CreateStaffInput & { role: "KITCHEN" | "WAITER" }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }
    if (!data || !data.restaurantId || !data.fullName || !data.email || !data.password || !data.role) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }
    if (data.role !== "KITCHEN" && data.role !== "WAITER") {
      throw new functions.https.HttpsError("invalid-argument", "Role must be KITCHEN or WAITER.");
    }
    const ownerUid = context.auth.uid;
    const restaurantSnap = await db.doc(`restaurants/${data.restaurantId}`).get();
    if (!restaurantSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Restaurant not found.");
    }
    if (restaurantSnap.data()!.ownerId !== ownerUid) {
      throw new functions.https.HttpsError("permission-denied", "You do not own this restaurant.");
    }
    // Ensure email not already used as staff in this restaurant (optional guard)
    const existingStaff = await restaurantSnap.ref
      .collection("staff")
      .where("email", "==", data.email)
      .limit(1)
      .get();
    if (!existingStaff.empty) {
      throw new functions.https.HttpsError("already-exists", "A staff member with this email already exists for this restaurant.");
    }

    let user: admin.auth.UserRecord;
    try {
      user = await admin.auth().createUser({
        email: data.email,
        password: data.password,
        displayName: data.fullName,
      });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "auth/email-already-exists" || err?.code === "auth/email-already-in-use") {
        throw new functions.https.HttpsError("already-exists", "This email is already registered.");
      }
      throw new functions.https.HttpsError("internal", "Unable to create staff account.");
    }

    const staffRef = restaurantSnap.ref.collection("staff").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await staffRef.set({
      uid: user.uid,
      fullName: data.fullName,
      email: data.email,
      role: data.role,
      isActive: true,
      createdAt: now,
    });

    await db.doc(`users/${user.uid}`).set(
      {
        uid: user.uid,
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        restaurantId: data.restaurantId,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return { staffId: staffRef.id, uid: user.uid };
  }
);

// ---------------------------------------------------------------------------
// AI Ordering — Groq (Voice) + Gemini (Natural Language)
// Voice Ordering is powered by browser Web Speech API (SpeechRecognition) for
// transcription plus Groq LLM (llama-3.1-8b-instant) for intent parsing.
// Groq does NOT perform audio transcription — it only parses the transcript
// into structured order intent. This is the correct architecture for the
// supplied gsk_... key (Groq, not xAI Grok).
// ---------------------------------------------------------------------------

interface AiMenuItem {
  id: string;
  name: string;
  category: string;
  description: string;
  available: boolean;
}

interface AiOrderIntent {
  items: Array<{ name: string; quantity: number }>;
  notes: string;
}

interface AiNaturalLanguageResult {
  matches: Array<{ name: string; quantity?: number }>;
  noMatch?: boolean;
  reason?: string;
}

interface AiVoiceInput {
  restaurantId: string;
  transcript: string;
}

interface AiNaturalInput {
  restaurantId: string;
  query: string;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u0B80-\u0BFF\s]/g, " ").trim();
}

function tamilNumberToInt(token: string): number | null {
  const map: Record<string, number> = {
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "onnu": 1, "onru": 1, "rendu": 2, "randu": 2, "munnu": 3, "moonru": 3, "naalu": 4, "ainthu": 5, "aaru": 6, "elu": 7, "ettu": 8, "onbathu": 9, "pathu": 10,
    "1-": 1, "2-": 2, // placeholder
    "oru": 1, "irandu": 2,
    "ஒன்று": 1, "இரண்டு": 2, "மூன்று": 3, "நான்கு": 4, "ஐந்து": 5,
  };
  const t = token.toLowerCase().trim();
  if (map[t] != null) return map[t];
  const n = parseInt(t, 10);
  if (Number.isFinite(n) && n > 0 && n < 100) return n;
  return null;
}

// Tamil dish transliteration helper for server
function transliterateForServer(s: string): string {
  const map: Record<string, string> = {
    "பிரியாணி": "biryani",
    "பிரியாணீ": "biryani",
    "தோசை": "dosa",
    "தோசா": "dosa",
    "இட்லி": "idli",
    "பரோட்டா": "parotta",
    "சிக்கன்": "chicken",
    "மட்டன்": "mutton",
    "பன்னீர்": "paneer",
    "ஜூஸ்": "juice",
    "காபி": "coffee",
    "தேநீர்": "tea",
    "சாதம்": "rice",
    "கறி": "curry",
    "மசாலா": "masala",
    "பட்டர்": "butter",
  };
  let out = s;
  for (const [tamil, eng] of Object.entries(map)) {
    out = out.split(tamil).join(eng);
  }
  return out;
}

// Deterministic fallback parser — no AI, no hallucination, matches menu names in transcript
function fallbackParseVoice(transcript: string, menu: AiMenuItem[]): AiOrderIntent {
  const translit = transliterateForServer(transcript);
  const lower = normalizeForMatch(translit);
  // Very small stop-word list, keep Tamil/Tanglish tokens
  const tokens = lower.split(/\s+/).filter(Boolean);
  const result: Array<{ name: string; quantity: number }> = [];
  const used = new Set<string>();

  // Build name index: normalized name -> menu item
  const nameIndex = menu.map((m) => ({ item: m, norm: normalizeForMatch(m.name) }));
  // Sort by longest name first to prefer multi-word matches (e.g., "chicken biryani" before "biryani")
  nameIndex.sort((a, b) => b.norm.length - a.norm.length);

  let i = 0;
  while (i < tokens.length) {
    // Look ahead quantity: token is number? e.g., "2", "two", "rendu", "இரண்டு"
    let qty: number | null = tamilNumberToInt(tokens[i]);
    let qtyConsumed = 0;
    if (qty != null) {
      qtyConsumed = 1;
    } else {
      // No explicit quantity — default 1 if next tokens form a dish name
      qty = 1;
    }

    // Try to match longest dish name starting at i+qtyConsumed
    let matched: AiMenuItem | null = null;
    let matchedLen = 0;
    for (const { item, norm } of nameIndex) {
      const nameTokens = norm.split(/\s+/).filter(Boolean);
      const start = i + qtyConsumed;
      if (start + nameTokens.length > tokens.length) continue;
      const slice = tokens.slice(start, start + nameTokens.length).join(" ");
      if (slice === norm || lower.includes(norm)) {
        // Check if slice exactly matches or is contained — prefer exact adjacency for quantity case
        if (slice === norm) {
          matched = item;
          matchedLen = nameTokens.length;
          break;
        }
        // Fallback containment: if transcript contains the dish name anywhere and not yet used
        if (!used.has(item.id) && lower.includes(norm)) {
          // For containment we still need to know how many tokens to consume — use name length
          // But ensure we don't double-count overlapping — we will mark as used and continue scanning
          matched = item;
          matchedLen = 0; // don't advance i, just record
          break;
        }
      }
    }

    if (matched) {
      if (!used.has(matched.id)) {
        result.push({ name: matched.name, quantity: qty! });
        used.add(matched.id);
      } else {
        // If already used, increment quantity
        const ex = result.find((r) => r.name === matched!.name);
        if (ex) ex.quantity += qty!;
      }
      if (matchedLen > 0) {
        i += qtyConsumed + matchedLen;
      } else {
        i += 1;
      }
    } else {
      i += 1;
    }
    // Safety: prevent infinite loop if transcript is long but no matches
    if (result.length > 20) break;
  }

  // Also handle simple containment for any menu items not yet captured (e.g., user said "biryani" without quantity prefix but we missed due to tokenization)
  // This is a second pass: for each menu item, if its normalized name appears in transcript and not yet in result, add with qty 1
  // But only if we haven't already handled that item
  for (const { item, norm } of nameIndex) {
    if (used.has(item.id)) continue;
    if (lower.includes(norm)) {
      result.push({ name: item.name, quantity: 1 });
      used.add(item.id);
      if (result.length > 20) break;
    }
  }

  // Deduplicate by name sum quantities
  const dedup = new Map<string, number>();
  for (const r of result) {
    dedup.set(r.name, (dedup.get(r.name) || 0) + r.quantity);
  }
  const items = Array.from(dedup.entries()).map(([name, quantity]) => ({ name, quantity: Math.min(quantity, 20) }));

  return { items, notes: "" };
}

function fallbackParseNatural(query: string, menu: AiMenuItem[]): AiNaturalLanguageResult {
  const transliterated = transliterateTamilFoodWords(query);
  const lower = normalizeForMatch(transliterated);
  void lower.match(/under\s*(\d+)|below\s*(\d+)|<\s*(\d+)|less than\s*(\d+)/);
  const wantsVeg = /veg|vegetarian|சைவ|veg item|saiva/i.test(query);
  const wantsSpicy = /spicy|காரம|kaaram/i.test(query);
  const wantForTwo = /two|2 people|for two|rendu per|irandu/i.test(lower);

  // PRIORITY 1: Exact normalized name match — if query is exactly a dish name, return that single item
  const exact = menu.find((m) => normalizeForMatch(m.name) === lower || normalizeForMatch(transliterated) === normalizeForMatch(m.name));
  if (exact) {
    const qty = wantForTwo ? 2 : 1;
    return { matches: [{ name: exact.name, quantity: qty }] };
  }
  // Also check if lower contains an exact dish name as a whole (e.g., "Chicken Biryani" query)
  const exactContained = menu.find((m) => {
    const normName = normalizeForMatch(m.name);
    return lower === normName || lower.includes(` ${normName} `) || lower.startsWith(`${normName} `) || lower.endsWith(` ${normName}`);
  });
  if (exactContained) {
    const qty = wantForTwo ? 2 : 1;
    return { matches: [{ name: exactContained.name, quantity: qty }] };
  }

  // Simple filter: available items, price unknown here (we don't have price in AiMenuItem minimal)
  // So we can only return matches based on name/description/category containing keywords
  const keywords = lower.split(/\s+/).filter((w) => w.length > 2 && !["want","give","something","under","with","for","people","item","venum","vendum","enakku","rendu","oru","kudu","pannunga"].includes(w));
  const scored = menu
    .filter((m) => m.available)
    .map((m) => {
      const text = normalizeForMatch(`${m.name} ${m.category} ${m.description}`);
      let score = 0;
      for (const kw of keywords) {
        // For specific queries like "Chicken Biryani", require both tokens to match for high score
        // Only count if the dish actually contains the keyword as a whole word, not just substring "chicken" in "chicken"
        const kwNorm = normalizeForMatch(kw);
        if (text.split(/\s+/).includes(kwNorm) || text.includes(kwNorm)) {
          // Boost if the menu item name exactly contains the keyword
          if (normalizeForMatch(m.name).includes(kwNorm)) score += 3;
          else score += 1;
        }
      }
      if (wantsVeg && /veg|paneer|veg/i.test(text)) score += 1; // reduced from 3 to avoid over-boosting veg for chicken query
      if (wantsSpicy && /spicy|chilli|pepper|masala/i.test(text)) score += 1;
      // Strong penalty for unrelated: if query is "Chicken Biryani" (2 tokens) and dish is "Chicken 65" (only 1 token match), score will be lower than exact
      return { item: m, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (scored.length === 0) return { matches: [], noMatch: true, reason: "No matching item is currently available." };
  // If top score is significantly higher than second, and query was specific, return only top
  if (scored.length > 1 && scored[0].score >= 6 && scored[0].score > scored[1].score * 1.5) {
    const qty = wantForTwo ? 2 : 1;
    return { matches: [{ name: scored[0].item.name, quantity: qty }] };
  }
  // For "for two people" we could suggest quantity 2 for top result, but natural language is recommendation, not cart add — so return matches with default 1
  const qty = wantForTwo ? 2 : 1;
  return { matches: scored.map((s) => ({ name: s.item.name, quantity: qty })) };
}

// Tamil dish transliteration for server-side fallback
function transliterateTamilFoodWords(s: string): string {
  const map: Record<string, string> = {
    "பிரியாணி": "biryani",
    "பிரியாணீ": "biryani",
    "தோசை": "dosa",
    "தோசா": "dosa",
    "இட்லி": "idli",
    "பரோட்டா": "parotta",
    "சிக்கன்": "chicken",
    "மட்டன்": "mutton",
    "பன்னீர்": "paneer",
    "ஜூஸ்": "juice",
    "காபி": "coffee",
    "தேநீர்": "tea",
    "சாதம்": "rice",
    "கறி": "curry",
    "மசாலா": "masala",
    "பட்டர்": "butter",
  };
  let out = s;
  for (const [tamil, eng] of Object.entries(map)) {
    out = out.split(tamil).join(eng);
  }
  return out;
}

async function fetchMenuForAi(restaurantId: string): Promise<AiMenuItem[]> {
  const snap = await db.collection(`restaurants/${restaurantId}/menuItems`).where("isAvailable", "==", true).limit(100).get();
  // Also fetch categories for name resolution
  const catSnap = await db.collection(`restaurants/${restaurantId}/categories`).limit(50).get();
  const catMap = new Map<string, string>();
  catSnap.forEach((d) => catMap.set(d.id, (d.data().name as string) || ""));
  const items: AiMenuItem[] = [];
  snap.forEach((d) => {
    const data = d.data() as { name?: string; categoryId?: string; description?: string; isAvailable?: boolean };
    items.push({
      id: d.id,
      name: String(data.name || ""),
      category: catMap.get(String(data.categoryId || "")) || String(data.categoryId || ""),
      description: String(data.description || ""),
      available: data.isAvailable !== false,
    });
  });
  // Limit to 50 items max to control prompt size / cost
  return items.slice(0, 50);
}

async function callGroq(prompt: string, menu: AiMenuItem[]): Promise<string | null> {
  // Supplied key is gsk_... which is Groq (not xAI Grok xai-...). Keep GROQ_API_KEY as primary,
  // support GROK_API_KEY as alias for backwards compat if user configured that name.
  const key = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
  if (!key) return null;
  // Basic format validation: Groq keys start with gsk_
  if (!key.startsWith("gsk_")) {
    // If key does not match Groq format, treat as not configured — fallback will handle
    return null;
  }
  try {
    // Groq uses OpenAI-compatible endpoint
    const body = {
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: `You are a strict restaurant order parser for SmartDine. You MUST only return valid JSON. Current restaurant menu (available only): ${menu.map((m) => m.name).join(", ")}. Rules: 1) Only use names EXACTLY from menu — never invent, never translate menu names. 2) If user says "biryani" and multiple biryanis exist (Chicken, Mutton, Veg), do NOT guess — return ambiguous. 3) Never invent prices, GST, stock, or items. 4) Quantities 1-20. 5) Handle English, Tamil, Tanglish, mixed: "2 idli kudu"→ Idli×2, "oru dosa venum"→ Dosa×1, "rendu dosa venum"→ Dosa×2, "enakku rendu dosa venum"→ Dosa×2, "oru chicken biryani and 2 parotta add pannunga"→ Chicken Biryani×1, Parotta×2, "enakku oru chicken biryani venum"→ Chicken Biryani×1, "one paneer dosa add pannu"→ Paneer Dosa×1, Tamil script "எனக்கு இரண்டு தோசை"→ Dosa×2. Treat oru/onnu/rendu/randu=1/2, venum/vendum/kudu/kudunga/add pannu/pannunga as ordering intent, not dish. Output JSON: {"items":[{"name":"Exact Menu Name","quantity":2}], "notes":""}. If no match, return {"items":[], "notes":"no match"}.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" },
    };
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    return content || null;
  } catch {
    return null;
  }
}

async function callGemini(prompt: string, menu: AiMenuItem[]): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const geminiPrompt = `You are a strict restaurant recommender for SmartDine. Menu (available): ${menu.map((m) => `${m.name} (${m.category}: ${m.description})`).join(" | ")}. User: "${prompt}". Task: Return ONLY JSON with actual menu names that match. For "vegetarian under 400 for two" return vegetarian items. For Tamil/Tanglish "rendu biryani venum" → {"matches":[{"name":"Chicken Biryani","quantity":2}]}, "2 idli kudu"→ Idli×2, "oru dosa venum"→ Dosa×1, "enakku rendu dosa venum"→ Dosa×2, "எனக்கு இரண்டு தோசை"→ Dosa×2, "rang" etc. Never translate menu names, only use exact names from menu. If no match return {"matches":[],"noMatch":true}. Output JSON: {"matches":[{"name":"Exact Name","quantity":1}]}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: geminiPrompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 500 },
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || null;
  } catch {
    return null;
  }
}

function validateAiVoiceResult(raw: unknown, menu: AiMenuItem[]): AiOrderIntent {
  const menuNames = new Set(menu.map((m) => m.name));
  if (!raw || typeof raw !== "object") return { items: [], notes: "" };
  const obj = raw as Record<string, unknown>;
  const itemsRaw = obj.items;
  if (!Array.isArray(itemsRaw)) return { items: [], notes: String(obj.notes || "") };
  const items: Array<{ name: string; quantity: number }> = [];
  const seen = new Set<string>();
  for (const it of itemsRaw) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    const name = String(rec.name || "").trim();
    const qty = Math.floor(Number(rec.quantity));
    if (!name || !menuNames.has(name)) continue; // strict: must be exact menu name, no hallucination
    if (!Number.isFinite(qty) || qty <= 0 || qty > 20) continue;
    if (seen.has(name)) {
      const ex = items.find((x) => x.name === name);
      if (ex) ex.quantity = Math.min(20, ex.quantity + qty);
      continue;
    }
    seen.add(name);
    items.push({ name, quantity: qty });
  }
  return { items, notes: String(obj.notes || "").slice(0, 500) };
}

function validateAiNaturalResult(raw: unknown, menu: AiMenuItem[]): AiNaturalLanguageResult {
  const menuNames = new Set(menu.map((m) => m.name));
  if (!raw || typeof raw !== "object") return { matches: [], noMatch: true, reason: "No matching item is currently available." };
  const obj = raw as Record<string, unknown>;
  if (obj.noMatch === true && Array.isArray(obj.matches) && obj.matches.length === 0) {
    return { matches: [], noMatch: true, reason: String(obj.reason || "No matching item is currently available.") };
  }
  const matchesRaw = obj.matches;
  if (!Array.isArray(matchesRaw)) return { matches: [], noMatch: true, reason: "No matching item is currently available." };
  const matches: Array<{ name: string; quantity?: number }> = [];
  const seen = new Set<string>();
  for (const it of matchesRaw) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    const name = String(rec.name || "").trim();
    if (!menuNames.has(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    const qty = rec.quantity != null ? Math.floor(Number(rec.quantity)) : 1;
    matches.push({ name, quantity: Number.isFinite(qty) && qty > 0 ? Math.min(qty, 20) : 1 });
    if (matches.length >= 5) break;
  }
  if (matches.length === 0) return { matches: [], noMatch: true, reason: "No matching item is currently available." };
  return { matches, reason: String(obj.reason || "") };
}

export const parseVoiceOrder = functions.https.onCall(async (data: AiVoiceInput, context) => {
  if (!data || typeof data.restaurantId !== "string" || typeof data.transcript !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Missing restaurantId or transcript.");
  }
  const restaurantId = data.restaurantId.trim();
  const transcript = data.transcript.trim().slice(0, 500);
  if (!restaurantId || !transcript) {
    throw new functions.https.HttpsError("invalid-argument", "Empty transcript.");
  }
  if (transcript.length < 2) {
    throw new functions.https.HttpsError("invalid-argument", "Transcript too short.");
  }

  const restaurantSnap = await db.doc(`restaurants/${restaurantId}`).get();
  if (!restaurantSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Restaurant not found.");
  }

  const menu = await fetchMenuForAi(restaurantId);
  if (menu.length === 0) {
    return { items: [], notes: "", error: "No menu available" };
  }

  // Try Groq first (voice intent via transcript), fallback deterministic
  // Note: Voice capture itself is browser Web Speech API, Groq only parses text
  let rawText: string | null = null;
  try {
    rawText = await callGroq(transcript, menu);
  } catch {
    rawText = null;
  }

  let parsed: unknown = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  let intent: AiOrderIntent;
  if (parsed) {
    intent = validateAiVoiceResult(parsed, menu);
    // If AI returned empty but fallback would find something, prefer fallback for Tamil/Tanglish robustness
    if (intent.items.length === 0) {
      const fb = fallbackParseVoice(transcript, menu);
      if (fb.items.length > 0) intent = validateAiVoiceResult(fb, menu);
    }
  } else {
    intent = validateAiVoiceResult(fallbackParseVoice(transcript, menu), menu);
  }

  // Handle ambiguous: if transcript contains "biryani" and multiple biryanis in menu, check if AI collapsed to one
  // We signal ambiguous when transcript has a generic token that matches >1 menu item
  const lower = normalizeForMatch(transcript);
  const ambiguous: Array<{ query: string; options: string[] }> = [];
  const genericTokens = ["biryani", "curry", "masala", "dosa", "juice", "coke", "biriyani"];
  for (const tok of genericTokens) {
    if (lower.includes(tok)) {
      const opts = menu.filter((m) => normalizeForMatch(m.name).includes(tok)).map((m) => m.name);
      if (opts.length > 1) {
        const already = intent.items.some((it) => opts.includes(it.name));
        if (!already) {
          ambiguous.push({ query: tok, options: opts.slice(0, 5) });
        } else if (intent.items.filter((it) => opts.includes(it.name)).length === 0) {
          // AI didn't pick any of the options but should have asked
        }
      }
    }
  }

  // Limit items to 10, quantities already clamped
  const limited = intent.items.slice(0, 10);

  return {
    items: limited,
    notes: intent.notes,
    ambiguous: ambiguous.slice(0, 3),
    transcript,
  };
});

export const parseNaturalLanguageOrder = functions.https.onCall(async (data: AiNaturalInput, context) => {
  if (!data || typeof data.restaurantId !== "string" || typeof data.query !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Missing restaurantId or query.");
  }
  const restaurantId = data.restaurantId.trim();
  const query = data.query.trim().slice(0, 500);
  if (!restaurantId || !query) {
    throw new functions.https.HttpsError("invalid-argument", "Empty query.");
  }
  if (query.length < 2) {
    throw new functions.https.HttpsError("invalid-argument", "Query too short.");
  }

  const restaurantSnap = await db.doc(`restaurants/${restaurantId}`).get();
  if (!restaurantSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Restaurant not found.");
  }

  const menu = await fetchMenuForAi(restaurantId);
  if (menu.length === 0) {
    return { matches: [], noMatch: true, reason: "No matching item is currently available." };
  }

  let rawText: string | null = null;
  try {
    rawText = await callGemini(query, menu);
  } catch {
    rawText = null;
  }

  let parsed: unknown = null;
  if (rawText) {
    try {
      // Gemini may return markdown fenced json
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = null;
    }
  }

  let result: AiNaturalLanguageResult;
  if (parsed) {
    result = validateAiNaturalResult(parsed, menu);
    if (result.matches.length === 0 && result.noMatch) {
      const fb = fallbackParseNatural(query, menu);
      if (!fb.noMatch) result = validateAiNaturalResult(fb, menu);
    }
  } else {
    result = validateAiNaturalResult(fallbackParseNatural(query, menu), menu);
  }

  return {
    matches: result.matches.slice(0, 5),
    noMatch: result.noMatch,
    reason: result.reason,
    query,
  };
});
