import type { MenuItem } from "../types/menu";
import type { VoiceOrderResult, NaturalLanguageResult, OrderIntent, NaturalLanguageIntent } from "../types/aiOrder";

/**
 * Normalizes a dish name for tolerant comparison: lowercase, punctuation
 * stripped (Tamil script preserved), whitespace collapsed.
 */
export function normalizeMenuName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u0b80-\u0bff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Capped Levenshtein distance (early exit above cap). Pure — unit tested. */
export function levenshtein(a: string, b: string, cap = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

export type MenuMatchResult =
  | { kind: "match"; item: MenuItem }
  | { kind: "ambiguous"; options: MenuItem[] }
  | { kind: "none" };

/**
 * Matches one AI/natural name against the ACTUAL loaded restaurant menu.
 * Never invents: exact → case-insensitive → normalized → whole-phrase
 * substring → token-level fuzzy (prefix / small typo, e.g. "biriyani" →
 * "biryani"). Equally-good multiple candidates become "ambiguous" so the UI
 * asks "Did you mean …?" instead of guessing. Pure — unit tested.
 */
export function findMenuMatch(rawName: string, menu: MenuItem[]): MenuMatchResult {
  const name = rawName.trim();
  if (!name || menu.length === 0) return { kind: "none" };
  const direct = menu.find((m) => m.name === name);
  if (direct) return { kind: "match", item: direct };
  const lower = name.toLowerCase();
  const ci = menu.find((m) => m.name.toLowerCase() === lower);
  if (ci) return { kind: "match", item: ci };
  const norm = normalizeMenuName(name);
  if (!norm) return { kind: "none" };
  const normHit = menu.find((m) => normalizeMenuName(m.name) === norm);
  if (normHit) return { kind: "match", item: normHit };

  // Whole-phrase substring ("dosa" inside "Masala Dosa").
  if (norm.length >= 3) {
    const sub = menu.filter((m) => normalizeMenuName(m.name).includes(norm));
    if (sub.length === 1) return { kind: "match", item: sub[0] };
    if (sub.length > 1) return { kind: "ambiguous", options: sub.slice(0, 5) };
  }

  // Token-level fuzzy: every query token must resemble a menu-name token.
  const qToks = norm.split(" ").filter((t) => t.length >= 2);
  if (qToks.length === 0) return { kind: "none" };
  const scored: Array<{ m: MenuItem; cost: number }> = [];
  for (const m of menu) {
    const mToks = normalizeMenuName(m.name).split(" ").filter(Boolean);
    let cost = 0;
    let ok = true;
    for (const q of qToks) {
      let best = Infinity;
      for (const t of mToks) {
        if (t === q) {
          best = 0;
          break;
        }
        if (t.startsWith(q) || q.startsWith(t)) {
          best = Math.min(best, 1);
          continue;
        }
        if (q.length >= 4 && t.length >= 4 && levenshtein(q, t, 1) <= 1) {
          best = Math.min(best, 2);
        }
      }
      if (best === Infinity) {
        ok = false;
        break;
      }
      cost += best;
    }
    // Reject weak overall resemblance (prevents "fake pizza" style drift).
    if (ok && cost <= 2 * qToks.length) scored.push({ m, cost });
  }
  if (scored.length === 0) return { kind: "none" };
  scored.sort((a, b) => a.cost - b.cost);
  if (scored.length === 1 || scored[0].cost < scored[1].cost) {
    return { kind: "match", item: scored[0].m };
  }
  const tied = scored
    .filter((s) => s.cost === scored[0].cost)
    .map((s) => s.m)
    .slice(0, 5);
  if (tied.length > 1) return { kind: "ambiguous", options: tied };
  return { kind: "match", item: scored[0].m };
}

/** Maps AI-provided ambiguous option names to real menu ids (tolerant). */
function mapAmbiguousOptions(
  options: string[],
  menu: MenuItem[]
): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  for (const name of options) {
    const hit = findMenuMatch(String(name || ""), menu);
    if (hit.kind === "match" && !seen.has(hit.item.id)) {
      seen.add(hit.item.id);
      out.push({ id: hit.item.id, name: hit.item.name });
    } else if (hit.kind === "ambiguous") {
      for (const opt of hit.options) {
        if (!seen.has(opt.id)) {
          seen.add(opt.id);
          out.push({ id: opt.id, name: opt.name });
        }
      }
    }
  }
  return out;
}

