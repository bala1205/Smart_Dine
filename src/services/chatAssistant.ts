import type { MenuItem, MenuCategory } from "../types/menu";
import type { OrderIntent } from "../types/aiOrder";
import {
  fallbackParseVoiceClient,
  findMenuMatch,
  normalizeMenuName,
  resolveNaturalIntent,
  resolveVoiceIntent,
  transliterateTamilFoodWords,
} from "./aiMenuMatcher";
import { answerMenuQuestion, scopeFilter, scopeHit, type AnswerLang } from "./naturalLanguageOrderService";
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
  gstPercent?: number;
  serviceChargePercent?: number;
  tableNumber?: number | string | null;
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
  description?: string;
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
    description: (m.description || "").slice(0, 160) || undefined,
    quantity,
  };
}

/** Price range like "100 to 200", "between ₹150 and ₹250", "₹100 முதல் ₹200 வரை". Pure. */
export function extractPriceRange(text: string): { min: number; max: number } | null {
  const t = text.replace(/₹/g, "₹ ").replace(/,/g, "");
  const patterns = [
    /between\s*₹?\s*(\d{2,4})\s*(?:and|&|to)\s*₹?\s*(\d{2,4})/i,
    /₹?\s*(\d{2,4})\s*(?:to|-|–|முதல்|muthal|lendhu|from)\s*₹?\s*(\d{2,4})\s*(?:varaikum|வரை|varai)?/i,
    /(\d{2,4})\s*(?:lendhu|முதல்)\s*\S*\s*(\d{2,4})\s*(?:varaikum|வரை)/i,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return { min: Math.min(a, b), max: Math.max(a, b) };
      }
    }
  }
  return null;
}

const DETAIL_FILLER = new Set([
  "tell", "me", "about", "details", "detail", "describe", "explain", "info", "sollu", "sollunga",
  "the", "a", "an", "this", "that", "food", "item", "dish", "please", "konjam", "enna", "ena",
  "விவரம்", "சொல்லுங்கள்", "பற்றி", "என்ன",
]);

/** Scope remainder for count/range/cheap queries (dish/category words only). */
export function remainderScope(rawText: string): string {
  return normalizeMenuName(transliterateTamilFoodWords(rawText))
    .split(" ")
    .filter(
      (t) =>
        t.length > 2 &&
        !DETAIL_FILLER.has(t) &&
        !/^(how|many|much|cheapest|cheap|most|expensive|costliest|costly|under|below|less|between|ethana|kuraintha|malivana|show|list|enna|iruku|iruka|kulla|keela|varaikum|to|from|muthal|lendhu|and|what|which|kaatu|kaattu|kattu|is|the|are|do|does|you|your|a|an|that|this|it|of|in|on|for|my|dhaan|thaan)$/.test(t) &&
        /^[^0-9]*$/.test(t)
    )
    .join(" ");
}

/**
 * True when NONE of the scope tokens resemble any real menu word — i.e. the
 * query carries no dish/category signal ("அதிக விலை உணவு எது?",
 * "costliest food?"). Such generic superlatives safely use the full menu.
 * When at least one token hits (e.g. "dosa" in "which dosa"), the scope is
 * specific and must NOT fall back — later handlers resolve it precisely.
 */
function isGenericScope(scope: string, menu: MenuItem[], catNameOf: (m: MenuItem) => string): boolean {
  const toks = scope.split(" ").filter((t) => t.length >= 3);
  if (toks.length === 0) return true;
  const hays = menu.map((mm) => `${normalizeMenuName(mm.name)} ${normalizeMenuName(catNameOf(mm))}`);
  return !toks.some((tok) => hays.some((h) => h.includes(tok) || tok.includes(h) || scopeHit(tok, h)));
}

/** Finds the single real dish a detail question asks about (tolerant). */
export function detailQueryItem(rawText: string, norm: string, menu: MenuItem[]): MenuItem | null {
  void norm;
  const cleaned = normalizeMenuName(transliterateTamilFoodWords(rawText))
    .split(" ")
    .filter((t) => t.length > 1 && !DETAIL_FILLER.has(t))
    .join(" ");
  if (!cleaned) return null;
  const hit = findMenuMatch(cleaned, menu);
  return hit.kind === "match" ? hit.item : null;
}

