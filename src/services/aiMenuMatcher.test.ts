import { describe, it, expect } from "vitest";
import { resolveVoiceIntent, resolveNaturalIntent, fallbackParseVoiceClient, getTranscriptCoverage, findMenuMatch, normalizeMenuName, levenshtein } from "./aiMenuMatcher";
import type { MenuItem } from "../types/menu";
import type { VoiceOrderResult, NaturalLanguageResult } from "../types/aiOrder";

function makeMenu(overrides: Partial<MenuItem>[] = []): MenuItem[] {
  const base: MenuItem[] = [
    {
      id: "m1",
      name: "Chicken Biryani",
      description: "Spicy chicken biryani",
      price: 250,
      categoryId: "c1",
      imageUrl: "",
      preparationTime: 15,
      isAvailable: true,
      trackStock: false,
      stockQuantity: 10,
      lowStockThreshold: 2,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "m2",
      name: "Paneer Butter Masala",
      description: "Creamy paneer",
      price: 180,
      categoryId: "c1",
      imageUrl: "",
      preparationTime: 10,
      isAvailable: true,
      trackStock: false,
      stockQuantity: 10,
      lowStockThreshold: 2,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "m3",
      name: "Lime Juice",
      description: "Fresh lime",
      price: 40,
      categoryId: "c2",
      imageUrl: "",
      preparationTime: 5,
      isAvailable: true,
      trackStock: false,
      stockQuantity: 10,
      lowStockThreshold: 2,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "m4",
      name: "Mutton Biryani",
      description: "Mutton biryani",
      price: 300,
      categoryId: "c1",
      imageUrl: "",
      preparationTime: 20,
      isAvailable: true,
      trackStock: false,
      stockQuantity: 10,
      lowStockThreshold: 2,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "m5",
      name: "Veg Biryani",
      description: "Vegetable biryani",
      price: 180,
      categoryId: "c1",
      imageUrl: "",
      preparationTime: 15,
      isAvailable: false,
      trackStock: false,
      stockQuantity: 0,
      lowStockThreshold: 2,
      createdAt: 0,
      updatedAt: 0,
    },
  ];
  if (overrides.length === 0) return base;
  return overrides.map((o, i) => ({ ...base[i % base.length], ...o, id: o.id || `m${i}` })) as MenuItem[];
}

