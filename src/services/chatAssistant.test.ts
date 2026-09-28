import { describe, it, expect } from "vitest";
import { answerChat, isVegSafe, extractPriceCap, type ChatMenuContext } from "./chatAssistant";
import type { MenuItem, MenuCategory } from "../types/menu";

function m(id: string, name: string, price: number, categoryId: string, isAvailable = true): MenuItem {
  return {
    id, name, description: "", price, categoryId, imageUrl: "",
    preparationTime: 10, isAvailable, trackStock: false,
    stockQuantity: 10, lowStockThreshold: 2, createdAt: 0, updatedAt: 0,
  };
}

const CATS: MenuCategory[] = [
  { id: "bir", name: "Biriyani", displayOrder: 1, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "dos", name: "Dosas", displayOrder: 2, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "jui", name: "Juices", displayOrder: 3, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "veg", name: "Veg Curries", displayOrder: 4, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "chi", name: "Chicken", displayOrder: 5, isActive: true, createdAt: 0, updatedAt: 0 },
];

const MENU = [
  m("h", "Hyderabadi Chicken Dum Biriyani", 280, "bir"),
  m("mb", "Mutton Biriyani", 340, "bir"),
  m("eb", "Egg Biriyani", 210, "bir"),
  m("md", "Masala Dosa", 110, "dos"),
  m("pd", "Plain Dosa", 80, "dos"),
  m("fj", "Fresh Lime Soda", 70, "jui"),
  m("ag", "Aloo Gobi", 170, "veg"),
  m("c65", "Chicken 65", 250, "chi"),
  m("off", "Old Fish Fry", 999, "sea", false),
];

function ctx(overrides: Partial<ChatMenuContext> = {}): ChatMenuContext {
  return {
    restaurantName: "meto's",
    description: "test",
    address: "123 Main St",
    phone: "99999",
    isActive: true,
    categories: CATS,
    cart: [],
    cartTotal: 0,
    language: "en",
    ...overrides,
  };
}

describe("extractPriceCap", () => {
  it("under ₹300 / 200 ku keela / tamil", () => {
    expect(extractPriceCap("under ₹300")).toBe(300);
    expect(extractPriceCap("200 ku keela food kaatu")).toBe(200);
    expect(extractPriceCap("₹200 க்குள் உணவு")).toBe(200);
    expect(extractPriceCap("hello")).toBeNull();
  });
});

describe("isVegSafe — never infer", () => {
  it("veg/paneer explicit wins, meat always loses", () => {
    expect(isVegSafe(m("a", "Aloo Gobi", 1, "veg"), "Veg Curries")).toBe(true);
    expect(isVegSafe(m("b", "Paneer 65", 1, "x"), "Starters")).toBe(true);
    expect(isVegSafe(m("c", "Chicken 65", 1, "x"), "Starters")).toBe(false);
    expect(isVegSafe(m("d", "Egg Biriyani", 1, "x"), "Biriyani")).toBe(false);
    expect(isVegSafe(m("e", "Veg Chicken Soup", 1, "x"), "Soups")).toBe(false);
    expect(isVegSafe(m("f", "Mushroom Masala", 1, "x"), "Curries")).toBe(false);
    expect(isVegSafe(m("g", "Chicken Biriyani", 1, "x"), "Non-Vegetarian Meals")).toBe(false);
  });
});

