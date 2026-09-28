import type { MenuItem, MenuCategory } from "../types/menu";
import type { OrderIntent } from "../types/aiOrder";
import {
  fallbackParseVoiceClient,
  normalizeMenuName,
  resolveNaturalIntent,
  resolveVoiceIntent,
  transliterateTamilFoodWords,
} from "./aiMenuMatcher";
import { answerMenuQuestion, scopeHit, type AnswerLang } from "./naturalLanguageOrderService";
import { formatCurrency } from "../utils/formatting";

export type ChatLanguage = AnswerLang;

export interface ChatCartLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface ChatMenuContext {
  restaurantName: string;
  description: string;
  address: string;
  phone: string;
  isActive: boolean;
  categories: MenuCategory[];
  cart: ChatCartLine[];
  cartTotal: number;
  language: ChatLanguage;
  /** Follow-up context: ids + label from the previous listing. */
  lastIds?: string[];
  lastLabel?: string;
}

export interface ChatSuggestion {
  menuItemId: string;
  name: string;
  price: number;
  available: boolean;
  category: string;
}

export interface ChatReply {
  /** Localized assistant text (facts always from the real menu). */
  text: string;
  /** Validated suggestion cards (real ids, menu prices, availability flags). */
  suggestions?: ChatSuggestion[];
  /** Order intent → existing OrderIntentPreview → explicit confirm. */
  intent?: OrderIntent;
  ambiguous?: Array<{ query: string; options: Array<{ id: string; name: string; price: number }> }>;
  noMatch?: boolean;
  /** Scope for safe follow-ups ("which is cheapest?", "under 300"). */
  scopeIds?: string[];
  scopeLabel?: string;
}

/** Chat UI strings per language. Item names/prices stay as authored. */
const STR: Record<
  ChatLanguage,
  {
    help: string;
    noMatch: string;
    ambiguousAsk: string;
    confirmAsk: string;
    addedNone: string;
    cartEmpty: string;
    hoursMissing: string;
    needMenuFirst: string;
  }
> = {
  en: {
    help: "I can help with this restaurant's menu — prices, availability, categories, suggestions, and orders. Try “What biriyani do you have?” or “Give me two chicken biriyani”.",
    noMatch: "I couldn't find that in this restaurant's menu. Try a dish name like “dosa” or “biriyani”, or browse the menu.",
    ambiguousAsk: "I found more than one match. Please choose one.",
    confirmAsk: "Please confirm in the order box to add it to your cart.",
    addedNone: "Nothing was added to your cart.",
    cartEmpty: "Your cart is empty right now.",
    hoursMissing: "Opening hours aren't available in SmartDine right now.",
    needMenuFirst: "The menu is still loading. Please try again in a moment.",
  },
  tanglish: {
    help: "Indha restaurant menu pathi help pannuven — price, availability, categories, suggestions, orders. “What biriyani do you have?” illana “Give me two chicken biriyani” try pannunga.",
    noMatch: "Indha restaurant menu-la adhu kedaikala. “dosa” illana “biriyani” maadhiri dish name sollunga, illana menu browse pannunga.",
    ambiguousAsk: "Onnu vida adhigama match aachu. Onnu choose pannunga.",
    confirmAsk: "Cart-la add panna order box-la confirm pannunga.",
    addedNone: "Cart-la edhuvum add aagala.",
    cartEmpty: "Unga cart ippo empty.",
    hoursMissing: "Restaurant opening time SmartDine-la currently available illa.",
    needMenuFirst: "Menu innum load aagudhu. Konjam time kazhichu try pannunga.",
  },
  ta: {
    help: "இந்த உணவகத்தின் மெனு பற்றி உதவுவேன் — விலை, கிடைக்குமா, வகைகள், பரிந்துரைகள், ஆர்டர்கள். “என்ன பிரியாணி இருக்கு?” அல்லது “இரண்டு சிக்கன் பிரியாணி வேண்டும்” என்று கேளுங்கள்.",
    noMatch: "இந்த உணவக மெனுவில் அது கிடைக்கவில்லை. “தோசை” அல்லது “பிரியாணி” போன்ற உணவுப் பெயரைச் சொல்லுங்கள்.",
    ambiguousAsk: "ஒன்றுக்கு மேற்பட்ட பொருத்தங்கள் கிடைத்தன. ஒன்றைத் தேர்ந்தெடுங்கள்.",
    confirmAsk: "கார்ட்டில் சேர்க்க ஆர்டர் பெட்டியில் உறுதிப்படுத்துங்கள்.",
    addedNone: "கார்ட்டில் எதுவும் சேர்க்கப்படவில்லை.",
    cartEmpty: "உங்கள் கார்ட் தற்போது காலியாக உள்ளது.",
    hoursMissing: "உணவகத்தின் திறக்கும் நேரம் தற்போது SmartDine-ல் கிடைக்கவில்லை.",
    needMenuFirst: "மெனு இன்னும் ஏற்றப்படுகிறது. சிறிது நேரம் கழித்து முயற்சிக்கவும்.",
  },
};

