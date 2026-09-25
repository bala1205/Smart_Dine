import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../lib/firebase";
import type { MenuItem } from "../types/menu";
import type { NaturalLanguageResult, NaturalLanguageIntent } from "../types/aiOrder";
import { resolveNaturalIntent } from "./aiMenuMatcher";
import { fallbackParseVoiceClient } from "./aiMenuMatcher";

const MAX_QUERY = 500;
const MAX_MENU_FOR_AI = 50;

function toMinimalMenu(menu: MenuItem[]) {
  return menu
    .filter((m) => m.isAvailable)
    .slice(0, MAX_MENU_FOR_AI)
    .map((m) => ({
      id: m.id,
      name: m.name,
      category: m.categoryId,
      description: m.description?.slice(0, 80) || "",
      available: true,
    }));
}

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

// Simple fallback for natural language when Gemini unavailable
function fallbackNatural(query: string, menu: MenuItem[]): NaturalLanguageResult {
  const translit = transliterateTamilForNatural(query);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0B80-\u0BFF\s]/g, " ").trim();
  const lower = normalize(translit).toLowerCase();
  const exactNorm = lower.trim();

  // PRIORITY 1: Exact normalized name match — for "Chicken Biryani" return that single item
  const exact = menu.find((m) => normalize(m.name) === exactNorm);
  if (exact) {
    const wantsTwo = /two|2 people|for two|rendu|irandu/i.test(lower);
    return { matches: [{ name: exact.name, quantity: wantsTwo ? 2 : 1 }], query };
  }
  // Also check if lower contains an exact dish name as a whole phrase
  for (const m of menu) {
    const normName = normalize(m.name);
    if (lower === normName || lower.includes(` ${normName} `) || lower.startsWith(`${normName} `) || lower.endsWith(` ${normName}`)) {
      const wantsTwo = /two|2 people|for two|rendu|irandu/i.test(lower);
      return { matches: [{ name: m.name, quantity: wantsTwo ? 2 : 1 }], query };
    }
  }

  // Try voice fallback for quantity-aware parsing (e.g., "rendu biryani venum")
  const fb = fallbackParseVoiceClient(query, menu);
  if (fb.items.length > 0) {
    // But if the original query was a specific dish name and fallback found multiple chicken items, prefer exact
    // Check if any fb item is an exact match for the query
    const exactFb = fb.items.find((it) => normalize(it.name) === exactNorm);
    if (exactFb) {
      return { matches: [{ name: exactFb.name, quantity: exactFb.quantity }], query };
    }
    return { matches: fb.items.map((it) => ({ name: it.name, quantity: it.quantity })), query };
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
  menu: MenuItem[]
): Promise<NaturalLanguageIntent> {
  const clean = query.trim().slice(0, MAX_QUERY);
  if (!clean || clean.length < 2) throw new Error("Please enter a valid request.");
  if (!restaurantId) throw new Error("Missing restaurant.");

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
      const minimal = toMinimalMenu(menu);
      const filteredMenu = menu.filter((m) => minimal.some((mm) => mm.id === m.id));
      return resolveNaturalIntent(fallbackNatural(clean, filteredMenu), menu);
    }
    try {
      const fb = fallbackNatural(clean, menu);
      const resolved = resolveNaturalIntent(fb, menu);
      if (!resolved.noMatch) return resolved;
    } catch {
      // ignore
    }
    throw new Error(err?.message || "Smart recommendations are temporarily unavailable. Please browse the menu.");
  }
}
