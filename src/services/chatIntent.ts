import type { MenuItem } from "../types/menu";
import { levenshtein, normalizeMenuName, transliterateTamilFoodWords } from "./aiMenuMatcher";

/**
 * Conversation-first intent routing for SmartDine AI Chat.
 * MENU MATCHER is NEVER the default — explicit ORDER_INTENT only.
 * Pure — unit tested. Firestore remains source of truth; this file only
 * classifies text, never invents prices/availability.
 */

export type ChatIntentKind =
  | "RESTAURANT_INFO"
  | "MENU_DISCOVERY"
  | "FOOD_INFO"
  | "PRICE_QUERY"
  | "AVAILABILITY_QUERY"
  | "CATEGORY_QUERY"
  | "FILTER_QUERY"
  | "RECOMMENDATION"
  | "COMPARISON"
  | "CART_QUERY"
  | "ORDER_INTENT"
  | "GENERAL_RESTAURANT_CONVERSATION"
  | "UNKNOWN";

export function normalizeForIntent(raw: string): string {
  return normalizeMenuName(transliterateTamilFoodWords(raw));
}

function padded(norm: string): string {
  return ` ${norm} `;
}

function hasPattern(pad: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(pad));
}

// ---------------------------------------------------------------------------
// Question signals — informational, NEVER kitchen notes, NEVER orders.
// ---------------------------------------------------------------------------

const QUESTION_TOKEN_RES = [
  /\bena\b/, /\benna\b/, /\bepdi\b/, /\beppadi\b/, /\bpathi\b/, /\bpatti\b/,
  /\bsollu\b/, /\bsollunga\b/, /\bslu\b/, /\bsol\b/, /\bsolu\b/,
  /\bdetails?\b/, /\biruka\b/, /\biruku\b/, /\birukku\b/,
  /\bkedaikuma\b/, /\bkidaikuma\b/, /\bavailable\b/,
  /\bevlo\b/, /\bevalo\b/, /\bevalavu\b/, /\bprice\b/, /\bcost\b/, /\brate\b/,
  /\bcheap\b/, /\bcheapest\b/, /\bcostly\b/, /\bcostliest\b/,
  /\bbest\b/, /\bsuggest\b/, /\brecommend\b/,
  /\bkaatu\b/, /\bkaattu\b/, /\bkattu\b/, /\bkaatunga\b/, /\bkaattunga\b/,
  /\btell\b/, /\babout\b/, /\bwhat\b/, /\bwhich\b/, /\bhow\b/,
  /\bentha\b/, /\bethana\b/, /\betha\b/, /\bedhu\b/, /\bedhu\b/,
  /\benga\b/, /\beppo\b/, /\bepo\b/, /\bperu\b/, /\bvilai\b/,
  /\bveg\b/, // veg alone is discovery signal, not order (handled with context)
];

const TAMIL_QUESTION_SUBSTRINGS = [
  "பற்றி", "பத்தி", "எப்படி", "எவ்வளவு", "விலை",
  "இருக்கிறது", "இருக்கிறதா", "இருக்கு", "இருக்கா",
  "கிடைக்குமா", "காட்டு", "சொல்லுங்கள்", "சொல்லு", "சொல்லுங்க",
  "விவரம்", "என்ன", "எத்தனை", "எங்கே", "பெயர்",
  "திறக்கும்", "மூடும்", "நேரம்",
];