/**
 * Validates AI intent against actual menu — NEVER trusts AI price/stock/tax.
 * Returns OrderIntent with resolved menuItemId, price, availability.
 */
export function resolveVoiceIntent(
  result: VoiceOrderResult,
  menu: MenuItem[]
): OrderIntent {
  const items: OrderIntent["items"] = [];
  const seen = new Set<string>();
  const extraAmbiguous: NonNullable<OrderIntent["ambiguous"]> = [];

  const rawItems = Array.isArray((result as unknown as { items?: unknown })?.items)
    ? (result as { items: Array<{ name?: unknown; quantity?: unknown }> }).items
    : [];
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    const name = String((it as { name?: unknown }).name || "").trim();
    if (!name) continue;
    const hit = findMenuMatch(name, menu);
    if (hit.kind === "ambiguous") {
      extraAmbiguous.push({
        query: name,
        options: hit.options.map((o) => ({ id: o.id, name: o.name })),
      });
      continue;
    }
    if (hit.kind === "none") continue; // hallucinated — skip
    const exact = hit.item;
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
      options: mapAmbiguousOptions(a.options, menu),
    }))
    .filter((a) => a.options.length > 1);
  for (const extra of extraAmbiguous) {
    if (extra.options.length > 1 && !ambiguous.some((a) => a.query === extra.query)) {
      ambiguous.push(extra);
    }
  }

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
  if (result.noMatch) {
    return { matches: [], noMatch: true, reason: result.reason || "No matching item is currently available.", query: result.query, notes: "", answer: result.answer || "" };
  }

  const matches: NaturalLanguageIntent["matches"] = [];
  const seen = new Set<string>();
  for (const it of result.matches) {
    const hit = findMenuMatch(String(it.name || ""), menu);
    // Natural path has no ambiguous UI — only accept a single confident hit.
    if (hit.kind !== "match") continue;
    const m = hit.item;
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
    return { matches: [], noMatch: true, reason: "No matching item is currently available.", query: result.query, notes: "", answer: result.answer || "" };
  }

  return { matches, noMatch: false, reason: result.reason, query: result.query, notes: result.notes?.slice(0, 200) || "", answer: result.answer?.slice(0, 500) || "" };
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
  "வெஜ்": "veg",
  "சைவ": "veg",
  "டெசர்ட்": "dessert",
  "டிரிங்க்ஸ்": "drinks",
  "டிரிங்க்": "drinks",
};

// Common Tamil/Tanglish conversational/order words to remove before matching (stop words)
// Note: do NOT include quantity words (oru/rendu/etc.) — they are handled separately for quantity extraction
const TAMIL_STOP_WORDS = new Set([
  "வேணும்", "வேண்டும்", "வேணும", "வேண்டும்", "கொடுங்க", "குடு", "கொடுக்கவும்", "குடுங்க",
  "venum", "vendum", "venam", "kudu", "kudunga",
  "pannunga", "pannu", "add",
  "enakku", "enaku", "enak", "enukku", "please", "kodunga",
]);

/**
 * Question/conversation words that must NEVER become kitchen notes
 * ("epdi" means "how is it", not a modification). Filtered from notes only —
 * matching logic is untouched so the 88-dish matrix stays intact.
 * Exported for chat intent sanitization reuse.
 */