const MEAT_WORDS = [
  "chicken", "mutton", "fish", "prawn", "crab", "egg", "beef", "pork",
  "keema", "meat", "duck", "lobster", "squid", "tuna", "salmon", "anchovy",
];

const SPICY_WORDS = [
  "spicy", "masala", "chilli", "chili", "pepper", "schezwan", "chettinad", "kaaram", "காரம",
];

const LIGHT_WORDS = ["soup", "salad", "idli", "juice", "tea", "rasam", "light", "லேசான"];

function priceOf(m: MenuItem): number {
  return Number.isFinite(m.price) ? m.price : 0;
}

function isAvailableItem(m: MenuItem): boolean {
  if (m.isAvailable !== true) return false;
  const track = m.trackStock === true || m.stockEnabled === true;
  if (track && Number(m.stockQuantity) <= 0) return false;
  return true;
}

/**
 * Conservative vegetarian check: true only when veg/paneer/vegetarian is
 * explicitly present (name or real category) AND no meat/egg words appear.
 * Unknown items are NOT veg — never inferred. Pure — unit tested.
 */
export function isVegSafe(m: MenuItem, catName: string): boolean {
  const hay = `${normalizeMenuName(m.name)} ${normalizeMenuName(catName)}`;
  if (/(^| )non( |$)/.test(hay.replace(/-/g, " ")) || hay.includes("non veg") || hay.includes("nonveg")) return false;
  if (MEAT_WORDS.some((w) => hay.includes(w))) return false;
  return hay.includes("veg") || hay.includes("paneer") || hay.includes("vegetarian");
}

function isSpicyStyle(m: MenuItem, catName: string): boolean {
  const hay = `${normalizeMenuName(m.name)} ${normalizeMenuName(catName)} ${normalizeMenuName(m.description || "")}`;
  return SPICY_WORDS.some((w) => hay.includes(w));
}

/** Price cap like "under ₹300", "200 ku keela", "₹200 க்குள்". Pure. */
export function extractPriceCap(text: string): number | null {
  const t = text.replace(/₹/g, "₹ ").replace(/,/g, "");
  const patterns = [
    /(?:under|below|less than|within|keela|keezh|kulla|kizh|க்குள்|கீழ்|ரூபாய்க்குள்)\s*₹?\s*(\d{2,4})/i,
    /₹\s*(\d{2,4})\s*(?:under|below|less|keela|kulla|க்குள்|கீழ்|for|kulla)/i,
    /(\d{2,4})\s*(?:ku|kku)\s*(?:keela|kulla|kizh)/i,
    /(\d{2,4})\s*(?:க்குள்|கீழ்)/,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= 20 && n <= 5000) return n;
    }
  }
  return null;
}

function toSuggestion(m: MenuItem, catName: string, quantity = 1): ChatSuggestion & { quantity: number } {
  return {
    menuItemId: m.id,
    name: m.name,
    price: priceOf(m),
    available: isAvailableItem(m),
    category: catName,
    quantity,
  };
}

/**
 * Deterministic chat brain: restaurant/cart/menu-Q&A/order/recommendations —
 * all grounded in the loaded Firestore menu. Returns follow-up scope so
 * "which is cheapest?" / "under 300" can reuse the previous listing safely.
 * Pure apart from no I/O at all — unit tested.
 */