describe("resolveVoiceIntent", () => {
  it("valid AI response parsing", () => {
    const menu = makeMenu();
    const raw: VoiceOrderResult = {
      items: [
        { name: "Chicken Biryani", quantity: 2 },
        { name: "Lime Juice", quantity: 1 },
      ],
      notes: "",
      ambiguous: [],
      transcript: "2 chicken biryani and one lime juice",
    };
    const intent = resolveVoiceIntent(raw, menu);
    expect(intent.items).toHaveLength(2);
    expect(intent.items[0].name).toBe("Chicken Biryani");
    expect(intent.items[0].quantity).toBe(2);
    expect(intent.items[0].price).toBe(250); // authoritative price
    expect(intent.items[0].available).toBe(true);
  });

  it("malformed AI response — empty object", () => {
    const menu = makeMenu();
    const raw = { bogus: true } as unknown as VoiceOrderResult;
    const intent = resolveVoiceIntent(raw, menu);
    expect(intent.items).toHaveLength(0);
  });

  it("unknown menu item — hallucination filtered", () => {
    const menu = makeMenu();
    const raw: VoiceOrderResult = {
      items: [{ name: "Fake Pizza", quantity: 1 }],
      notes: "",
      ambiguous: [],
      transcript: "fake pizza",
    };
    const intent = resolveVoiceIntent(raw, menu);
    expect(intent.items).toHaveLength(0);
  });

  it("unavailable item marked unavailable", () => {
    const menu = makeMenu();
    const raw: VoiceOrderResult = {
      items: [{ name: "Veg Biryani", quantity: 1 }],
      notes: "",
      ambiguous: [],
      transcript: "veg biryani",
    };
    const intent = resolveVoiceIntent(raw, menu);
    expect(intent.items[0].available).toBe(false);
  });

  it("quantity validation — zero/negative clamped to 1, duplicate sums", () => {
    const menu = makeMenu();
    const raw: VoiceOrderResult = {
      items: [
        { name: "Chicken Biryani", quantity: 0 },
        { name: "Chicken Biryani", quantity: 2 },
        { name: "Lime Juice", quantity: -5 },
      ],
      notes: "",
      ambiguous: [],
      transcript: "test",
    };
    const intent = resolveVoiceIntent(raw, menu);
    // Duplicate Chicken Biryani should sum: 1 (clamped from 0) +2 =3, Lime 1
    const chicken = intent.items.find((x) => x.name === "Chicken Biryani");
    expect(chicken?.quantity).toBe(3);
    const lime = intent.items.find((x) => x.name === "Lime Juice");
    expect(lime?.quantity).toBe(1);
  });

  it("duplicate items — case insensitive", () => {
    const menu = makeMenu();
    const raw: VoiceOrderResult = {
      items: [
        { name: "chicken biryani", quantity: 1 },
        { name: "Chicken Biryani", quantity: 1 },
      ],
      notes: "",
      ambiguous: [],
      transcript: "test",
    };
    const intent = resolveVoiceIntent(raw, menu);
    expect(intent.items).toHaveLength(1);
    expect(intent.items[0].quantity).toBe(2);
  });

  it("price resolution from actual menu — no AI price accepted", () => {
    const menu = makeMenu([{ id: "m1", name: "Chicken Biryani", price: 999 }]);
    const raw: VoiceOrderResult = {
      items: [{ name: "Chicken Biryani", quantity: 1 }],
      notes: "",
      ambiguous: [],
      transcript: "one biryani",
    };
    const intent = resolveVoiceIntent(raw, menu);
    expect(intent.items[0].price).toBe(999); // from menu, not AI
  });

  it("ambiguous handling — preserves options", () => {
    const menu = makeMenu();
    const raw: VoiceOrderResult = {
      items: [],
      notes: "",
      ambiguous: [{ query: "biryani", options: ["Chicken Biryani", "Mutton Biryani", "Veg Biryani"] }],
      transcript: "biryani",
    };
    const intent = resolveVoiceIntent(raw, menu);
    expect(intent.ambiguous?.[0].options).toHaveLength(3);
  });
});

describe("resolveNaturalIntent", () => {
  it("valid natural language matches", () => {
    const menu = makeMenu();
    const raw: NaturalLanguageResult = {
      matches: [{ name: "Paneer Butter Masala", quantity: 1 }],
      query: "vegetarian",
    };
    const intent = resolveNaturalIntent(raw, menu);
    expect(intent.matches).toHaveLength(1);
    expect(intent.noMatch).toBe(false);
  });

  it("noMatch when empty", () => {
    const menu = makeMenu();
    const raw: NaturalLanguageResult = { matches: [], noMatch: true, reason: "No matching item", query: "xyz" };
    const intent = resolveNaturalIntent(raw, menu);
    expect(intent.noMatch).toBe(true);
  });

  it("unknown item filtered", () => {
    const menu = makeMenu();
    const raw: NaturalLanguageResult = { matches: [{ name: "Invented Dish" }], query: "invented" };
    const intent = resolveNaturalIntent(raw, menu);
    expect(intent.noMatch).toBe(true);
  });
});

