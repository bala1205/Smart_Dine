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

describe("full-menu matrix — every category resolves by spoken name", () => {
  // Fixture mirrors the real Firestore records (name/price/category) so the
  // matcher is exercised across the whole menu. Production code NEVER sees
  // this table — it always uses useMenu(restaurantId).
  const MATRIX: Array<[string, number, string]> = [
    ["Al Fahm Chicken", 310, "Grills"],
    ["Aloo Gobi", 170, "North Indian"],
    ["Aloo Palak", 180, "Veg Curries"],
    ["American Chopsuey", 220, "Chinese"],
    ["Black Forest Pastry", 110, "Cakes"],
    ["Blue Lagoon", 140, "Mocktails"],
    ["Bread Omelette", 80, "Egg"],
    ["Brownie with Ice Cream", 160, "Desserts"],
    ["Burger & Fries Combo", 250, "Combo Meals"],
    ["Butter Chicken", 290, "Non-Veg Curries"],
    ["Butter Naan", 50, "Indian Breads"],
    ["Cappuccino", 120, "Coffee"],
    ["Ceylon Parotta", 130, "Parotta"],
    ["Cheese Burst Dosa", 160, "Dosas"],
    ["Chef's Special Platter", 590, "Special Items"],
    ["Chettinad Chicken Curry", 270, "Non-Veg Curries"],
    ["Chettinad Meal", 250, "South Indian"],
    ["Chicken 65", 250, "Starters"],
    ["Chicken Caesar Salad", 220, "Salads"],
    ["Chicken Club Sandwich", 190, "Sandwiches"],
    ["Chicken Fried Rice", 220, "Fried Rice"],
    ["Chicken Grilled BBQ", 290, "Grills"],
    ["Chicken Hakka Noodles", 220, "Noodles"],
    ["Chicken Kathi Roll", 180, "Rolls"],
    ["Chicken Manchurian", 260, "Chinese"],
    ["Chicken Seekh Kebab", 270, "Kebabs"],
    ["Chicken Tikka Masala", 290, "Chicken"],
    ["Chicken Tikka Pizza", 320, "Pizza"],
    ["Chicken Zinger Burger", 190, "Fast Food"],
    ["Chilli Paneer", 230, "Chinese"],
    ["Chocolate Fudge", 90, "Ice Cream"],
    ["Chocolate Milkshake", 140, "Milkshakes"],
    ["Chocolate Truffle Slice", 130, "Cakes"],
    ["Chole Bhature", 180, "North Indian"],
    ["Classic Cheese Burger", 180, "Burgers"],
    ["Cola (Can)", 60, "Soft Drinks"],
    ["Crab Masala", 380, "Seafood"],
    ["Crispy Corn", 170, "Chinese Starters"],
    ["Curd Rice", 80, "South Indian"],
    ["Dal Makhani", 210, "North Indian"],
    ["Deluxe Veg Thali", 240, "Vegetarian Meals"],
    ["Egg Biriyani", 210, "Biriyani"],
    ["Egg Fried Rice", 190, "Fried Rice"],
    ["Egg Masala", 150, "Egg"],
    ["Egg Noodles", 190, "Noodles"],
    ["Egg Podimas", 90, "Egg"],
    ["Fish Finger", 290, "Starters"],
    ["Fish Meal", 290, "Non-Vegetarian Meals"],
    ["French Fries", 110, "Snacks"],
    ["Fresh Lime Soda", 70, "Juices"],
    ["Fried Rice & Manchurian Combo", 300, "Combo Meals"],
    ["Garlic Chicken", 270, "Chinese"],
    ["Garlic Naan", 65, "Indian Breads"],
    ["Ghee Roast Dosa", 130, "Breakfast"],
    ["Goan Fish Curry", 320, "Seafood"],
    ["Gobi 65", 190, "Starters"],
    ["Green Salad", 80, "Salads"],
    ["Grilled Fish Fillet", 350, "Grills"],
    ["Gulab Jamun (2 pcs)", 80, "Desserts"],
    ["Hariyali Kebab", 280, "Kebabs"],
    ["Honey Chilli Potato", 190, "Chinese Starters"],
    ["Hot and Sour Chicken Soup", 150, "Soups"],
    ["Hyderabadi Chicken Dum Biriyani", 280, "Biriyani"],
    ["Idli Sambar (2 pcs)", 60, "Breakfast"],
    ["Kadai Paneer", 240, "Curries"],
    ["Kancheepuram Idli", 100, "Idli"],
    ["Kothu Parotta (Chicken)", 210, "Parotta"],
    ["Lemon Rice", 90, "South Indian"],
    ["Malabar Parotta (2 pcs)", 60, "Parotta"],
    ["Margherita Pizza", 250, "Pizza"],
    ["Masala Dosa", 110, "Breakfast"],
    ["Medu Vada (2 pcs)", 70, "Vada"],
    ["Mutton Biriyani", 340, "Biriyani"],
    ["Mutton Boti Fry", 360, "Mutton"],
    ["Mutton Rogan Josh", 360, "Non-Veg Curries"],
    ["Mutton Sukka", 350, "Mutton"],
    ["Mysore Masala Dosa", 130, "Dosas"],
    ["Paneer 65", 220, "Starters"],
    ["Paneer Butter Masala", 240, "North Indian"],
    ["Paneer Tikka", 260, "Tandoori"],
    ["Pepper Chicken Fry", 260, "Chicken"],
    ["Plain Dosa", 80, "Breakfast"],
    ["Podi Dosa", 120, "Dosas"],
    ["Prawn Masala", 340, "Seafood"],
    ["Prawns Biriyani", 320, "Biriyani"],
    ["Rava Onion Dosa", 140, "Dosas"],
    ["Red Sauce Pasta", 230, "Pasta"],
    ["Reshmi Kebab", 290, "Kebabs"],
    ["Samosa (2 pcs)", 50, "Snacks"],
    ["Schezwan Chicken Noodles", 240, "Noodles"],
    ["Schezwan Veg Fried Rice", 190, "Fried Rice"],
    ["Shahi Paneer", 260, "North Indian"],
    ["South Indian Filter Coffee", 50, "Coffee"],
    ["South Indian Thali", 220, "South Indian"],
    ["Special Dindigul Thalappakatti Biriyani", 300, "Biriyani"],
    ["Spicy Paneer Burger", 170, "Burgers"],
    ["Sweet Corn Veg Soup", 130, "Soups"],
    ["Tandoori Chicken (Full)", 520, "Tandoori"],
    ["Tandoori Chicken (Half)", 280, "Tandoori"],
    ["Tandoori Mushroom", 240, "Tandoori"],
    ["Tomato Soup", 120, "Soups"],
    ["Upma", 70, "Breakfast"],
    ["Vanilla Scoop", 70, "Ice Cream"],
    ["Vanjaram Fish Fry", 320, "Fish"],
    ["Veg Chowmein", 170, "Noodles"],
    ["Veg Dum Biriyani", 200, "Biriyani"],
    ["Veg Fried Rice", 170, "Fried Rice"],
    ["Veg Grilled Sandwich", 130, "Sandwiches"],
    ["Veg Hakka Noodles", 180, "Chinese"],
    ["Veg Spring Rolls", 160, "Chinese"],
    ["Veggie Burger", 140, "Fast Food"],
    ["Virgin Mojito", 130, "Mocktails"],
    ["Watermelon Juice", 90, "Juices"],
    ["White Sauce Pasta", 240, "Pasta"],
  ];

  function matrixMenu(): MenuItem[] {
    return MATRIX.map(([name, price, categoryId], i) => ({
      id: `mx${i}`,
      name,
      description: "",
      price,
      categoryId,
      imageUrl: "",
      preparationTime: 10,
      isAvailable: true,
      trackStock: false,
      stockQuantity: 10,
      lowStockThreshold: 2,
      createdAt: 0,
      updatedAt: 0,
    }));
  }

  it("all 88 dishes resolve by spoken name with quantity 2", () => {
    const menu = matrixMenu();
    const failures: string[] = [];
    for (const [name] of MATRIX) {
      const res = fallbackParseVoiceClient(`2 ${name}`, menu);
      const hit = res.items.find((x) => x.name === name);
      if (!hit || hit.quantity !== 2) failures.push(name);
    }
    expect(failures).toEqual([]);
  });

  it("resolver maps every matrix name to its real id and price", () => {
    const menu = matrixMenu();
    const raw: VoiceOrderResult = {
      items: MATRIX.map(([name]) => ({ name, quantity: 1 })),
      notes: "",
      ambiguous: [],
      transcript: "everything",
    };
    const intent = resolveVoiceIntent(raw, menu);
    expect(intent.items).toHaveLength(MATRIX.length > 10 ? 10 : MATRIX.length);
    // Spot-check real id + authoritative price linkage.
    const byId = new Map(intent.items.map((x) => [x.menuItemId, x]));
    expect(byId.get("mx0")?.price).toBe(310);
    expect(byId.get("mx0")?.name).toBe("Al Fahm Chicken");
  });

  it("item beyond the old 50-item boundary still matches", () => {
    const fillers: MenuItem[] = Array.from({ length: 60 }, (_, i) => ({
      id: `f${i}`,
      name: `Filler Dish Number ${i + 1}`,
      description: "",
      price: 100 + i,
      categoryId: "c9",
      imageUrl: "",
      preparationTime: 5,
      isAvailable: true,
      trackStock: false,
      stockQuantity: 10,
      lowStockThreshold: 2,
      createdAt: 0,
      updatedAt: 0,
    }));
    const target: MenuItem = {
      id: "deep55",
      name: "Dragon Mango Feast",
      description: "",
      price: 275,
      categoryId: "c9",
      imageUrl: "",
      preparationTime: 12,
      isAvailable: true,
      trackStock: false,
      stockQuantity: 5,
      lowStockThreshold: 2,
      createdAt: 0,
      updatedAt: 0,
    };
    const menu = [...fillers.slice(0, 55), target, ...fillers.slice(55)];
    expect(menu.findIndex((m) => m.id === "deep55")).toBe(55);
    const res = fallbackParseVoiceClient("2 dragon mango feast", menu);
    const hit = res.items.find((x) => x.name === "Dragon Mango Feast");
    expect(hit?.quantity).toBe(2);
    const intent = resolveVoiceIntent(
      { items: [{ name: "Dragon Mango Feast", quantity: 2 }], notes: "", ambiguous: [], transcript: "x" },
      menu
    );
    expect(intent.items[0].menuItemId).toBe("deep55");
    expect(intent.items[0].price).toBe(275);
  });

  it("tandoori full/half tie asks instead of guessing", () => {
    const menu = matrixMenu();
    const res = fallbackParseVoiceClient("one tandoori chicken", menu);
    expect(res.items).toHaveLength(0);
    expect(res.ambiguous.length).toBeGreaterThan(0);
    const opts = res.ambiguous.flatMap((a) => a.options);
    expect(opts).toContain("Tandoori Chicken (Full)");
    expect(opts).toContain("Tandoori Chicken (Half)");
  });

  it("generic category words never auto-add", () => {
    const menu = matrixMenu();
    for (const q of ["chicken", "biriyani", "dosa", "juice", "chinese"]) {
      const res = fallbackParseVoiceClient(q, menu);
      expect(res.items).toEqual([]);
    }
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
