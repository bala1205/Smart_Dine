import type { MenuItem } from "../types/menu";
import type { VoiceOrderResult, NaturalLanguageResult, OrderIntent, NaturalLanguageIntent } from "../types/aiOrder";

/**
 * Validates AI intent against actual menu — NEVER trusts AI price/stock/tax.
 * Returns OrderIntent with resolved menuItemId, price, availability.
 */
export function resolveVoiceIntent(
  result: VoiceOrderResult,
  menu: MenuItem[]
): OrderIntent {
  const menuByName = new Map<string, MenuItem>();
  for (const m of menu) menuByName.set(m.name, m);
  // Also case-insensitive map for robustness
  const lowerMap = new Map<string, MenuItem>();
  for (const m of menu) lowerMap.set(m.name.toLowerCase(), m);

  const items: OrderIntent["items"] = [];
  const seen = new Set<string>();

  const rawItems = Array.isArray((result as unknown as { items?: unknown })?.items)
    ? (result as { items: Array<{ name?: unknown; quantity?: unknown }> }).items
    : [];
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    const name = String((it as { name?: unknown }).name || "").trim();
    if (!name) continue;
    const exact = menuByName.get(name) || lowerMap.get(name.toLowerCase());
    if (!exact) continue; // hallucinated — skip
    if (seen.has(exact.id)) {
      const ex = items.find((x) => x.menuItemId === exact.id);
      if (ex) ex.quantity = Math.min(20, ex.quantity + Math.max(1, Math.min(20, Math.floor(Number((it as { quantity?: unknown }).quantity) || 1))));
      continue;
    }
    seen.add(exact.id);
    const qty = Math.max(1, Math.min(20, Math.floor(Number((it as { quantity?: unknown }).quantity) || 1)));
    items.push({
      menuItemId: exact.id,
      quantity: qty,
      name: exact.name,
      price: exact.price, // authoritative
      available: exact.isAvailable && !isOutOfStock(exact),
    });
  }

  // Handle ambiguous — map options to ids for UI selection
  const ambiguous = (result.ambiguous || [])
    .map((a) => ({
      query: a.query,
      options: a.options
        .map((name) => {
          const m = menuByName.get(name) || lowerMap.get(name.toLowerCase());
          return m ? { id: m.id, name: m.name } : null;
        })
        .filter(Boolean) as Array<{ id: string; name: string }>,
    }))
    .filter((a) => a.options.length > 1);

  return {
    items: items.slice(0, 10),
    notes: result.notes?.slice(0, 500) || "",
    ambiguous: ambiguous.slice(0, 3),
    transcript: result.transcript,
  };
}

export function resolveNaturalIntent(
  result: NaturalLanguageResult,
  menu: MenuItem[]
): NaturalLanguageIntent {
  const menuByName = new Map<string, MenuItem>();
  for (const m of menu) menuByName.set(m.name, m);
  const lowerMap = new Map<string, MenuItem>();
  for (const m of menu) lowerMap.set(m.name.toLowerCase(), m);

  if (result.noMatch) {
    return { matches: [], noMatch: true, reason: result.reason || "No matching item is currently available.", query: result.query };
  }

  const matches: NaturalLanguageIntent["matches"] = [];
  const seen = new Set<string>();
  for (const it of result.matches) {
    const m = menuByName.get(it.name) || lowerMap.get(it.name.toLowerCase());
    if (!m) continue;
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    matches.push({
      menuItemId: m.id,
      quantity: Math.max(1, Math.min(20, Math.floor(it.quantity ?? 1))),
      name: m.name,
      price: m.price,
      available: m.isAvailable && !isOutOfStock(m),
    });
    if (matches.length >= 5) break;
  }

  if (matches.length === 0) {
    return { matches: [], noMatch: true, reason: "No matching item is currently available.", query: result.query };
  }

  return { matches, noMatch: false, reason: result.reason, query: result.query };
}

function isOutOfStock(m: MenuItem): boolean {
  const enabled = m.trackStock || m.stockEnabled;
  if (!enabled) return false;
  const qty = Number(m.stockQuantity);
  return Number.isFinite(qty) && qty <= 0;
}

// Tamil dish transliteration map — Tamil script food words to English menu keywords
const TAMIL_DISH_ALIASES: Record<string, string> = {
  "பிரியாணி": "biryani",
  "பிரியாணீ": "biryani",
  "பிரியாணிய": "biryani",
  "தோசை": "dosa",
  "தோசா": "dosa",
  "தோசைகள்": "dosa",
  "இட்லி": "idli",
  "இட்லிகள்": "idli",
  "பரோட்டா": "parotta",
  "பரோட்டாக்கள்": "parotta",
  "சிக்கன்": "chicken",
  "சிக்கின்": "chicken",
  "மட்டன்": "mutton",
  "பன்னீர்": "paneer",
  "பனீர்": "paneer",
  "ஜூஸ்": "juice",
  "காபி": "coffee",
  "காப்பி": "coffee",
  "தேநீர்": "tea",
  "சாதம்": "rice",
  "கறி": "curry",
  "மசாலா": "masala",
  "பட்டர்": "butter",
};