export function answerChat(
  rawText: string,
  menu: MenuItem[],
  ctx: ChatMenuContext
): ChatReply {
  const lang = ctx.language;
  const S = STR[lang];
  const text = rawText.trim().slice(0, 500);
  if (!text) return { text: S.help };
  if (menu.length === 0) return { text: S.needMenuFirst };

  const catById = new Map(ctx.categories.map((c) => [c.id, c.name]));
  const catNameOf = (m: MenuItem) => catById.get(m.categoryId) || "";
  // Shared Tamil transliteration so dish/adjective words match one engine.
  const norm = normalizeMenuName(transliterateTamilFoodWords(text));
  const hasWord = (...words: string[]) =>
    words.some((w) => norm.includes(w));

  // --- Cart questions (all languages use "cart") ---
  if (norm.includes("cart")) {
    const fb = fallbackParseVoiceClient(text, menu);
    const resolved = resolveVoiceIntent(fb, menu);
    if (resolved.items.length > 0 || (resolved.ambiguous && resolved.ambiguous.length > 0)) {
      // "add X to cart" — an order, not a cart question.
    } else if (ctx.cart.length === 0) {
      return { text: S.cartEmpty };
    } else {
      const lines = ctx.cart.map((l) => `${l.name} × ${l.quantity} — ${formatCurrency(l.price * l.quantity)}`).join(", ");
      const summary =
        lang === "ta"
          ? `உங்கள் கார்ட்: ${lines}. மொத்தம் ${formatCurrency(ctx.cartTotal)}.`
          : lang === "tanglish"
            ? `Unga cart: ${lines}. Total ${formatCurrency(ctx.cartTotal)}.`
            : `Your cart: ${lines}. Total ${formatCurrency(ctx.cartTotal)}.`;
      return { text: summary };
    }
  }

  // --- Restaurant questions (only from real fields; never hallucinated) ---
  if (hasWord("opening", "opening hours", "open at", "open time", "timing", "closes", "closing", "what time", "thora", "திறக்கும்", "மூடும்", "நேரம்")) {
    if (hasWord("open") && hasWord("restaurant", "hotel", "shop", "kadai", "கடை") && !hasWord("hour", "time", "timing", "close", "closes", "closing")) {
      const open = ctx.isActive;
      return {
        text:
          lang === "ta"
            ? open ? `ஆம், ${ctx.restaurantName} தற்போது திறந்துள்ளது.` : `${ctx.restaurantName} தற்போது மூடப்பட்டுள்ளது.`
            : lang === "tanglish"
              ? open ? `Yes, ${ctx.restaurantName} ippo open.` : `${ctx.restaurantName} ippo closed.`
              : open ? `Yes, ${ctx.restaurantName} is open right now.` : `${ctx.restaurantName} is currently closed.`,
      };
    }
    return { text: S.hoursMissing };
  }
  if (hasWord("cuisine")) {
    const cats = ctx.categories.filter((c) => (c as { isActive?: boolean }).isActive !== false).map((c) => c.name);
    const list = cats.length > 0 ? cats.join(", ") : "";
    return {
      text:
        lang === "ta"
          ? `இங்கு கிடைக்கும் வகைகள்: ${list}.`
          : lang === "tanglish"
            ? `Inga iruka categories: ${list}.`
            : `This restaurant serves: ${list}.`,
      scopeIds: undefined,
      scopeLabel: undefined,
    };
  }
  if (hasWord("categor")) {
    const cats = ctx.categories.map((c) => c.name).join(", ");
    return {
      text:
        lang === "ta"
          ? `மெனு வகைகள்: ${cats}.`
          : lang === "tanglish"
            ? `Menu categories: ${cats}.`
            : `Menu categories: ${cats}.`,
    };
  }
  if (hasWord("address", "where", "location", "enga", "எங்கே", "reach", "direction")) {
    if (ctx.address) {
      return {
        text:
          lang === "ta"
            ? `${ctx.restaurantName} முகவரி: ${ctx.address}${ctx.phone ? `. தொலைபேசி: ${ctx.phone}` : ""}`
            : lang === "tanglish"
              ? `${ctx.restaurantName} address: ${ctx.address}${ctx.phone ? `. Phone: ${ctx.phone}` : ""}`
              : `${ctx.restaurantName} is at: ${ctx.address}${ctx.phone ? `. Phone: ${ctx.phone}` : ""}`,
      };
    }
    return { text: addressMissing(lang) };
  }
  if (hasWord("phone", "contact", "call", "number") && !hasWord("chicken 65", "65")) {
    if (ctx.phone) {
      return { text: lang === "ta" ? `தொலைபேசி: ${ctx.phone}` : `Phone: ${ctx.phone}` };
    }
    return { text: S.hoursMissing };
  }

  // --- Deterministic menu Q&A (same engine as Ask SmartDine) ---
  try {
    const qa = answerMenuQuestion(text, menu, catById, lang);
    if (qa) {
      const resolved = resolveVoiceIntentFree(qa, menu, catNameOf);
      if (resolved) return resolved;
    }
  } catch {
    // fall through to order parsing
  }

  // --- Order intent (same matcher + resolver as Voice/Ask) ---
  {
    const fb = fallbackParseVoiceClient(text, menu);
    const intent = resolveVoiceIntent(fb, menu);
    if (intent.items.length > 0) {
      const parts = intent.items
        .map((it) => {
          const m = menu.find((x) => x.id === it.menuItemId);
          return m ? `${m.name} × ${it.quantity}, ${formatCurrency(priceOf(m) * it.quantity)}` : "";
        })
        .filter(Boolean);
      const noteBit = intent.notes?.trim()
        ? lang === "ta"
          ? ` குறிப்பு: ${intent.notes.trim()}.`
          : lang === "tanglish"
            ? ` Note: ${intent.notes.trim()}.`
            : ` Note: ${intent.notes.trim()}.`
        : "";
      return { text: `${parts.join("; ")}.${noteBit} ${S.confirmAsk}`, intent };
    }
    if (intent.ambiguous && intent.ambiguous.length > 0) {
      const amb = intent.ambiguous.slice(0, 2).map((a) => ({
        query: a.query,
        options: a.options.slice(0, 5).map((o) => {
          const m = menu.find((x) => x.id === o.id);
          return { id: o.id, name: o.name, price: m ? priceOf(m) : 0 };
        }),
      }));
      const names = amb.flatMap((a) => a.options.map((o) => o.name)).slice(0, 5);
      return { text: `${S.ambiguousAsk} ${names.join(", ")}.`, ambiguous: amb };
    }
  }

  // --- Follow-up context: bare "cheapest" / "under <n>" reuse last listing ---
  if (ctx.lastIds && ctx.lastIds.length > 0) {
    const scoped = menu.filter((m) => ctx.lastIds!.includes(m.id) && isAvailableItem(m));
    if (/cheapest|cheap|kuraintha|குறைந்த|malivana|மலிவான/.test(norm) && scoped.length > 0) {
      const win = [...scoped].sort((a, b) => priceOf(a) - priceOf(b))[0];
      return {
        text:
          lang === "ta"
            ? `மலிவானது ${win.name}, ${formatCurrency(priceOf(win))}.`
            : lang === "tanglish"
              ? `Cheapest: ${win.name}, ${formatCurrency(priceOf(win))}.`
              : `The cheapest is ${win.name} at ${formatCurrency(priceOf(win))}.`,
        suggestions: [toSuggestion(win, catNameOf(win))],
        scopeIds: scoped.map((m) => m.id),
        scopeLabel: ctx.lastLabel,
      };
    }
    const cap = extractPriceCap(text);
    if (cap != null && scoped.length > 0 && !hasWord("biriyani", "dosa", "chicken", "pizza", "parotta", "idli", "juice", "rice", "noodle", "burger", "cake", "soup", "fish", "mutton", "paneer", "masala", "curry", "fry", "roll", "tea", "coffee", "sweet", "veg")) {
      const under = scoped.filter((m) => priceOf(m) <= cap).slice(0, 5);
      if (under.length > 0) {
        return {
          text: underListText(under, cap, lang),
          suggestions: under.map((m) => toSuggestion(m, catNameOf(m))),
          scopeIds: under.map((m) => m.id),
          scopeLabel: ctx.lastLabel,
        };
      }
    }
  }

  // --- Recommendations (deterministic, grounded, available-only) ---
  {
    const rec = recommend(text, menu, catNameOf, lang);
    if (rec) return rec;
  }

  // --- Nothing confident ---
  return { text: S.noMatch, noMatch: true };
}