describe("fallbackParseVoiceClient", () => {
  it("English intent — 2 chicken biryani, one paneer", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("2 chicken biryani, one paneer butter masala and 3 lime juices", menu);
    expect(res.items.some((x) => x.name === "Chicken Biryani" && x.quantity === 2)).toBe(true);
    expect(res.items.some((x) => x.name === "Paneer Butter Masala" && x.quantity === 1)).toBe(true);
    expect(res.items.some((x) => x.name === "Lime Juice" && x.quantity === 3)).toBe(true);
  });

  it("Tamil intent — rendu chicken biryani venum", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("rendu chicken biryani venum", menu);
    const chicken = res.items.find((x) => x.name === "Chicken Biryani");
    expect(chicken?.quantity).toBe(2);
  });

  it("Tanglish — enakku veg item venum", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("enakku veg biryani venum", menu);
    // Should match Veg Biryani even though unavailable — but still parsed
    expect(res.items.some((x) => x.name.includes("Biryani"))).toBe(true);
  });

  it("Tamil script — எனக்கு இரண்டு தோசை வேண்டும் (no dosa in menu — expect empty)", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("எனக்கு இரண்டு தோசை வேண்டும்", menu);
    // Dosa not in menu, so no items
    expect(res.items).toHaveLength(0);
  });

  it("empty input — no crash", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("", menu);
    expect(res.items).toHaveLength(0);
  });

  it("oversized input — truncated, no infinite", () => {
    const menu = makeMenu();
    const long = "chicken biryani ".repeat(100);
    const res = fallbackParseVoiceClient(long, menu);
    expect(res.items.length).toBeLessThanOrEqual(10);
  });

  it("duplicate — sums quantities", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("chicken biryani and chicken biryani", menu);
    const biryani = res.items.find((x) => x.name === "Chicken Biryani");
    // Should dedup and sum to 2
    expect(biryani?.quantity).toBe(2);
  });

  it("API failure simulation — fallback still works for English", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("2 lime juice", menu);
    expect(res.items[0].name).toBe("Lime Juice");
    expect(res.items[0].quantity).toBe(2);
  });

  // New Tamil/Tanglish examples from issue
  it("Tamil: ரெண்டு பிரியாணி வேணும் — quantity 2, biryani", () => {
    const menuWithGeneric = makeMenu([{ id: "m1", name: "Biryani", price: 200 }]);
    const res = fallbackParseVoiceClient("ரெண்டு பிரியாணி வேணும்", menuWithGeneric);
    const biryani = res.items.find((x) => x.name === "Biryani");
    expect(biryani?.quantity).toBe(2);
  });

  it("Tamil: இரண்டு சிக்கன் பிரியாணி வேண்டும் — Chicken Biryani x2", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("இரண்டு சிக்கன் பிரியாணி வேண்டும்", menu);
    const chicken = res.items.find((x) => x.name === "Chicken Biryani");
    expect(chicken?.quantity).toBe(2);
  });

  it("Tanglish: oru chicken biryani kudu — Chicken Biryani x1", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("oru chicken biryani kudu", menu);
    const chicken = res.items.find((x) => x.name === "Chicken Biryani");
    expect(chicken?.quantity).toBe(1);
  });

  it("Tanglish: enakku rendu chicken biryani venum — Chicken Biryani x2", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("enakku rendu chicken biryani venum", menu);
    const chicken = res.items.find((x) => x.name === "Chicken Biryani");
    expect(chicken?.quantity).toBe(2);
  });

  it("English: two chicken biryani — quantity 2", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("two chicken biryani", menu);
    const chicken = res.items.find((x) => x.name === "Chicken Biryani");
    expect(chicken?.quantity).toBe(2);
  });

  it("Mixed: 2 idli and one coffee venum — both", () => {
    const menuWithIdli = makeMenu([
      { id: "m1", name: "Idli", price: 30 },
      { id: "m2", name: "Coffee", price: 20 },
    ]);
    const res = fallbackParseVoiceClient("2 idli and one coffee venum", menuWithIdli);
    expect(res.items.find((x) => x.name === "Idli")?.quantity).toBe(2);
    expect(res.items.find((x) => x.name === "Coffee")?.quantity).toBe(1);
  });

  it("Tamil: oru masala dosa kudu — Masala Dosa x1", () => {
    const menuWithDosa = makeMenu([{ id: "m1", name: "Masala Dosa", price: 50 }]);
    const res = fallbackParseVoiceClient("oru masala dosa kudu", menuWithDosa);
    expect(res.items.find((x) => x.name === "Masala Dosa")?.quantity).toBe(1);
  });

  it("Ask SmartDine exact match — Chicken Biryani should not return unrelated", () => {
    const menu = makeMenu([
      { id: "m1", name: "Chicken Biryani", price: 250 },
      { id: "m2", name: "Al Fahm Chicken", price: 300 },
      { id: "m3", name: "Burger & Fries Combo", price: 200 },
      { id: "m4", name: "Butter Chicken", price: 220 },
      { id: "m5", name: "Chettinad Chicken Curry", price: 240 },
    ]);
    const res = fallbackParseVoiceClient("Chicken Biryani", menu);
    // Should return only Chicken Biryani, not all chicken items
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe("Chicken Biryani");
  });

  it("Tamil script full — இரண்டு சிக்கன் பிரியாணி", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("இரண்டு சிக்கன் பிரியாணி வேண்டும்", menu);
    const chicken = res.items.find((x) => x.name === "Chicken Biryani");
    expect(chicken?.quantity).toBe(2);
  });

  it("partial speech, single candidate — 'rendu bir' adds the one biryani", () => {
    const menu = makeMenu([{ id: "m1", name: "Chicken Biryani", price: 250 }]);
    const res = fallbackParseVoiceClient("rendu bir", menu);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe("Chicken Biryani");
    expect(res.items[0].quantity).toBe(2);
  });

  it("partial speech, several candidates — 'chicken bir' asks instead of guessing", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("chicken bir", menu);
    // Never silently adds when unclear
    expect(res.items).toHaveLength(0);
    expect(res.ambiguous.length).toBeGreaterThan(0);
    const opts = res.ambiguous[0].options;
    expect(opts).toContain("Chicken Biryani");
    expect(opts.length).toBeGreaterThan(1);
  });

  it("exact full words never trigger partial recovery", () => {
    const menu = makeMenu([
      { id: "m1", name: "Chicken Biryani", price: 250 },
      { id: "m2", name: "Al Fahm Chicken", price: 300 },
      { id: "m3", name: "Burger & Fries Combo", price: 200 },
      { id: "m4", name: "Butter Chicken", price: 220 },
      { id: "m5", name: "Chettinad Chicken Curry", price: 240 },
    ]);
    const res = fallbackParseVoiceClient("Chicken Biryani", menu);
    expect(res.items).toHaveLength(1);
    expect(res.ambiguous).toHaveLength(0);
  });
});

