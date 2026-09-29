import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../lib/firebase";
import type { MenuItem } from "../types/menu";
import type { NaturalLanguageResult, NaturalLanguageIntent } from "../types/aiOrder";
import { resolveNaturalIntent } from "./aiMenuMatcher";
import { fallbackParseVoiceClient, findMenuMatch, normalizeMenuName, transliterateTamilFoodWords } from "./aiMenuMatcher";
import { formatCurrency } from "../utils/formatting";

const MAX_QUERY = 500;

// Tamil transliteration for natural language fallback
function transliterateTamilForNatural(s: string): string {
  const map: Record<string, string> = {
    "பிரியாணி": "biryani",
    "தோசை": "dosa",
    "தோசா": "dosa",
    "இட்லி": "idli",
    "பரோட்டா": "parotta",
    "சிக்கன்": "chicken",
    "மட்டன்": "mutton",
    "பன்னீர்": "paneer",
    "ஜூஸ்": "juice",
    "காபி": "coffee",
  };
  let out = s;
  for (const [tamil, eng] of Object.entries(map)) {
    out = out.split(tamil).join(eng);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic menu Q&A — answers questions from the SAME loaded menu using
// the SAME normalization/matcher as ordering. Never invents: every name,
// price, and availability comes from a real menu document. Returns null when
// the input looks like an order (or nothing answerable), letting the normal
// order-intent path handle it.
// ---------------------------------------------------------------------------

const LISTING_TRIGGERS = ["what", "which", "list", "show", "options", "menu", "have", "enna", "ena", "iruku", "iruka", "irukku", "kaatu", "kaattu", "kattu", "காட்டு"];
const ORDER_TRIGGERS = ["give", "kudu", "order", "venum", "vendum", "pannu", "pannunga", "add", "want", "get", "bring"];
const QUESTION_FILLER = new Set([
  "what", "which", "list", "show", "me", "the", "a", "an", "do", "does", "you", "your",
  "have", "has", "got", "is", "are", "there", "here", "any", "many", "much", "price",
  "cost", "rate", "how", "of", "for", "in", "on", "my", "enna", "ena", "irukku", "iruku", "iruka",
  "kidaikuma", "kedaikuma", "evlo", "evalavu", "evalo", "please",
  "tell", "about", "details", "detail", "sollu", "sollunga", "slu", "pathi", "patti",
  "epdi", "eppadi",
  "available", "availability", "stock", "cheapest", "cheap", "options", "option", "menu",
  "items", "item", "dishes", "dish", "food", "things",
  // Tanglish/Tamil question particles and locatives (never dish words).
  "ah", "aa", "aah", "la", "lae", "illa",
  "kaatu", "kaattu", "kattu", "kaatunga", "kaattunga",
  "kuraintha", "malivana", "ethana", "entha",
  "இருக்கு", "இருக்கா", "எவ்வளவு", "விலை", "கிடைக்குமா", "காட்டு", "காட்டுங்கள்",
  "பற்றி", "எப்படி", "சொல்லுங்கள்", "விவரம்", "என்ன",
  "குறைந்த", "மலிவான", "அதிக", "எது", "எத்தனை",
]);

function questionRemainder(query: string): string {
  return normalizeMenuName(transliterateTamilFoodWords(transliterateTamilForNatural(query)))
    .split(" ")
    .filter((t) => t.length > 1 && !QUESTION_FILLER.has(t))
    .join(" ");
}

const DRINK_KEYS = ["juice", "coffee", "tea", "drink", "shake", "mojito", "soda", "cola", "mocktail", "milkshake", "chai", "lassi"];
const DESSERT_KEYS = ["dessert", "cake", "ice cream", "icecream", "pastry", "brownie", "gulab", "jamun", "halwa", "payasam", "kheer"];
const SEAFOOD_KEYS = ["fish", "prawn", "shrimp", "crab", "lobster", "squid", "calamari", "tuna", "salmon", "anchovy", "nethili", "vanjaram", "seafood", "sea food"];

/** Stock-aware availability — mirrors Menu.tsx + chatAssistant. Never overrides Firestore. */
function isAvailableStockAware(m: MenuItem): boolean {
  if (m.isAvailable !== true) return false;
  const track = m.trackStock === true || m.stockEnabled === true;
  if (track && Number(m.stockQuantity) <= 0) return false;
  return true;
}

/** Generic scopes resolve against real category/item words — never invented. */
export function scopeHit(scope: string, hay: string): boolean {
  // Canonicalize biriyani/biryani spelling (Tanglish + Tamil transliteration
  // "பிரியாணி" → "biryani" must hit menu "Biriyani").
  const canon = (x: string) => x.replace(/biriyani/g, "biryani");
  const s = canon(scope.trim());
  if (s.length < 3) return false;
  const sing = s.endsWith("s") && s.length > 3 ? s.slice(0, -1) : s;
  const h = canon(hay);
  if (h.includes(s) || h.includes(sing)) return true;
  // "drinks"/"desserts"/"seafood" style generics: match real category/item keywords.
  if (sing === "drink" || sing === "beverage") {
    return DRINK_KEYS.some((k) => h.includes(k));
  }
  if (sing === "dessert" || sing === "sweet") {
    return DESSERT_KEYS.some((k) => h.includes(k));
  }
  if (sing === "seafood" || sing === "sea food" || sing === "fish") {
    return SEAFOOD_KEYS.some((k) => h.includes(k));
  }
  return false;
}

export function scopeFilter(
  scope: string,
  menu: MenuItem[],
  catNameOf: (m: MenuItem) => string
): MenuItem[] {
  const s = scope.trim();
  if (s.length < 3) return [];
  return menu.filter((m) => {
    const hay = `${normalizeMenuName(m.name)} ${normalizeMenuName(catNameOf(m))} ${normalizeMenuName(m.categoryId)}`;
    return scopeHit(s, hay);
  });
}

function priceOf(m: MenuItem): number {
  return Number.isFinite(m.price) ? m.price : 0;
}

/** Answer language for deterministic menu Q&A (chat localizes framing). */
export type AnswerLang = "en" | "tanglish" | "ta";

function pickLang<T>(lang: AnswerLang, en: T, tanglish: T, ta: T): T {
  if (lang === "ta") return ta;
  if (lang === "tanglish") return tanglish;
  return en;
}

/**
 * Tries to answer a menu question deterministically. Returns null when the
 * input is an order (or unanswerable) so order parsing handles it.
 */
export function answerMenuQuestion(
  query: string,
  menu: MenuItem[],
  catById?: Map<string, string>,
  lang: AnswerLang = "en"
): NaturalLanguageResult | null {
  if (menu.length === 0) return null;
  const catNameOf = (m: MenuItem) => catById?.get(m.categoryId) || "";
  const lower = ` ${normalizeMenuName(query)} `;
  const hasWord = (...words: string[]) => words.some((w) => lower.includes(` ${w} `) || lower.includes(` ${w}s `));
  const isOrder = hasWord(...ORDER_TRIGGERS);
  const remainder = questionRemainder(query);

  // Price question: "How much is Mutton Biriyani?" / "mutton biriyani evlo"
  if (!isOrder && (hasWord("how much", "price", "cost", "rate", "evlo", "evalavu", "எவ்வளவு", "விலை") || lower.includes(" how much "))) {
    const hit = findMenuMatch(remainder, menu);
    if (hit.kind === "match") {
      const m = hit.item;
      return {
        matches: [],
        noMatch: false,
        query,
        answer: pickLang(
          lang,
          `${m.name} costs ${formatCurrency(priceOf(m))}.`,
          `${m.name} price ${formatCurrency(priceOf(m))}.`,
          `${m.name} விலை ${formatCurrency(priceOf(m))}.`
        ),
      };
    }
    return null;
  }

  // Availability question: "Is Hyderabadi Chicken Dum Biriyani available?"
  // Stock-aware: isAvailable=false OR tracked-out-of-stock both read unavailable.
  if (!isOrder && hasWord("available", "availability", "stock", "kidaikuma", "கிடைக்குமா", "iruka", "iruku", "இருக்கு", "இருக்கா")) {
    const hit = findMenuMatch(remainder, menu);
    if (hit.kind === "match") {
      const m = hit.item;
      const ok = isAvailableStockAware(m);
      return {
        matches: [],
        noMatch: false,
        query,
        answer: ok
          ? pickLang(
              lang,
              `Yes, ${m.name} is available at ${formatCurrency(priceOf(m))}.`,
              `Yes, ${m.name} available. Price ${formatCurrency(priceOf(m))}.`,
              `ஆம், ${m.name} கிடைக்கும். விலை ${formatCurrency(priceOf(m))}.`
            )
          : pickLang(
              lang,
              `No, ${m.name} is currently unavailable.`,
              `${m.name} currently illa.`,
              `${m.name} தற்போது கிடைக்கவில்லை.`
            ),
      };
    }
    return null;
  }

  // Cheapest question: "What is the cheapest dosa?" / "குறைந்த விலை தோசை எது?"
  if (hasWord("cheapest", "cheap", "kuraintha", "குறைந்த", "malivana", "மலிவான")) {
    const cands = scopeFilter(remainder, menu, catNameOf).filter((m) => isAvailableStockAware(m));
    if (cands.length > 0) {
      cands.sort((a, b) => priceOf(a) - priceOf(b));
      const win = cands[0];
      return {
        matches: [{ name: win.name, quantity: 1 }],
        noMatch: false,
        query,
        answer: pickLang(
          lang,
          `The cheapest option is ${win.name} at ${formatCurrency(priceOf(win))}.`,
          `Cheapest: ${win.name}, ${formatCurrency(priceOf(win))}.`,
          `மலிவானது ${win.name}, ${formatCurrency(priceOf(win))}.`
        ),
      };
    }
    return null;
  }

  // Listing question: "What biriyani do you have?" / "Show me desserts"
  // (only when it is NOT an order — "Rendu dosa" stays an order).
  if (!isOrder && hasWord(...LISTING_TRIGGERS)) {
    const scope = remainder;
    let cands: MenuItem[] = scope ? scopeFilter(scope, menu, catNameOf) : [...menu];
    if (cands.length === 0) return null;
    cands = [...cands].sort((a, b) => Number(b.isAvailable === true) - Number(a.isAvailable === true) || priceOf(a) - priceOf(b));
    const shown = cands.slice(0, 5);
    const label = scope || "menu";
    // The answer names EVERY candidate (not just the 5 shown for ordering)
    // so listings like "what biriyani do you have?" are complete.
    const fullList = cands
      .map((m) => `${m.name} at ${formatCurrency(priceOf(m))}`)
      .join(", ")
      .slice(0, 500);
    return {
      matches: shown.map((m) => ({ name: m.name, quantity: 1 })),
      noMatch: false,
      query,
      answer: pickLang(
        lang,
        `Found ${cands.length} ${label} item${cands.length === 1 ? "" : "s"}: ${fullList}.`,
        `${cands.length} ${label} iruku: ${fullList}.`,
        `${cands.length} ${label} கிடைக்கிறது: ${fullList}.`
      ),
    };
  }

  return null;
}

// Simple fallback for natural language when Gemini unavailable
function fallbackNatural(
  query: string,
  menu: MenuItem[],
  catById?: Map<string, string>
): NaturalLanguageResult {
  // Menu questions first — same menu, same matcher, answer path.
  const answered = answerMenuQuestion(query, menu, catById);
  if (answered) return answered;
  const translit = transliterateTamilForNatural(query);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0B80-\u0BFF\s]/g, " ").trim();
  const lower = normalize(translit).toLowerCase();
  const exactNorm = lower.trim();

  // PRIORITY 1: Exact normalized name match — for "Chicken Biryani" return that single item
  const exact = menu.find((m) => normalize(m.name) === exactNorm);
  if (exact) {
    const wantsTwo = /two|2 people|for two|rendu|irandu/i.test(lower);
    return { matches: [{ name: exact.name, quantity: wantsTwo ? 2 : 1 }], query, notes: "" };
  }
  // Also check if lower contains an exact dish name as a whole phrase
  for (const m of menu) {
    const normName = normalize(m.name);
    if (lower === normName || lower.includes(` ${normName} `) || lower.startsWith(`${normName} `) || lower.endsWith(` ${normName}`)) {
      const wantsTwo = /two|2 people|for two|rendu|irandu/i.test(lower);
      return { matches: [{ name: m.name, quantity: wantsTwo ? 2 : 1 }], query, notes: "" };
    }
  }

  // Try voice fallback for quantity-aware parsing (e.g., "rendu biryani venum")
  const fb = fallbackParseVoiceClient(query, menu);
  if (fb.items.length > 0) {
    // But if the original query was a specific dish name and fallback found multiple chicken items, prefer exact
    // Check if any fb item is an exact match for the query
    const exactFb = fb.items.find((it) => normalize(it.name) === exactNorm);
    if (exactFb) {
      return { matches: [{ name: exactFb.name, quantity: exactFb.quantity }], query, notes: fb.notes };
    }
    return { matches: fb.items.map((it) => ({ name: it.name, quantity: it.quantity })), query, notes: fb.notes };
  }
  // Broad recommendation fallback for "something spicy", "chicken dishes" etc.
  const wantsVeg = /veg|vegetarian|சைவ|saiva/i.test(query);
  const wantsSpicy = /spicy|காரம|kaaram|masala|chilli/i.test(query);
  const keywords = lower.split(/\s+/).filter((w) => w.length > 2 && !["want", "give", "something", "under", "with", "for", "people", "item", "venum", "vendum", "enakku", "rendu", "oru", "kudu", "pannunga"].includes(w));
  const scored = menu
    .filter((m) => {
      const text = `${m.name} ${m.description}`.toLowerCase();
      if (wantsVeg && !/veg|paneer/i.test(text)) return false;
      return true;
    })
    .map((m) => {
      const text = normalize(`${m.name} ${m.categoryId} ${m.description}`);
      let score = 0;
      for (const kw of keywords) {
        const kwNorm = normalize(kw);
        if (text.split(/\s+/).includes(kwNorm) || text.includes(kwNorm)) {
          if (normalize(m.name).includes(kwNorm)) score += 3;
          else score += 1;
        }
      }
      if (wantsVeg && /veg|paneer/i.test(text)) score += 1;
      if (wantsSpicy && /spicy|masala|chilli|pepper/i.test(text)) score += 1;
      return { m, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (scored.length === 0) return { matches: [], noMatch: true, reason: "No matching item is currently available.", query };
  // If top score is much higher (specific query), return only top
  if (scored.length > 1 && scored[0].score >= 6 && scored[0].score > scored[1].score * 1.5) {
    return { matches: [{ name: scored[0].m.name, quantity: 1 }], query };
  }
  return { matches: scored.map((s) => ({ name: s.m.name, quantity: 1 })), query };
}

export async function parseNaturalLanguage(
  restaurantId: string,
  query: string,
  menu: MenuItem[],
  catById?: Map<string, string>
): Promise<NaturalLanguageIntent> {
  const clean = query.trim().slice(0, MAX_QUERY);
  if (!clean || clean.length < 2) throw new Error("Please enter a valid request.");
  if (!restaurantId) throw new Error("Missing restaurant.");

  // Menu questions are answered deterministically from the loaded menu even
  // when the AI backend is reachable — same menu, same matcher, no guessing.
  try {
    const answered = answerMenuQuestion(clean, menu, catById);
    if (answered) return resolveNaturalIntent(answered, menu);
  } catch {
    // fall through to AI / order parsing
  }

  try {
    const functions = getFunctions(app);
    const fn = httpsCallable<{ restaurantId: string; query: string }, NaturalLanguageResult>(functions, "parseNaturalLanguageOrder");
    const res = await fn({ restaurantId, query: clean });
    const data = res.data as NaturalLanguageResult;
    return resolveNaturalIntent(data, menu);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const code = (err?.code || "").toLowerCase();
    const isNotDeployed =
      code.includes("not-found") ||
      code.includes("unavailable") ||
      code.includes("internal") ||
      err?.message?.toLowerCase().includes("not found");

    if (isNotDeployed) {
      // Deterministic fallback runs against the FULL loaded restaurant menu
      // (never a truncated subset) so dishes beyond the AI prompt cap still
      // resolve; prices/availability stay authoritative from the same menu.
      return resolveNaturalIntent(fallbackNatural(clean, menu, catById), menu);
    }
    try {
      const fb = fallbackNatural(clean, menu, catById);
      const resolved = resolveNaturalIntent(fb, menu);
      if (!resolved.noMatch) return resolved;
    } catch {
      // ignore
    }
    throw new Error(err?.message || "Smart recommendations are temporarily unavailable. Please browse the menu.");
  }
}