/** Restaurant summary from real fields only — missing fields are omitted, never invented. */
export function restaurantSummary(ctx: ChatMenuContext, lang: ChatLanguage, menu?: MenuItem[]): string {
  const bits: string[] = [ctx.restaurantName];
  if (ctx.description) bits.push(ctx.description.slice(0, 200));
  if (ctx.address) {
    bits.push(
      lang === "ta" ? `முகவரி: ${ctx.address}` : lang === "tanglish" ? `Address: ${ctx.address}` : `Location: ${ctx.address}`
    );
  }
  if (ctx.phone) {
    bits.push(
      lang === "ta" ? `தொலைபேசி: ${ctx.phone}` : `Phone: ${ctx.phone}`
    );
  }
  const status =
    lang === "ta"
      ? ctx.isActive ? "தற்போது திறந்துள்ளது." : "தற்போது மூடப்பட்டுள்ளது."
      : lang === "tanglish"
        ? ctx.isActive ? "Ippo open." : "Ippo closed."
        : ctx.isActive ? "Open right now." : "Currently closed.";
  bits.push(status);
  if (menu) {
    const avail = menu.filter((mm) => isAvailableItem(mm)).length;
    const cats = ctx.categories.map((c) => c.name).filter(Boolean);
    bits.push(
      lang === "ta"
        ? `மெனு: ${menu.length} உணவுகள் (${avail} கிடைக்கிறது). வகைகள்: ${cats.slice(0, 8).join(", ")}.`
        : lang === "tanglish"
          ? `Menu: ${menu.length} items (${avail} available). Categories: ${cats.slice(0, 8).join(", ")}.`
          : `Menu: ${menu.length} items (${avail} available). Categories: ${cats.slice(0, 8).join(", ")}.`
    );
  }
  return bits.join(" ");
}

/** Menu summary — every number derived live from the loaded menu. */
export function menuSummary(menu: MenuItem[], ctx: ChatMenuContext, lang: ChatLanguage): string {
  const total = menu.length;
  const avail = menu.filter((m) => isAvailableItem(m));
  const prices = avail.map((m) => priceOf(m));
  const cats = ctx.categories.map((c) => c.name).filter(Boolean);
  const range =
    prices.length > 0
      ? `${formatCurrency(Math.min(...prices))}–${formatCurrency(Math.max(...prices))}`
      : "";
  if (lang === "ta")
    return `மெனுவில் மொத்தம் ${total} உணவுகள் (${avail.length} கிடைக்கிறது), ${cats.length} வகைகள்${range ? `, விலை ${range}` : ""}. வகைகள்: ${cats.slice(0, 8).join(", ")}.`;
  if (lang === "tanglish")
    return `Menula total ${total} items (${avail.length} available), ${cats.length} categories${range ? `, price ${range}` : ""}. Categories: ${cats.slice(0, 8).join(", ")}.`;
  return `The menu has ${total} items (${avail.length} available) across ${cats.length} categories${range ? `, priced ${range}` : ""}. Categories include: ${cats.slice(0, 8).join(", ")}.`;
}

/** Food detail from the real doc — description/stock only when present. */
export function foodDetailText(m: MenuItem, catName: string, lang: ChatLanguage): string {
  const head = `${m.name}. Price: ${formatCurrency(priceOf(m))}. Category: ${catName || m.categoryId}.`;
  const avail =
    lang === "ta"
      ? isAvailableItem(m)
        ? "கிடைக்கிறது."
        : "தற்போது கிடைக்கவில்லை."
      : lang === "tanglish"
        ? isAvailableItem(m)
          ? "Available."
          : "Currently illa."
        : isAvailableItem(m)
          ? "Available."
          : "Currently unavailable.";
  const parts = [head, `Availability: ${avail}`];
  if (m.description?.trim()) parts.push(`Description: ${m.description.trim().slice(0, 200)}`);
  const track = m.trackStock === true || m.stockEnabled === true;
  const qty = Number(m.stockQuantity);
  if (track && Number.isFinite(qty) && qty > 0) {
    parts.push(
      lang === "ta"
        ? `Stock: ${qty} உள்ளது.`
        : lang === "tanglish"
          ? `Stock: ${qty} iruku.`
          : `Stock status: ${qty} remaining.`
    );
  }
  return parts.join(" ");
}