describe("findMenuMatch — tolerant real-menu matching", () => {
  it("misspelled Tanglish 'chicken biriyani' resolves to Chicken Biryani", () => {
    const menu = makeMenu();
    const hit = findMenuMatch("chicken biriyani", menu);
    expect(hit.kind).toBe("match");
    if (hit.kind === "match") expect(hit.item.name).toBe("Chicken Biryani");
  });

  it("generic 'biryani' with 3 biryanis becomes ambiguous, never a guess", () => {
    const menu = makeMenu();
    const hit = findMenuMatch("biryani", menu);
    expect(hit.kind).toBe("ambiguous");
    if (hit.kind === "ambiguous") {
      expect(hit.options.map((o) => o.name)).toContain("Chicken Biryani");
      expect(hit.options.length).toBeGreaterThan(1);
    }
  });

  it("hallucinated 'Fake Pizza' matches nothing", () => {
    const menu = makeMenu();
    expect(findMenuMatch("Fake Pizza", menu)).toEqual({ kind: "none" });
  });

  it("levenshtein sanity", () => {
    expect(levenshtein("biriyani", "biryani", 2)).toBeLessThanOrEqual(2);
    expect(levenshtein("pizza", "dosa", 2)).toBeGreaterThan(2);
    expect(normalizeMenuName("  Chicken-Biryani! ")).toBe("chicken biryani");
  });
});

describe("resolveVoiceIntent — fuzzy end to end", () => {
  it("'2 chicken biriyani' resolves to real Chicken Biryani at menu price", () => {
    const menu = makeMenu();
    const raw: VoiceOrderResult = {
      items: [{ name: "chicken biriyani", quantity: 2 }],
      notes: "medium spicy no onion",
      ambiguous: [],
      transcript: "2 chicken biriyani medium spicy, no onion",
    };
    const intent = resolveVoiceIntent(raw, menu);
    expect(intent.items).toHaveLength(1);
    expect(intent.items[0].menuItemId).toBe("m1");
    expect(intent.items[0].quantity).toBe(2);
    expect(intent.items[0].price).toBe(250);
    expect(intent.notes).toBe("medium spicy no onion");
  });

  it("generic dish name produces Did-you-mean options, adds nothing", () => {
    const menu = makeMenu();
    const raw: VoiceOrderResult = {
      items: [{ name: "biryani", quantity: 1 }],
      notes: "",
      ambiguous: [],
      transcript: "biryani",
    };
    const intent = resolveVoiceIntent(raw, menu);
    expect(intent.items).toHaveLength(0);
    expect(intent.ambiguous?.length).toBe(1);
    expect(intent.ambiguous?.[0].options.length).toBeGreaterThan(1);
  });
});