// Common Tamil/Tanglish conversational/order words to remove before matching (stop words)
// Note: do NOT include quantity words (oru/rendu/etc.) — they are handled separately for quantity extraction
const TAMIL_STOP_WORDS = new Set([
  "வேணும்", "வேண்டும்", "வேணும", "வேண்டும்", "கொடுங்க", "குடு", "கொடுக்கவும்", "குடுங்க",
  "venum", "vendum", "venam", "kudu", "kudunga",
  "pannunga", "pannu", "add",
  "enakku", "enaku", "enak", "enukku", "please", "kodunga",
]);

function transliterateTamilFoodWords(s: string): string {
  let out = s;
  for (const [tamil, eng] of Object.entries(TAMIL_DISH_ALIASES)) {
    // Replace Tamil dish word with English equivalent for matching against English menu
    const regex = new RegExp(tamil.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    out = out.replace(regex, eng);
  }
  return out;
}

// Client-side deterministic fallback for voice — mirrors server fallbackParseVoice
export function fallbackParseVoiceClient(transcript: string, menu: MenuItem[]): VoiceOrderResult {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0B80-\u0BFF\s]/g, " ").trim();
  const singular = (s: string) => (s.endsWith("s") && s.length > 3 ? s.slice(0, -1) : s);
  // First transliterate Tamil dish words to English for menu matching
  const transliterated = transliterateTamilFoodWords(transcript);
  const lower = normalize(transliterated);
  const lowerSingular = lower
    .split(/\s+/)
    .map(singular)
    .join(" ");
  // Remove stop words for cleaner matching, but keep numbers
  const tokens = lowerSingular.split(/\s+/).filter((t) => !TAMIL_STOP_WORDS.has(t) && Boolean(t));
  const rawTokens = lower.split(/\s+/).filter((t) => !TAMIL_STOP_WORDS.has(t) && Boolean(t));
  const tamilMap: Record<string, number> = {
    // Tanglish / Tamil numerals
    oru: 1, onnu: 1, onru: 1, rendu: 2, randu: 2, munnu: 3, moonru: 3, moondru: 3, naalu: 4, ainthu: 5, aaru: 6, aru: 6, elu: 7, ezhu: 7, ettu: 8, onpathu: 9, onbathu: 9, pathu: 10, pattu: 10,
    // Tamil script
    "ஒன்று": 1, "ஒரு": 1, "இரண்டு": 2, "ரெண்டு": 2, "மூன்று": 3, "நான்கு": 4, "ஐந்து": 5, "ஆறு": 6, "ஏழு": 7, "எட்டு": 8, "ஒன்பது": 9, "பத்து": 10,
    // English
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    // Additional Tanglish variants (rendu/randu already above)
    irandu: 2, mudu: 3,
  };
  const toNum = (tok: string): number | null => {
    const t = singular(tok);
    if (tamilMap[t] != null) return tamilMap[t];
    if (tamilMap[tok] != null) return tamilMap[tok];
    const n = parseInt(tok, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const menuNorm = menu
    .map((m) => {
      const norm = normalize(m.name);
      return { item: m, norm, normSingular: norm.split(/\s+/).map(singular).join(" ") };
    })
    .sort((a, b) => b.norm.length - a.norm.length);

  const result: Array<{ name: string; quantity: number }> = [];
  const used = new Set<string>();
  let i = 0;
  while (i < tokens.length) {
    let qty = toNum(rawTokens[i] || tokens[i]);
    let consumed = 0;
    if (qty != null) {
      consumed = 1;
    } else {
      qty = 1;
    }
    let matched: typeof menuNorm[0] | null = null;
    let matchedLen = 0;
    for (const mn of menuNorm) {
      const nameTokens = mn.normSingular.split(/\s+/).filter(Boolean);
      const start = i + consumed;
      if (start + nameTokens.length > tokens.length) continue;
      const slice = tokens.slice(start, start + nameTokens.length).join(" ");
      if (slice === mn.normSingular) {
        matched = mn;
        matchedLen = nameTokens.length;
        break;
      }
    }
    if (matched) {
      if (!used.has(matched.item.id)) {
        result.push({ name: matched.item.name, quantity: qty! });
        used.add(matched.item.id);
      } else {
        const ex = result.find((r) => r.name === matched!.item.name);
        if (ex) ex.quantity += qty!;
      }
      i += consumed + (matchedLen || 1);
      continue;
    }
    // No exact match at this position — move forward one token
    i += 1;
    if (result.length > 20) break;
  }
  // Second pass: for any menu items whose name appears in transcript but were missed due to plural or "and" gaps,
  // add them if not already captured. Try to infer quantity from preceding number in transcript.
  for (const mn of menuNorm) {
    if (used.has(mn.item.id)) continue;
    if (lowerSingular.includes(mn.normSingular)) {
      // Try to find preceding quantity for this dish in the transcript
      let inferredQty = 1;
      const idx = lowerSingular.indexOf(mn.normSingular);
      if (idx > 0) {
        const before = lowerSingular.slice(0, idx).trim().split(/\s+/).pop() || "";
        const q = toNum(before);
        if (q != null) inferredQty = q;
      }
      result.push({ name: mn.item.name, quantity: inferredQty });
      used.add(mn.item.id);
    }
  }
  const dedup = new Map<string, number>();
  for (const r of result) dedup.set(r.name, (dedup.get(r.name) || 0) + r.quantity);
  const items = Array.from(dedup.entries()).map(([name, quantity]) => ({ name, quantity: Math.min(quantity, 20) })).slice(0, 10);
  return { items, notes: "", ambiguous: [], transcript };
}