export const QUESTION_NOTE_EXCLUDE = new Set([
  "ena", "enna", "epdi", "eppadi", "pathi", "patti", "sollu", "sollunga",
  "slu", "sol", "solu", "details", "detail", "iruka", "iruku", "irukku",
  "kedaikuma", "kidaikuma", "available", "evlo", "evalo", "evalavu",
  "price", "suggest", "suggestion", "recommend", "recommendation",
  "kaatu", "kaattu", "kattu", "kaatunga", "kaattunga",
  "entha", "ethana", "etha", "edhu", "enga", "eppo", "epo", "peru",
  "tell", "me", "about", "what", "which", "how", "much",
  "cheap", "cheapest", "costly", "costliest", "best", "vilai",
  "describe", "explain", "info",
  "பற்றி", "பத்தி", "எப்படி", "எவ்வளவு", "விலை", "இருக்கிறது",
  "இருக்கிறதா", "இருக்கு", "இருக்கா", "கிடைக்குமா", "காட்டு",
  "சொல்லுங்கள்", "சொல்லு", "விவரம்", "என்ன",
]);

// Unit words ("two plates", "rendu plate", "இரண்டு பிளேட்") — quantities are
// parsed separately, so these are neither dishes nor kitchen notes.
const PLATE_WORDS = new Set([
  "plate", "plates", "thattu", "thattugal", "தட்டு", "தட்டுகள்", "பிளேட்",
]);

export function transliterateTamilFoodWords(s: string): string {
  let out = s;
  for (const [tamil, eng] of Object.entries(TAMIL_DISH_ALIASES)) {
    // Replace Tamil dish word with English equivalent for matching against English menu
    const regex = new RegExp(tamil.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    out = out.replace(regex, eng);
  }
  return out;
}

// Client-side deterministic fallback for voice — mirrors server fallbackParseVoice
const TENS_WORDS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const ONES_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};

/**
 * Expands spoken tens ("sixty five" → "65", "twenty" → "20") so dishes like
 * "Chicken 65" match speech. Quantities still clamp to 1–20 downstream.
 * Pure — unit tested.
 */
export function expandNumberWords(text: string): string {
  let out = ` ${text} `;
  out = out.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_m, t: string, o: string) => ` ${TENS_WORDS[t.toLowerCase()] + ONES_WORDS[o.toLowerCase()]} `
  );
  out = out.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,
    (m) => ` ${TENS_WORDS[m.toLowerCase()]} `
  );
  return out.replace(/\s+/g, " ").trim();
}