/** True when the text carries any informational/question signal. */
export function hasQuestionSignal(raw: string): boolean {
  const norm = normalizeForIntent(raw);
  const pad = padded(norm);
  if (hasPattern(pad, QUESTION_TOKEN_RES)) return true;
  for (const t of TAMIL_QUESTION_SUBSTRINGS) {
    if (raw.includes(t) || norm.includes(t)) return true;
  }
  // "available ah", "evlo?", "price ena?" style — covered above, but keep
  // explicit substring fallbacks for transliterated mixes.
  if (/\bhow much\b/.test(pad)) return true;
  if (/\bdo you have\b/.test(pad)) return true;
  if (/\bis .* good\b/.test(pad)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Explicit order detection — phrase/context aware, NOT naive substring.
// "I want to know about X" is informational despite containing "I want".
// ---------------------------------------------------------------------------

const ORDER_VERB_RES = [
  /\bgive me\b/, /\bgive us\b/, /\bbring me\b/, /\bget me\b/,
  /\bi want\b/, /\bwe want\b/, /\bi need\b/, /\bwe need\b/,
  /\bi would like\b/, /\bwe would like\b/,
  /\border\b/, /\badd\b/,
  /\bkudu\b/, /\bkudunga\b/, /\bkodunga\b/, /\bkodungo\b/, /\bkodu\b/,
  /\bvenum\b/, /\bvendum\b/, /\bvenam\b/, /\bvendam\b/,
  /\badd pannu\b/, /\badd panu\b/, /\badd panna\b/, /\badd pannunga\b/,
  /\bcart la\b.*\b(podu|add|pannu)\b/, /\bpodu\b/,
];

const TAMIL_ORDER_SUBSTRINGS = [
  "வேண்டும்", "வேணும்", "சேர்க்கவும்", "கொடுங்கள்", "கொடுங்க",
  "கொடுக்கவும்", "ஆர்டர்",
];

const QUANTITY_RES = [
  /\boru\b/, /\bonnu\b/, /\bonru\b/, /\brendu\b/, /\brandu\b/, /\birandu\b/,
  /\bmunnu\b/, /\bmoonnu\b/, /\bmoonu\b/, /\bmoonru\b/, /\bmoondru\b/,
  /\bnaalu\b/, /\bainthu\b/, /\banju\b/, /\baaru\b/, /\baru\b/,
  /\belu\b/, /\bezhu\b/, /\bettu\b/, /\bonpathu\b/, /\bonbathu\b/,
  /\bpathu\b/, /\bpattu\b/,
  /\bone\b/, /\btwo\b/, /\bthree\b/, /\bfour\b/, /\bfive\b/,
  /\bsix\b/, /\bseven\b/, /\beight\b/, /\bnine\b/, /\bten\b/,
  /\b\d+\b/,
  /ஒரு/, /ஒன்று/, /இரண்டு/, /ரெண்டு/, /மூன்று/, /நான்கு/,
];

/**
 * True only when the user CLEARLY wants to order.
 * Question words alone never trigger; order verbs win over questions;
 * quantity + dish without questions is an order (e.g. "Rendu dosa").
 * The dish-presence check is done by the caller (classify) via hasDishSignal;
 * this helper reports verb-level intent + quantity presence.
 */
export function isExplicitOrderIntent(raw: string): boolean {
  const norm = normalizeForIntent(raw);
  const pad = padded(norm);

  // "how to order?" is guidance, not an order.
  if (/how (to|do|can|should).*order/.test(pad)) return false;
  if (pad.includes(" how to order ")) return false;

  // "I want to know / to understand / details / info about X" is informational.
  if (/(i want|we want|enakku|enaku).*(to know|to understand|about|details|detail|info|pathi|patti|epdi|eppadi|evlo|evalavu|price|available|iruku|iruka)/.test(pad)) {
    return false;
  }
  if (/want (to know|details|info|more info)/.test(pad)) return false;
  if (/want to (know|ask|understand)/.test(pad)) return false;

  // "suggest pannu / recommend pannu / best ... pannu" is recommendation.
  const hasSuggest = /suggest|recommend|best/.test(pad);
  const hasPannuOnly = /pannu|pannunga/.test(pad);
  const hasStrongOrder = /kudu|kudunga|kodunga|venum|vendum|venam|add|order|give me|i want|i need/.test(pad)
    || TAMIL_ORDER_SUBSTRINGS.some((t) => raw.includes(t));
  if (hasSuggest && hasPannuOnly && !hasStrongOrder) return false;

  if (ORDER_VERB_RES.some((p) => p.test(pad))) return true;
  for (const t of TAMIL_ORDER_SUBSTRINGS) {
    if (raw.includes(t)) return true;
  }
  return false;
}

/** True when a quantity word/number is present (for quantity+dis+h orders). */
export function hasQuantitySignal(raw: string): boolean {
  const norm = normalizeForIntent(raw);
  const pad = padded(norm);
  if (QUANTITY_RES.some((p) => p.test(pad))) return true;
  for (const t of ["ஒரு", "ஒன்று", "இரண்டு", "ரெண்டு", "மூன்று"] as const) {
    if (raw.includes(t)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Restaurant mention (typo tolerant: "Resturant" → restaurant)
// ---------------------------------------------------------------------------

const RESTAURANT_EXACT = new Set([
  "restaurant", "hotel", "kadai", "shop", "unavagam", "unavagam",
  "hotel peru", "restaurant peru",
]);

export function hasRestaurantMention(raw: string): boolean {
  const norm = normalizeForIntent(raw);
  const toks = norm.split(" ").filter(Boolean);
  for (const tok of toks) {
    if (RESTAURANT_EXACT.has(tok)) return true;
    if (tok.length >= 6 && levenshtein(tok, "restaurant", 2) <= 2) return true;
  }
  if (raw.includes("உணவக") || raw.includes("கடை") || raw.includes("ஹோட்டல்")) return true;
  // "resturant/restarent/restaurent" without spaces also caught by levenshtein above,
  // but keep an explicit regex safety net for glued forms.
  if (/rest[auo]r?an?t|restarent|restaurent|restorant/.test(norm)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Menu signals — does the text reference a REAL dish/category?
// ---------------------------------------------------------------------------

export function hasDishSignal(
  raw: string,
  menu: MenuItem[],
  catNameOf: (m: MenuItem) => string
): boolean {
  const canon = (x: string) => x.replace(/biriyani/g, "biryani");
  const norm = canon(normalizeForIntent(raw));
  const toks = new Set(norm.split(" ").filter((t) => t.length >= 3));
  if (toks.size === 0) return false;
  for (const m of menu) {
    const nameToks = canon(normalizeMenuName(m.name)).split(" ").filter((t) => t.length >= 3);
    for (const nt of nameToks) {
      if (toks.has(nt)) return true;
      for (const tt of toks) {
        if (tt.length >= 4 && nt.length >= 4 && levenshtein(tt, nt, 1) <= 1) return true;
      }
    }
    const catToks = canon(normalizeMenuName(catNameOf(m))).split(" ").filter((t) => t.length >= 3);
    for (const ct of catToks) {
      if (toks.has(ct)) return true;
      for (const tt of toks) {
        if (tt.length >= 4 && ct.length >= 4 && levenshtein(tt, ct, 1) <= 1) return true;
      }
    }
  }
  // Transliterated Tamil dish words ("பிரியாணி" → biryani) already normalized.
  return false;
}

// ---------------------------------------------------------------------------
// Kitchen-note safety — question words must NEVER become notes.
// ---------------------------------------------------------------------------

/** Tokens that must never appear in specialInstruction. */
export const NOTE_FORBIDDEN_TOKENS = new Set([
  // Tanglish questions
  "ena", "enna", "epdi", "eppadi", "pathi", "patti", "sollu", "sollunga",
  "slu", "sol", "solu", "details", "detail", "iruka", "iruku", "irukku",
  "kedaikuma", "kidaikuma", "available", "evlo", "evalo", "evalavu",
  "price", "suggest", "suggestion", "recommend", "recommendation",
  "kaatu", "kaattu", "kattu", "kaatunga", "kaattunga",
  "entha", "ethana", "etha", "edhu", "enga", "eppo", "epo", "peru",
  "tell", "me", "about", "what", "which", "how", "much", "is", "are",
  "do", "does", "you", "your", "have", "has", "there", "here",
  "the", "a", "an", "this", "that", "it", "of", "in", "on", "for",
  "my", "and", "or", "please", "konjam", "ah", "aa", "la", "lae",
  "illa", "dhaan", "thaan", "cheap", "cheapest", "costly", "costliest",
  "best", "vilai",
  // Tamil questions
  "பற்றி", "பத்தி", "எப்படி", "எவ்வளவு", "விலை", "இருக்கிறது",
  "இருக்கிறதா", "இருக்கு", "இருக்கா", "கிடைக்குமா", "காட்டு",
  "சொல்லுங்கள்", "சொல்லு", "விவரம்", "என்ன",
  // Order verbs (never notes)
  "kudu", "kudunga", "kodunga", "venum", "vendum", "venam",
  "pannu", "pannunga", "add", "order", "want", "give",
  "வேண்டும்", "வேணும்", "சேர்க்கவும்", "கொடுங்கள்",
]);

/** Strips forbidden question/order words from a raw notes string. */
export function sanitizeKitchenNotes(rawNotes: string): string {
  if (!rawNotes) return "";
  const toks = rawNotes
    .toLowerCase()
    .replace(/[^a-z0-9\u0b80-\u0bff\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !NOTE_FORBIDDEN_TOKENS.has(t));
  return toks.join(" ").slice(0, 200).trim();
}

// ---------------------------------------------------------------------------
// Main classifier — priority per spec.
// ---------------------------------------------------------------------------

export function classifyChatIntent(
  raw: string,
  menu: MenuItem[],
  catNameOf: (m: MenuItem) => string,
  opts: { lastIds?: string[] } = {}
): ChatIntentKind {
  const norm = normalizeForIntent(raw);
  const pad = padded(norm);
  const dishSignal = hasDishSignal(raw, menu, catNameOf);
  const restaurantMention = hasRestaurantMention(raw);
  const explicitOrder = isExplicitOrderIntent(raw);
  const questionSignal = hasQuestionSignal(raw);

  // 0. Cart — "cart" + order verb is an order, else a cart question.
  if (pad.includes(" cart ")) {
    if (explicitOrder) return "ORDER_INTENT";
    return "CART_QUERY";
  }

  // 1. Restaurant information (typo-tolerant + Tanglish/Tamil).
  // "restaurant pathi slu/sollu", "restaurant peru ena", "restaurant enga iruku",
  // "indha restaurant epdi", Tamil equivalents, + address/phone/GST/service.
  const infoVerbs = /about|details?|tell|sollu|sollunga|slu|pathi|patti|peru|name|called|enga|where|location|address|phone|contact|number|open|closed|thora|gst|service charge|payment|pay|bill|menu|cuisine|categor|how many|count|total|ethana|epdi|eppadi|ena|enna|iruku|iruka|details/.test(pad)
    || TAMIL_QUESTION_SUBSTRINGS.some((t) => raw.includes(t));
  if (restaurantMention && (infoVerbs || questionSignal || pad.trim().length < 30)) {
    // "restaurant open ah?" / time questions are still restaurant info family
    // (answerChat resolves hours vs open-status vs summary downstream).
    return "RESTAURANT_INFO";
  }
  // Bare open/GST/service-charge/payment/time questions without the word
  // "restaurant" are still restaurant facts (schema-grounded, never menu).
  if (
    /what time|open at|open time|opening hours|timing|closes|closing|eppo|thora/.test(pad) ||
    raw.includes("எப்போ") || raw.includes("நேரம்") || raw.includes("திறக்கும்") ||
    pad.includes(" gst ") || pad.includes(" service charge ") ||
    (/payment|bill/.test(pad) && !dishSignal)
  ) {
    return "RESTAURANT_INFO";
  }
  if (/cuisine|categor/.test(pad) && !dishSignal) return "RESTAURANT_INFO";
  if ((/address|where|location|enga|reach|direction/.test(pad) || raw.includes("எங்கே")) && !dishSignal) {
    return "RESTAURANT_INFO";
  }
  if (/\bcall\b|\bphone\b|\bcontact\b/.test(pad) || raw.includes("தொலைபேசி")) {
    if (!pad.includes(" 65 ")) return "RESTAURANT_INFO";
  }

  // 2/3. Dish-grounded questions: cheapest/filter wins over generic price
  // ("குறைந்த விலை தோசை" is cheapest, not a single-item price).
  const cheapestWords = /cheapest|cheap|kuraintha|குறைந்த|malivana|மலிவான|most expensive|costliest|costly|அதிக விலை/.test(pad);
  const priceWords = /how much|price|cost|rate|evlo|evalo|evalavu|விலை|எவ்வளவு/.test(pad);
  // "iruku/iruka/kedaikuma/available" with a dish = availability question.
  const availWords = /available|availability|stock|kidaikuma|kedaikuma|iruka|iruku|irukku|இருக்கு|இருக்கா|கிடைக்குமா/.test(pad);
  const infoWords = /about|details?|describe|explain|info|tell|sollu|sollunga|slu|pathi|patti|epdi|eppadi|பற்றி|எப்படி|விவரம்|சொல்லுங்கள்|what is|what are|is .* good|good\?/.test(pad);

  if (dishSignal && priceWords && !cheapestWords && !explicitOrder) return "PRICE_QUERY";
  if (dishSignal && availWords && !explicitOrder) {
    // "Biriyani ena iruku? / என்ன பிரியாணி இருக்கு?" has iruku BUT no
    // specific dish — it is discovery, not availability of one item.
    const genericListPattern = /(ena|enna|என்ன).*(iruku|iruka|irukku|இருக்கு|இருக்கா|கிடைக்குமா)/.test(pad + " " + raw);
    if (genericListPattern) {
      // fall through to discovery below
    } else {
      return "AVAILABILITY_QUERY";
    }
  }
  if (dishSignal && infoWords && !explicitOrder) return "FOOD_INFO";
  // "Egg biriyani epdi" — epdi alone with a dish is food info even if the
  // broader infoWords regex misses a phrasing.
  if (dishSignal && (/epdi|eppadi|எப்படி/.test(pad)) && !explicitOrder) return "FOOD_INFO";
  // "Egg biriyani evlo" — evlo alone with a dish is price.
  if (dishSignal && (/evlo|evalo|evalavu|எவ்வளவு/.test(pad)) && !explicitOrder) return "PRICE_QUERY";

  // 3b. Category / filter.
  if (/categor/.test(pad) && !explicitOrder) return "CATEGORY_QUERY";
  // "veg la ena iruku / chicken la ena iruku / dessert ena iruku"
  if (/(veg|chicken|mutton|dosa|idli|dessert|drinks|juice|seafood|biriyani|biryani).*(ena|enna|iruku|iruka|kaatu|kaattu)/.test(pad) && !explicitOrder) {
    return "MENU_DISCOVERY";
  }
  if (
    /under|below|less than|within|keela|kulla|க்குள்|கீழ்|between|cheapest|cheap|kuraintha|குறைந்த|malivana|மலிவான|most expensive|costliest|costly|அதிக விலை|how many|ethana|எத்தனை/.test(pad) &&
    !explicitOrder
  ) {
    return "FILTER_QUERY";
  }
  // Bare follow-up caps ("under 250") reuse listing scope.
  if (opts.lastIds && opts.lastIds.length > 0 && /\d{2,4}/.test(pad) && !dishSignal && !explicitOrder) {
    return "FILTER_QUERY";
  }
  if (opts.lastIds && opts.lastIds.length > 0 && /cheapest|cheap|kuraintha|குறைந்த|malivana/.test(pad) && !explicitOrder) {
    return "FILTER_QUERY";
  }

  // 4. Recommendation / discovery.
  if (/suggest|recommend|hungry|tasty|craving|best|popular|favourite|favorite|pasikku|pasi/.test(pad) && !explicitOrder) {
    return "RECOMMENDATION";
  }
  if (/compare|versus|\bvs\b|which is (better|cheaper|best)|difference between|ஒப்பிடு/.test(pad)) {
    return "COMPARISON";
  }
  // Generic listing: "Biriyani ena iruku", "What biriyani do you have?",
  // "Show chicken items", "kaatu".
  const listingTriggers = /what|which|list|show|options|menu|have|enna|ena|kaatu|kaattu|kattu|காட்டு|iruku|iruka|irukku|ulladhu|kulla/.test(pad);
  if (dishSignal && listingTriggers && !explicitOrder) return "MENU_DISCOVERY";
  // Bare dish word with question signal ("Biriyani ena iruku") already
  // covered; a bare dish word WITHOUT question signal and WITHOUT order
  // verb is still discovery, never an order ("biriyani" alone lists).
  if (dishSignal && questionSignal && !explicitOrder) return "MENU_DISCOVERY";

  // 6. Explicit order only.
  if (explicitOrder) return "ORDER_INTENT";
  // Quantity + dish without any question signal is an order ("Rendu dosa",
  // "2 egg biriyani", "oru chicken biriyani").
  if (hasQuantitySignal(raw) && dishSignal && !questionSignal) return "ORDER_INTENT";

  // 7. General restaurant conversation.
  if (/vanakkam|hello|\bhi\b|hey|thanks|thank|nandri|help|how to order|how do i order|what can you do|timing/.test(pad)) {
    return "GENERAL_RESTAURANT_CONVERSATION";
  }
  if (restaurantMention && !dishSignal) return "GENERAL_RESTAURANT_CONVERSATION";

  // 8. Unknown.
  return "UNKNOWN";
}