describe("answerChat English", () => {
  it("biriyani listing from real menu", () => {
    const r = answerChat("What biriyani do you have?", MENU, ctx());
    expect(r.text).toContain("Hyderabadi Chicken Dum Biriyani");
    expect(r.suggestions!.length).toBeGreaterThan(1);
    expect(r.scopeIds!.length).toBeGreaterThan(1);
  });
  it("price + availability from real docs", () => {
    expect(answerChat("How much is Mutton Biriyani?", MENU, ctx()).text).toContain("340");
    expect(answerChat("Is Hyderabadi Chicken Dum Biriyani available?", MENU, ctx()).text).toMatch(/yes/i);
    expect(answerChat("Is Old Fish Fry available?", MENU, ctx()).text).toMatch(/unavailable/i);
  });
  it("cheapest dosa computed", () => {
    const r = answerChat("Which dosa is cheapest?", MENU, ctx());
    expect(r.text).toContain("Plain Dosa");
  });
  it("order intent carries real intent, no auto-add", () => {
    const r = answerChat("Give me two chicken biriyani.", MENU, ctx());
    expect(r.intent!.items[0].menuItemId).toBe("h");
    expect(r.intent!.items[0].quantity).toBe(2);
    expect(r.text).toContain("Hyderabadi Chicken Dum Biriyani");
  });
  it("ambiguous never auto-adds", () => {
    const r = answerChat("biriyani", MENU, ctx());
    expect(r.intent).toBeUndefined();
    expect(r.ambiguous![0].options.length).toBeGreaterThan(1);
  });
  it("invalid matches nothing", () => {
    const r = answerChat("xyzq volcano zzz", MENU, ctx());
    expect(r.noMatch).toBe(true);
    expect(r.intent).toBeUndefined();
  });
  it("opening hours never hallucinated", () => {
    const r = answerChat("What time does this restaurant open?", MENU, ctx());
    expect(r.text).not.toMatch(/9 AM|10 AM|11/);
    expect(r.text).toMatch(/aren't available/i);
  });
  it("address/phone from real fields", () => {
    expect(answerChat("Where is the restaurant?", MENU, ctx()).text).toContain("123 Main St");
    expect(answerChat("Phone number?", MENU, ctx()).text).toContain("99999");
  });
  it("cart questions use CartContext", () => {
    expect(answerChat("What's in my cart?", MENU, ctx()).text).toMatch(/empty/i);
    const withCart = ctx({
      cart: [{ menuItemId: "h", name: "Hyderabadi Chicken Dum Biriyani", price: 280, quantity: 2 }],
      cartTotal: 560,
    });
    const r = answerChat("cart la ena iruku?", MENU, withCart);
    expect(r.text).toContain("Hyderabadi Chicken Dum Biriyani");
    expect(r.text).toContain("560");
  });
  it("under-200 recommendation grounded in menu", () => {
    const r = answerChat("I want something under ₹200.", MENU, ctx());
    expect(r.suggestions!.length).toBeGreaterThan(0);
    for (const s of r.suggestions!) expect(s.price).toBeLessThanOrEqual(200);
  });
  it("veg listing contains no meat", () => {
    const r = answerChat("veg items mattum kaatu", MENU, ctx());
    expect(r.suggestions!.length).toBeGreaterThan(0);
    for (const s of r.suggestions!) {
      expect(s.name).not.toMatch(/chicken|mutton|fish|egg/i);
    }
  });
  it("follow-up cheapest reuses listing context", () => {
    const first = answerChat("What biriyani do you have?", MENU, ctx());
    const follow = answerChat("Which is cheapest?", MENU, ctx({ lastIds: first.scopeIds, lastLabel: "biriyani" }));
    expect(follow.text).toContain("Egg Biriyani");
  });
  it("follow-up under-300 filters previous context", () => {
    const first = answerChat("What biriyani do you have?", MENU, ctx());
    const follow = answerChat("Under 300", MENU, ctx({ lastIds: first.scopeIds, lastLabel: "biriyani" }));
    expect(follow.suggestions!.length).toBeGreaterThan(0);
    for (const s of follow.suggestions!) expect(s.price).toBeLessThanOrEqual(300);
  });
});

describe("answerChat Tanglish", () => {
  const tctx = () => ctx({ language: "tanglish" });
  it("enna biriyani iruku", () => {
    const r = answerChat("enna biriyani iruku", MENU, tctx());
    expect(r.text).toContain("Hyderabadi Chicken Dum Biriyani");
  });
  it("mutton biriyani evlo", () => {
    expect(answerChat("mutton biriyani evlo", MENU, tctx()).text).toContain("340");
  });
  it("rendu chicken biriyani kudu orders ×2", () => {
    const r = answerChat("rendu chicken biriyani kudu", MENU, tctx());
    expect(r.intent!.items[0].quantity).toBe(2);
  });
  it("anna rendu parotta stays safe (no such item here)", () => {
    const r = answerChat("anna rendu parotta", MENU, tctx());
    expect(r.intent).toBeUndefined();
  });
  it("hours missing in tanglish", () => {
    expect(answerChat("restaurant open time enna?", MENU, tctx()).text).toMatch(/available illa/);
  });
});

describe("recommendations and Tamil veg", () => {
  it("bare Drinks recommends across real drink categories", () => {
    const r = answerChat("Drinks", MENU, ctx());
    expect(r.suggestions!.length).toBeGreaterThan(0);
    expect(r.suggestions!.map((s) => s.name)).toContain("Fresh Lime Soda");
    for (const s of r.suggestions!) {
      expect(s.menuItemId).toBeTruthy();
      expect(s.price).toBeGreaterThan(0);
    }
  });
  it("Tamil veg request stays meat-free", () => {
    const r = answerChat("வெஜ் ஐட்டம் மட்டும் காட்டு", MENU, ctx({ language: "ta" }));
    expect(r.suggestions!.length).toBeGreaterThan(0);
    for (const s of r.suggestions!) {
      expect(s.name).not.toMatch(/chicken|mutton|fish|egg/i);
    }
  });
  it("sixty-five words match Chicken 65", () => {
    const r = answerChat("oru chicken sixty five", MENU, ctx());
    expect(r.intent!.items[0].menuItemId).toBe("c65");
  });
});

describe("answerChat Tamil", () => {
  const tctx = () => ctx({ language: "ta" });
  it("என்ன பிரியாணி இருக்கு?", () => {
    const r = answerChat("என்ன பிரியாணி இருக்கு?", MENU, tctx());
    expect(r.text).toContain("Hyderabadi Chicken Dum Biriyani");
  });
  it("மட்டன் பிரியாணி எவ்வளவு?", () => {
    expect(answerChat("மட்டன் பிரியாணி எவ்வளவு?", MENU, tctx()).text).toContain("340");
  });
  it("இரண்டு சிக்கன் பிரியாணி வேண்டும் orders ×2", () => {
    const r = answerChat("இரண்டு சிக்கன் பிரியாணி வேண்டும்", MENU, tctx());
    expect(r.intent!.items[0].menuItemId).toBe("h");
    expect(r.intent!.items[0].quantity).toBe(2);
  });
  it("hours missing in tamil", () => {
    expect(answerChat("கடை எப்போ திறக்கும்?", MENU, tctx()).text).toContain("கிடைக்கவில்லை");
  });
});