export function fallbackParseVoiceClient(transcript: string, menu: MenuItem[]): VoiceOrderResult {
  transcript = expandNumberWords(transcript);
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
    oru: 1, onnu: 1, onru: 1, rendu: 2, randu: 2, munnu: 3, moonnu: 3, moonu: 3, moonru: 3, moondru: 3, naalu: 4, ainthu: 5, anju: 5, aaru: 6, aru: 6, elu: 7, ezhu: 7, ettu: 8, onpathu: 9, onbathu: 9, pathu: 10, pattu: 10,
    // Tamil script
    "ஒன்று": 1, "ஒரு": 1, "இரண்டு": 2, "ரெண்டு": 2, "மூன்று": 3, "நான்கு": 4, "ஐந்து": 5, "ஆறு": 6, "ஏழு": 7, "எட்டு": 8, "ஒன்பது": 9, "பத்து": 10,
    // English
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
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

  // Tolerant dish-token comparison: exact (singular/plural already applied by
  // callers) plus single-typo tokens ("biriyani" vs "biryani") so real speech
  // still hits the real menu item. Strict prefix fragments are deliberately
  // NOT matched here — they flow to the partial-speech pass which asks
  // "Did you mean …?" instead of guessing.
  const dishTokensMatch = (nameToks: string[], sliceToks: string[]): boolean => {
    if (nameToks.length !== sliceToks.length) return false;
    return nameToks.every((w, k) => {
      const s = sliceToks[k];
      if (w === s) return true;
      if (w.length >= 4 && s.length >= 4 && levenshtein(w, s, 1) <= 1) return true;
      return false;
    });
  };

  const result: Array<{ name: string; quantity: number }> = [];
  const used = new Set<string>();
  // Token positions consumed by dish/quantity matches — leftovers become
  // customization notes (e.g. "medium spicy, no onion"), never silently lost.
  const consumedIdx = new Set<number>();
  const isPlateWord = (raw: string): boolean => {
    const n = raw.toLowerCase().replace(/[^a-z0-9\u0b80-\u0bff]/g, "");
    const sing = n.endsWith("s") && n.length > 3 ? n.slice(0, -1) : n;
    return PLATE_WORDS.has(n) || PLATE_WORDS.has(sing);
  };
  let i = 0;
  while (i < tokens.length) {
    let qty = toNum(rawTokens[i] || tokens[i]);
    let consumed = 0;
    if (qty != null) {
      consumed = 1;
      // Skip unit words between quantity and dish ("rendu plate chicken").
      while (consumed < 3 && isPlateWord(rawTokens[i + consumed] || "")) consumed++;
    } else {
      qty = 1;
    }
    let matched: typeof menuNorm[0] | null = null;
    let matchedLen = 0;
    for (const mn of menuNorm) {
      const nameTokens = mn.normSingular.split(/\s+/).filter(Boolean);
      const start = i + consumed;
      if (start + nameTokens.length > tokens.length) continue;
      const sliceToks = tokens.slice(start, start + nameTokens.length);
      if (dishTokensMatch(nameTokens, sliceToks)) {
        matched = mn;
        matchedLen = nameTokens.length;
        break;
      }
    }
    if (matched) {
      for (let k = i; k < i + consumed + matchedLen; k++) consumedIdx.add(k);
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
  // Ambiguous candidates collected by the subset pass (shared-top ties) and
  // the partial-word pass below. Never auto-added — the UI asks instead.
  const ambiguous: VoiceOrderResult["ambiguous"] = [];
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
  // Subset pass: the transcript names a real dish without its full menu title
  // ("chicken biriyani" → "Hyderabadi Chicken Dum Biriyani"). Emits only a
  // UNIQUE best-scoring real item. When several real items share the top
  // score ("tandoori chicken" → Full + Half, "biriyani" → every biriyani),
  // an ambiguous "Did you mean …?" entry is produced instead — never an
  // automatic guess, never an auto-add.
  if (result.length === 0) {
    const scored: Array<{ mn: (typeof menuNorm)[0]; score: number; firstIdx: number; tokIdx: number[] }> = [];
    for (const mn of menuNorm) {
      const nameToks = mn.normSingular.split(/\s+/).filter(Boolean);
      const usedTok = new Set<number>();
      const tokIdx: number[] = [];
      let score = 0;
      for (const w of nameToks) {
        const idx = tokens.findIndex(
          (t, k) =>
            !usedTok.has(k) &&
            (t === w || (t.length >= 4 && w.length >= 4 && levenshtein(t, w, 1) <= 1))
        );
        if (idx >= 0) {
          usedTok.add(idx);
          tokIdx.push(idx);
          score++;
        }
      }
      if (score > 0) {
        scored.push({ mn, score, firstIdx: Math.min(...tokIdx), tokIdx });
      }
    }
    scored.sort((a, b) => b.score - a.score || a.mn.norm.length - b.mn.norm.length);
    const best = scored.length > 0 ? scored[0].score : 0;
    const top = scored.filter((s) => s.score === best);
    const need = (mn: (typeof menuNorm)[0]) =>
      Math.min(2, mn.normSingular.split(/\s+/).filter(Boolean).length);
    if (best > 0 && top.length === 1 && top[0].score >= need(top[0].mn)) {
      const win = top[0];
      let q = 1;
      if (win.firstIdx > 0) {
        const pq = toNum(rawTokens[win.firstIdx - 1] || tokens[win.firstIdx - 1]);
        if (pq != null) {
          q = pq;
          consumedIdx.add(win.firstIdx - 1);
        }
      }
      for (const k of win.tokIdx) consumedIdx.add(k);
      result.push({ name: win.mn.item.name, quantity: q });
      used.add(win.mn.item.id);
    } else if (best > 0 && top.length > 1) {
      ambiguous.push({
        query: "",
        options: top.slice(0, 5).map((s) => s.mn.item.name),
      });
    }
  }
  const dedup = new Map<string, number>();
  for (const r of result) dedup.set(r.name, (dedup.get(r.name) || 0) + r.quantity);
  const items = Array.from(dedup.entries()).map(([name, quantity]) => ({ name, quantity: Math.min(quantity, 20) })).slice(0, 10);

  // Third pass: partial-word recovery for uncertain/partial speech
  // ("chicken bri..."). A transcript token (len >= 3) that is a STRICT prefix
  // of a menu-name token (never an equal word) suggests the dish. Exactly one
  // candidate dish -> add it; several -> ambiguous "Did you mean …?" entry.
  // Never silently adds when unclear; never touches already-matched items.
  if (items.length === 0) {
    const allNameTokens = new Set<string>();
    for (const mn of menuNorm) {
      for (const w of mn.normSingular.split(/\s+/).filter(Boolean)) allNameTokens.add(w);
    }
    const candidateIds = new Map<string, { name: string; word: string }>();
    const toks = lowerSingular
      .split(/\s+/)
      .filter((t) => Boolean(t) && !TAMIL_STOP_WORDS.has(t));
    toks.forEach((tok) => {
      if (tok.length < 3 || allNameTokens.has(tok)) return;
      for (const mn of menuNorm) {
        if (used.has(mn.item.id) || candidateIds.has(mn.item.id)) continue;
        const nameToks = mn.normSingular.split(/\s+/).filter(Boolean);
        if (nameToks.some((w) => w.length > tok.length && w.startsWith(tok))) {
          candidateIds.set(mn.item.id, { name: mn.item.name, word: tok });
        }
      }
    });
    if (candidateIds.size === 1) {
      const [id, cand] = Array.from(candidateIds.entries())[0];
      void id;
      const beforeIdx = toks.indexOf(cand.word) - 1;
      const q = beforeIdx >= 0 ? toNum(toks[beforeIdx]) : null;
      items.push({ name: cand.name, quantity: q ?? 1 });
    } else if (candidateIds.size > 1) {
      const byWord = new Map<string, string[]>();
      for (const cand of candidateIds.values()) {
        const list = byWord.get(cand.word) || [];
        list.push(cand.name);
        byWord.set(cand.word, list);
      }
      for (const [word, names] of byWord) {
        const unique = Array.from(new Set(names)).slice(0, 5);
        if (unique.length > 1) ambiguous.push({ query: word, options: unique });
      }
    }
  }
  // Leftover transcript words (not part of any dish/quantity match) become
  // customization notes for the cart instruction — e.g. "medium spicy" or
  // "no onion" in "2 chicken biriyani medium spicy, no onion".
  // Question/conversation words ("epdi", "pathi", "evlo", ...) are NEVER notes.
  const notes = tokens
    .filter((t, idx) => {
      if (consumedIdx.has(idx)) return false;
      if (!t || t.length < 2) return false;
      if (TAMIL_STOP_WORDS.has(t)) return false;
      if (PLATE_WORDS.has(t)) return false;
      if (QUESTION_NOTE_EXCLUDE.has(t)) return false;
      if (toNum(t) != null) return false;
      return true;
    })
    .join(" ")
    .slice(0, 200);
  return { items, notes, ambiguous: ambiguous.slice(0, 3), transcript };
}

/**
 * How much of the CONFIRMED item names actually appears in the transcript
 * (0..1). Low coverage on a non-empty match means the match is shaky —
 * callers should ask "Did you mean …?" instead of trusting it.
 * Pure helper (unit tested). Web Speech provides no confidence values, so
 * transcript-ambiguity is the signal.
 */
export function getTranscriptCoverage(transcript: string, intent: OrderIntent): number {
  const singular = (s: string) => (s.endsWith("s") && s.length > 3 ? s.slice(0, -1) : s);
  const toks = new Set(
    transcript
      .toLowerCase()
      .replace(/[^a-z0-9\u0B80-\u0BFF\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map(singular)
  );
  if (toks.size === 0 || intent.items.length === 0) return 0;
  let matched = 0;
  let total = 0;
  for (const it of intent.items) {
    for (const w of it.name.toLowerCase().split(/\s+/).filter(Boolean)) {
      total++;
      if (toks.has(w) || toks.has(singular(w))) matched++;
    }
  }
  return total === 0 ? 0 : matched / total;
}