/** Availability sentence from the real menu doc. Never invented. */
export function availabilityText(m: MenuItem, lang: ChatLanguage): string {
  if (!isAvailableItem(m)) {
    if (lang === "ta") return `${m.name} தற்போது கிடைக்கவில்லை.`;
    if (lang === "tanglish") return `${m.name} currently illa.`;
    return `${m.name} is currently unavailable.`;
  }
  return lang === "ta"
    ? `${m.name} கிடைக்கிறது.`
    : lang === "tanglish"
      ? `${m.name} available.`
      : `${m.name} is available.`;
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

  // --- "it" follow-up: unambiguous single-item context only ---
  if (ctx.lastIds?.length === 1 && (/\bit\b/.test(norm) || norm.includes("அது"))) {
    const one = menu.find((m) => m.id === ctx.lastIds![0]);
    if (one) {
      const sub = text.replace(/\bit\b/gi, one.name).replace(/அது/g, one.name);
      if (sub !== text) {
        return answerChat(sub, menu, { ...ctx, lastIds: undefined, lastLabel: undefined });
      }
    }
  }

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
  // Time-asking ("what time open?", "open time enna?", "எப்போ திறக்கும்?") → hours unavailable.
  // The Restaurant schema has NO opening-hours field, so this is always missing.
  const asksTime =
    hasWord("what time", "open at", "open time", "opening hours", "opening time", "timing", "timings", "closes", "closing", "thora", "eppo", "epo", "எப்போ", "நேரம்", "திறக்கும்", "மூடும்") ||
    (norm.includes("open") && hasWord("hour", "hours", "time", "timing", "timings", "close", "closes", "closing"));
  if (asksTime) {
    return { text: S.hoursMissing };
  }
  // Open-status ("is restaurant open?", "restaurant open ah?", "கடை திறந்திருக்கிறதா?") → real isActive.
  if (
    norm.includes("open") ||
    norm.includes("opened") ||
    norm.includes("திறந்த") ||
    norm.includes("மூடப்பட்ட") ||
    (hasWord("open", "opened", "thora", "திறந்த") && hasWord("restaurant", "hotel", "shop", "kadai", "hotel peru", "கடை", "உணவக"))
  ) {
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
  // Unsupported metadata — the Restaurant/MenuItem schemas have NO such fields.
  // Always answer "not available", never invent. Covers email/delivery/offers/
  // parking/wifi/reservation/ingredients/calories/allergens/spice/portion.
  if (
    hasWord("email", "mail", "e-mail", "மின்னஞ்சல்") ||
    norm.includes("parking") || norm.includes("park ") || norm.includes("car park") ||
    norm.includes("wifi") || norm.includes("wi-fi") || norm.includes("internet") ||
    norm.includes("deliver") || norm.includes("delivery") || norm.includes("takeaway") || norm.includes("take away") ||
    norm.includes("offer") || norm.includes("discount") || norm.includes("coupon") || norm.includes("deal") ||
    norm.includes("reserv") || norm.includes("book a table") || norm.includes("table book") ||
    norm.includes("ingredient") || norm.includes("calorie") || norm.includes("protein") ||
    norm.includes("allergen") || norm.includes("allergy") || norm.includes("spice level") || norm.includes("spicy level") ||
    norm.includes("portion") || norm.includes("preparation time") || norm.includes("cooking time") ||
    hasWord("parkin", "parking", "wifi", "offer", "offers", "delivery", "reservation")
  ) {
    return { text: unsupportedMissing(lang) };
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
  // Word-boundary phone check: substring "call" must NOT hijack "called"
  // ("What is this restaurant called?" is a name question, not a phone one).
  const asksPhone =
    hasWord("phone", "contact", "தொலைபேசி") ||
    /\bcall\b/.test(norm) ||
    /\bnumber\b/.test(norm);
  if (asksPhone && !norm.includes("65")) {
    if (ctx.phone) {
      return { text: lang === "ta" ? `தொலைபேசி: ${ctx.phone}` : `Phone: ${ctx.phone}` };
    }
    return { text: phoneMissing(lang) };
  }

  // --- Restaurant identity / summary (real fields only) ---
  const restaurantWord = hasWord("restaurant", "hotel", "kadai", "shop", "உணவக", "கடை", "restaurant peru", "hotel peru");
  if (
    hasWord("called", "peru", "பெயர்") ||
    (restaurantWord && hasWord("name", "about", "details", "detail", "tell", "sollu", "விவர"))
  ) {
    if (hasWord("about", "details", "detail", "tell", "sollu", "விவர")) {
      return { text: restaurantSummary(ctx, lang, menu) };
    }
    return {
      text:
        lang === "ta"
          ? `இந்த உணவகத்தின் பெயர் ${ctx.restaurantName}.`
          : lang === "tanglish"
            ? `Indha restaurant peru ${ctx.restaurantName}.`
            : `This restaurant is called ${ctx.restaurantName}.`,
    };
  }
  if (restaurantWord && hasWord("many", "count", "total", "ethana", "எத்தனை", "items", "foods", "dishes")) {
    const total = menu.length;
    const avail = menu.filter((m) => isAvailableItem(m)).length;
    return {
      text:
        lang === "ta"
          ? `${ctx.restaurantName}-ல் மொத்தம் ${total} உணவுகள் உள்ளன (${avail} கிடைக்கிறது).`
          : lang === "tanglish"
            ? `${ctx.restaurantName}-la total ${total} food items iruku (${avail} available).`
            : `${ctx.restaurantName} has ${total} food items on the menu (${avail} currently available).`,
      scopeIds: menu.map((m) => m.id),
      scopeLabel: "menu",
    };
  }
  // GST / service charge / payment info — real settings only.
  if (norm.includes("gst")) {
    const g = Number(ctx.gstPercent) || 0;
    return {
      text:
        g > 0
          ? lang === "ta"
            ? `GST ${g}% உள்ளது. Bill-ல் முழு விவரம் இருக்கும்.`
            : lang === "tanglish"
              ? `GST ${g}% iruku. Full breakup bill-la irukum.`
              : `Yes, GST is ${g}%. Your digital bill shows the full breakup.`
          : lang === "ta"
            ? "GST எதுவும் அமைக்கப்படவில்லை."
            : lang === "tanglish"
              ? "GST onnum set pannala."
              : "No GST is configured for this restaurant.",
    };
  }
  if (norm.includes("service charge") || norm.includes("servicecharge")) {
    const s = Number(ctx.serviceChargePercent) || 0;
    return {
      text:
        s > 0
          ? lang === "ta"
            ? `Service charge ${s}% உள்ளது. Bill-ல் முழு விவரம் இருக்கும்.`
            : lang === "tanglish"
              ? `Service charge ${s}% iruku. Full breakup bill-la irukum.`
              : `Yes, there is a ${s}% service charge. Your digital bill shows the full breakup.`
          : lang === "ta"
            ? "Service charge எதுவும் அமைக்கப்படவில்லை."
            : lang === "tanglish"
              ? "Service charge onnum set pannala."
              : "There is no service charge configured for this restaurant.",
    };
  }
  if (hasWord("payment", "pay", "paying", "bill") && !hasWord("request bill", "bill request", "bill kaatu")) {
    const bits: string[] = [];
    if ((Number(ctx.gstPercent) || 0) > 0) bits.push(`GST ${ctx.gstPercent}%`);
    if ((Number(ctx.serviceChargePercent) || 0) > 0) bits.push(`service charge ${ctx.serviceChargePercent}%`);
    const detail = bits.length > 0 ? bits.join(" and ") : "";
    return {
      text:
        lang === "ta"
          ? detail
            ? `Bill-ல் ${detail} இருக்கும். முழு விவரம் digital bill-ல் காட்டும்.`
            : "Bill விவரம் digital bill-ல் காட்டும்."
          : lang === "tanglish"
            ? detail
              ? `Bill-la ${detail} irukum. Full breakup digital bill-la paakalaam.`
              : "Bill details digital bill-la paakalaam."
            : detail
              ? `Your digital bill includes ${detail}. You can view the full breakup on the bill page.`
              : "You can view the full bill breakup on the digital bill page.",
    };
  }
  // Menu summary — all numbers derived live from the loaded menu.
  if (hasWord("about the menu", "about menu", "menu pathi", "மெனு பற்றி", "menu summary", "menu details")) {
    return { text: menuSummary(menu, ctx, lang) };
  }

  // --- Food detail / category-of (real doc facts only) ---
  {
    const detailHit = detailQueryItem(text, norm, menu);
    if (detailHit) {
      if (hasWord("categor", "வகை", "entha category", "which category")) {
        const cat = catNameOf(detailHit) || detailHit.categoryId;
        return {
          text:
            lang === "ta"
              ? `${detailHit.name} — ${cat} வகையைச் சேர்ந்தது.`
              : lang === "tanglish"
                ? `${detailHit.name} — ${cat} category.`
                : `${detailHit.name} is in ${cat}.`,
          suggestions: [toSuggestion(detailHit, catNameOf(detailHit))],
          scopeIds: [detailHit.id],
          scopeLabel: detailHit.name,
        };
      }
      if (hasWord("tell", "about", "details", "detail", "sollu", "விவரம்", "describe", "explain", "info")) {
        return {
          text: foodDetailText(detailHit, catNameOf(detailHit), lang),
          suggestions: [toSuggestion(detailHit, catNameOf(detailHit))],
          scopeIds: [detailHit.id],
          scopeLabel: detailHit.name,
        };
      }
    }
  }

  // --- Price range / most expensive / cheapest overall / scoped counts ---
  {
    const range = extractPriceRange(text);
    if (range) {
      const scope = remainderScope(text);
      let base = scope ? scopeFilter(scope, menu, catNameOf) : [...menu];
      // Generic food words ("உணவு காட்டு", "food") match no real dish — fall
      // back to the full menu so the numeric range still filters correctly.
      if (scope && base.length === 0) base = [...menu];
      const inRange = base.filter((m) => isAvailableItem(m) && priceOf(m) >= range.min && priceOf(m) <= range.max).sort((a, b) => priceOf(a) - priceOf(b));
      if (inRange.length > 0) {
        const shown = inRange.slice(0, 5);
        const list = inRange.map((m) => `${m.name} at ${formatCurrency(priceOf(m))}`).join(", ").slice(0, 500);
        return {
          text:
            lang === "ta"
              ? `₹${range.min} முதல் ₹${range.max} வரை ${inRange.length} உணவுகள்: ${list}.`
              : lang === "tanglish"
                ? `₹${range.min} to ₹${range.max} kulla ${inRange.length} items: ${list}.`
                : `Found ${inRange.length} items between ${formatCurrency(range.min)} and ${formatCurrency(range.max)}: ${list}.`,
          suggestions: shown.map((m) => toSuggestion(m, catNameOf(m))),
          scopeIds: inRange.map((m) => m.id),
          scopeLabel: `₹${range.min}-₹${range.max}`,
        };
      }
    }
    if (/\bmost expensive\b|\bcostliest\b|\bcostly\b|அதிக விலை|விலை அதிகம்|costly food|விலை உயர்ந்த/.test(norm)) {
      const scope = remainderScope(text);
      // Bare superlative with live follow-up context ("Which is cheapest?"
      // after a biriyani listing) belongs to the follow-up handler below.
      if (!scope && ctx.lastIds && ctx.lastIds.length > 0) {
        // fall through to scoped follow-up
      } else {
      let base = (scope ? scopeFilter(scope, menu, catNameOf) : [...menu]).filter((m) => isAvailableItem(m));
      // Generic superlative with no dish signal → full menu. Specific but
      // unmatched scope falls through to the shared Q&A / follow-up handlers.
      if (scope && base.length === 0 && isGenericScope(scope, menu, catNameOf)) {
        base = menu.filter((m) => isAvailableItem(m));
      }
      if (base.length > 0) {
        const win = [...base].sort((a, b) => priceOf(b) - priceOf(a))[0];
        return {
          text:
            lang === "ta"
              ? `அதிக விலை உணவு ${win.name}, ${formatCurrency(priceOf(win))}.`
              : lang === "tanglish"
                ? `Costliest: ${win.name}, ${formatCurrency(priceOf(win))}.`
                : `The most expensive is ${win.name} at ${formatCurrency(priceOf(win))}.`,
          suggestions: [toSuggestion(win, catNameOf(win))],
          scopeIds: [win.id],
          scopeLabel: win.name,
        };
      }
      }
    }
    if (/\bhow many\b|ethana|எத்தனை/.test(norm)) {
      const scope = remainderScope(text);
      if (scope) {
        const cands = scopeFilter(scope, menu, catNameOf);
        if (cands.length > 0) {
          const shown = [...cands].sort((a, b) => priceOf(a) - priceOf(b)).slice(0, 5);
          return {
            text:
              lang === "ta"
                ? `${cands.length} ${scope} வகைகள் உள்ளன: ${cands.slice(0, 7).map((m) => m.name).join(", ")}.`
                : lang === "tanglish"
                  ? `${cands.length} ${scope} iruku: ${cands.slice(0, 7).map((m) => m.name).join(", ")}.`
                  : `There are ${cands.length} ${scope} items: ${cands.slice(0, 7).map((m) => m.name).join(", ")}.`,
            suggestions: shown.map((m) => toSuggestion(m, catNameOf(m))),
            scopeIds: cands.map((m) => m.id),
            scopeLabel: scope,
          };
        }
      }
    }
    if (/\bcheapest\b|\bcheap\b|kuraintha|குறைந்த|malivana|மலிவான/.test(norm)) {
      const scope = remainderScope(text);
      // Bare superlative with live follow-up context belongs to the scoped
      // follow-up handler below, not the global cheapest.
      if (!scope && ctx.lastIds && ctx.lastIds.length > 0) {
        // fall through to scoped follow-up
      } else {
        let base = (scope ? scopeFilter(scope, menu, catNameOf) : [...menu]).filter((m) => isAvailableItem(m));
        if (scope && base.length === 0 && isGenericScope(scope, menu, catNameOf)) {
          base = menu.filter((m) => isAvailableItem(m));
        }
        if (base.length > 0) {
          const win = [...base].sort((a, b) => priceOf(a) - priceOf(b))[0];
          return {
            text:
              lang === "ta"
                ? `மலிவானது ${win.name}, ${formatCurrency(priceOf(win))}.`
                : lang === "tanglish"
                  ? `Cheapest: ${win.name}, ${formatCurrency(priceOf(win))}.`
                  : `The cheapest is ${win.name} at ${formatCurrency(priceOf(win))}.`,
            suggestions: [toSuggestion(win, catNameOf(win))],
            scopeIds: [win.id],
            scopeLabel: win.name,
          };
        }
      }
    }
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

  // --- Price / availability backup (transliteration-aware, never an order) ---
  // Guarantees "mutton biriyani evlo?" / "மட்டன் பிரியாணி எவ்வளவு?" /
  // "chicken 65 available ah?" answer from the real doc even if the shared
  // Q&A misses a Tamil phrasing. Questions never produce an OrderIntent.
  {
    const detailHit = detailQueryItem(text, norm, menu);
    if (detailHit) {
      const asksPrice = hasWord("how much", "price", "cost", "rate", "evlo", "evalavu", "விலை", "எவ்வளவு");
      const asksAvail = hasWord("available", "availability", "stock", "kidaikuma", "கிடைக்குமா", "iruka", "iruku", "இருக்கு", "இருக்கா");
      if (asksPrice && !asksAvail) {
        return {
          text:
            lang === "ta"
              ? `${detailHit.name} விலை ${formatCurrency(priceOf(detailHit))}.`
              : lang === "tanglish"
                ? `${detailHit.name} price ${formatCurrency(priceOf(detailHit))}.`
                : `${detailHit.name} costs ${formatCurrency(priceOf(detailHit))}.`,
          suggestions: [toSuggestion(detailHit, catNameOf(detailHit))],
          scopeIds: [detailHit.id],
          scopeLabel: detailHit.name,
        };
      }
      if (asksAvail) {
        return {
          text: availabilityText(detailHit, lang),
          suggestions: [toSuggestion(detailHit, catNameOf(detailHit))],
          scopeIds: [detailHit.id],
          scopeLabel: detailHit.name,
        };
      }
    }
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

function phoneMissing(lang: ChatLanguage): string {
  return lang === "ta"
    ? "தொலைபேசி எண் தற்போது SmartDine-ல் கிடைக்கவில்லை."
    : lang === "tanglish"
      ? "Phone number SmartDine-la currently available illa."
      : "The phone number isn't available in SmartDine right now.";
}

/** Generic safe reply for fields the Firestore schema does not have. Never invents. */
function unsupportedMissing(lang: ChatLanguage): string {
  return lang === "ta"
    ? "அந்த விவரம் தற்போது SmartDine-ல் கிடைக்கவில்லை."
    : lang === "tanglish"
      ? "Andha detail SmartDine-la currently available illa."
      : "That detail isn't available in SmartDine right now.";
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