function addressMissing(lang: ChatLanguage): string {
  return lang === "ta"
    ? "முகவரி தற்போது SmartDine-ல் கிடைக்கவில்லை."
    : lang === "tanglish"
      ? "Address SmartDine-la currently available illa."
      : "The address isn't available in SmartDine right now.";
}

/** Converts an answerMenuQuestion result into a chat reply (same resolver). */
function resolveVoiceIntentFree(
  qa: { matches: Array<{ name: string; quantity?: number }>; noMatch?: boolean; reason?: string; query: string; notes?: string; answer?: string },
  menu: MenuItem[],
  catNameOf: (m: MenuItem) => string
): ChatReply | null {
  // Re-resolve through the shared resolver for real id/price/availability.
  const intent = resolveNaturalIntent(qa, menu);
  if (intent.noMatch && !qa.answer) return null;
  if (intent.matches.length === 0) {
    return { text: qa.answer || "", noMatch: intent.noMatch };
  }
  const suggestions = intent.matches.map((mm) => {
    const m = menu.find((x) => x.id === mm.menuItemId)!;
    return toSuggestion(m, catNameOf(m), mm.quantity);
  });
  return {
    text: qa.answer || "",
    suggestions,
    scopeIds: suggestions.map((s) => s.menuItemId),
    scopeLabel: qa.query,
  };
}