describe("resolveNaturalIntent — fuzzy", () => {
  it("truncated 'paneer butter masal' still hits Paneer Butter Masala", () => {
    const menu = makeMenu();
    const raw: NaturalLanguageResult = {
      matches: [{ name: "paneer butter masal", quantity: 1 }],
      query: "paneer butter masal",
    };
    const intent = resolveNaturalIntent(raw, menu);
    expect(intent.noMatch).toBe(false);
    expect(intent.matches[0].menuItemId).toBe("m2");
    expect(intent.matches[0].price).toBe(180);
  });
});

describe("fallbackParseVoiceClient — notes + misspellings", () => {
  it("'2 chicken biryani medium spicy no onion' keeps customization notes", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("2 chicken biryani medium spicy no onion", menu);
    const chicken = res.items.find((x) => x.name === "Chicken Biryani");
    expect(chicken?.quantity).toBe(2);
    expect(res.notes).toContain("onion");
    expect(res.notes).toContain("spicy");
  });

  it("'2 chicken biriyani' (misspelled) still matches the real item", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("2 chicken biriyani", menu);
    const chicken = res.items.find((x) => x.name === "Chicken Biryani");
    expect(chicken?.quantity).toBe(2);
  });

  it("clean order has empty notes", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("2 lime juice", menu);
    expect(res.items[0].name).toBe("Lime Juice");
    expect(res.notes).toBe("");
  });

  it("plate words are quantities, not notes — 'rendu plate biryani'", () => {
    const menu = makeMenu([{ id: "m1", name: "Chicken Biryani", price: 250 }]);
    const res = fallbackParseVoiceClient("rendu plate chicken biryani", menu);
    expect(res.items.find((x) => x.name === "Chicken Biryani")?.quantity).toBe(2);
    expect(res.notes).not.toContain("plate");
  });

  it("tamil plate — 'இரண்டு பிளேட்' keeps quantity, drops unit word", () => {
    const menu = makeMenu([{ id: "m1", name: "Chicken Biryani", price: 250 }]);
    const res = fallbackParseVoiceClient("இரண்டு பிளேட் சிக்கன் பிரியாணி", menu);
    expect(res.items.find((x) => x.name === "Chicken Biryani")?.quantity).toBe(2);
  });

  it("subset title — '2 chicken biriyani' hits 'Hyderabadi Chicken Dum Biriyani' x2", () => {
    const menu = makeMenu([{ id: "h1", name: "Hyderabadi Chicken Dum Biriyani", price: 280 }]);
    const res = fallbackParseVoiceClient("2 chicken biriyani medium spicy no onion", menu);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe("Hyderabadi Chicken Dum Biriyani");
    expect(res.items[0].quantity).toBe(2);
    expect(res.notes).toContain("onion");
  });

  it("subset tie — generic 'chicken' alone adds nothing", () => {
    const menu = makeMenu();
    const res = fallbackParseVoiceClient("chicken", menu);
    expect(res.items).toHaveLength(0);
  });
});

describe("getTranscriptCoverage", () => {
  it("exact transcript scores 1", () => {
    const cov = getTranscriptCoverage("2 chicken biryani", {
      items: [{ menuItemId: "m1", quantity: 2, name: "Chicken Biryani", price: 250, available: true }],
      notes: "",
    });
    expect(cov).toBe(1);
  });

  it("unrelated transcript scores 0", () => {
    const cov = getTranscriptCoverage("hello friend", {
      items: [{ menuItemId: "m1", quantity: 1, name: "Chicken Biryani", price: 250, available: true }],
      notes: "",
    });
    expect(cov).toBe(0);
  });

  it("empty transcript or items scores 0", () => {
    expect(getTranscriptCoverage("", { items: [], notes: "" })).toBe(0);
    expect(getTranscriptCoverage("biryani", { items: [], notes: "" })).toBe(0);
  });
});