function underListText(under: MenuItem[], cap: number, lang: ChatLanguage): string {
  const list = under.map((m) => `${m.name} at ${formatCurrency(priceOf(m))}`).join(", ");
  if (lang === "ta") return `₹${cap}-க்குள்: ${list}.`;
  if (lang === "tanglish") return `₹${cap} kulla: ${list}.`;
  return `Under ₹${cap}: ${list}.`;
}

const RECOMMEND_TRIGGERS = [
  "suggest", "recommend", "hungry", "tasty", "craving", "best", "popular", "favourite", "favorite",
  "light", "pasikku", "pasi", "sollu", "sollunga", "kooru", "venum suggest",
  "veg", "vegetarian", "vegan", "saiva", "சைவ",
  "drink", "drinks", "beverage", "dessert", "desserts",
];

function recommend(
  text: string,
  menu: MenuItem[],
  catNameOf: (m: MenuItem) => string,
  lang: ChatLanguage
): ChatReply | null {
  // Same shared transliteration so Tamil adjectives match one engine.
  const norm = normalizeMenuName(transliterateTamilFoodWords(text));
  const hasWord = (...words: string[]) => words.some((w) => norm.includes(w));
  const wantsRec =
    RECOMMEND_TRIGGERS.some((t) => norm.includes(t)) ||
    extractPriceCap(text) != null ||
    hasWord("veg", "vegetarian", "vegan", "saiva", "சைவ") ||
    hasWord("spicy", "kaaram", "காரம");
  if (!wantsRec) return null;

  const cap = extractPriceCap(text);
  const vegOnly = hasWord("veg", "vegetarian", "vegan", "saiva", "சைவ") && !hasWord("non veg", "nonveg", "non vegetarian");
  const spicyLike = hasWord("spicy", "kaaram", "காரம");

  // Food/category keywords = transcript tokens that hit real menu words.
  const keywords = norm.split(" ").filter((t) => t.length > 2);

  let pool = menu.filter((m) => isAvailableItem(m));
  if (cap != null) pool = pool.filter((m) => priceOf(m) <= cap);
  if (vegOnly) pool = pool.filter((m) => isVegSafe(m, catNameOf(m)));
  if (keywords.length > 0 && !vegOnly && cap == null) {
    // keep broad pool; scoring below ranks keyword hits first
  }
  const scored = pool.map((m) => {
    const hay = `${normalizeMenuName(m.name)} ${normalizeMenuName(catNameOf(m))}`;
    let score = 0;
    for (const k of keywords) {
      if (k.length < 3) continue;
      if (hay.includes(k)) score += k.length >= 5 ? 3 : 1;
      else if (scopeHit(k, hay)) score += 2;
    }
    if (spicyLike && isSpicyStyle(m, catNameOf(m))) score += 2;
    if (norm.includes("light") || norm.includes("லேசான")) {
      if (["soup", "salad", "idli", "juice", "tea", "rasam"].some((k) => hay.includes(k))) score += 3;
    }
    return { m, score };
  });
  const anySignal = keywords.some((k) => k.length >= 3) || vegOnly || cap != null || spicyLike;
  // A price cap or veg-only request is signal enough on its own (e.g. plain
  // "under ₹200" has no keyword hits but still means something).
  const needsHit = anySignal && cap == null && !vegOnly;
  const ranked = scored
    .filter((s) => (needsHit ? s.score > 0 : true))
    .sort((a, b) => b.score - a.score || priceOf(a.m) - priceOf(b.m))
    .slice(0, 5)
    .map((s) => s.m);
  if (ranked.length === 0) return null;
  const list = ranked.map((m) => `${m.name} at ${formatCurrency(priceOf(m))}`).join(", ");
  const intro =
    lang === "ta"
      ? `உங்களுக்கான பரிந்துரைகள்: ${list}.`
      : lang === "tanglish"
        ? `Unga suggestion: ${list}.`
        : `Here are some suggestions: ${list}.`;
  return {
    text: intro,
    suggestions: ranked.map((m) => toSuggestion(m, catNameOf(m))),
    scopeIds: ranked.map((m) => m.id),
    scopeLabel: text,
  };
}


