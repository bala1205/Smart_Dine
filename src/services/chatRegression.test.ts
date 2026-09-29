import { describe, it, expect } from "vitest";
import { answerChat, type ChatMenuContext } from "./chatAssistant";
import type { MenuItem, MenuCategory } from "../types/menu";

function m(id: string, name: string, price: number, categoryId: string, isAvailable = true): MenuItem {
  return {
    id, name, description: `${name} delicious`, price, categoryId, imageUrl: "",
    preparationTime: 10, isAvailable, trackStock: false,
    stockQuantity: 10, lowStockThreshold: 2, createdAt: 0, updatedAt: 0,
  };
}

const CATS: MenuCategory[] = [
  { id: "bir", name: "Biriyani", displayOrder: 1, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "chi", name: "Chicken", displayOrder: 2, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "des", name: "Desserts", displayOrder: 3, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "dri", name: "Drinks", displayOrder: 4, isActive: true, createdAt: 0, updatedAt: 0 },
];

const MENU = [
  m("hb", "Hyderabadi Chicken Dum Biriyani", 280, "bir"),
  m("mb", "Mutton Biriyani", 340, "bir"),
  m("eb", "Egg Biriyani", 210, "bir"),
  m("c65", "Chicken 65", 250, "chi"),
];

function ctx(overrides: Partial<ChatMenuContext> = {}): ChatMenuContext {
  return {
    restaurantName: "Test Restaurant",
    description: "A cozy place for biriyani lovers",
    address: "123 Main St",
    phone: "99999",
    isActive: true,
    categories: CATS,
    cart: [],
    cartTotal: 0,
    language: "tanglish",
    ...overrides,
  };
}

describe("reported bugs — Tanglish", () => {
  it("Biriyani ena iruku → discovery listing, NO order", () => {
    const r = answerChat("Biriyani ena iruku", MENU, ctx());
    expect(r.intent).toBeUndefined();
    expect(r.ambiguous).toBeUndefined();
    expect(r.suggestions && r.suggestions.length).toBeGreaterThan(1);
    expect(r.text).toMatch(/Biriyani|biriyani/i);
    expect(r.text).not.toMatch(/choose one/i);
  });
  it("Resturant pathi slu (typo) → restaurant info", () => {
    const r = answerChat("Resturant pathi slu", MENU, ctx());
    expect(r.text).toContain("Test Restaurant");
    expect(r.text).not.toMatch(/kedaikala/i);
    expect(r.intent).toBeUndefined();
  });
  it("Restaurant pathi sollu → restaurant info", () => {
    const r = answerChat("Restaurant pathi sollu", MENU, ctx());
    expect(r.text).toContain("Test Restaurant");
    expect(r.intent).toBeUndefined();
  });
  it("Biriyani pathi slu → informational, NO order preview", () => {
    const r = answerChat("Biriyani pathi slu", MENU, ctx());
    expect(r.intent).toBeUndefined();
    expect(r.text).toMatch(/Biriyani|biriyani/i);
  });
  it("Egg biriyani epdi → food info, NO x1, NO note epdi", () => {
    const r = answerChat("Egg biriyani epdi", MENU, ctx());
    expect(r.text).toContain("Egg Biriyani");
    expect(r.text).toContain("210");
    expect(r.intent).toBeUndefined();
    expect(r.text).not.toMatch(/×1/);
    expect(r.text).not.toMatch(/Kitchen note/i);
    expect(r.text).not.toMatch(/Confirm order/i);
  });
  it("Egg biriyani evlo → price only", () => {
    const r = answerChat("Egg biriyani evlo", MENU, ctx());
    expect(r.text).toContain("210");
    expect(r.intent).toBeUndefined();
  });
  it("Egg biriyani available ah → availability only", () => {
    const r = answerChat("Egg biriyani available ah", MENU, ctx());
    expect(r.text).toMatch(/available/i);
    expect(r.intent).toBeUndefined();
  });
  it("rendu egg biriyani kudu → ORDER x2", () => {
    const r = answerChat("rendu egg biriyani kudu", MENU, ctx());
    expect(r.intent).toBeDefined();
    expect(r.intent!.items[0].menuItemId).toBe("eb");
    expect(r.intent!.items[0].quantity).toBe(2);
  });
  it("2 egg biriyani no onion → ORDER x2 + genuine note", () => {
    const r = answerChat("2 egg biriyani no onion", MENU, ctx());
    expect(r.intent).toBeDefined();
    expect(r.intent!.items[0].quantity).toBe(2);
    expect(r.intent!.notes).toContain("onion");
    expect(r.intent!.notes).not.toMatch(/epdi|pathi|evlo/);
  });
  it("epdi is NOT stored as kitchen instruction", () => {
    const r = answerChat("Egg biriyani epdi", MENU, ctx());
    expect(r.intent).toBeUndefined();
    const r2 = answerChat("rendu egg biriyani kudu", MENU, ctx());
    expect(r2.intent!.notes || "").not.toContain("epdi");
  });
});

describe("reported bugs — English", () => {
  const ectx = () => ctx({ language: "en" });
  it("Tell me about this restaurant → info", () => {
    expect(answerChat("Tell me about this restaurant", MENU, ectx()).text).toContain("Test Restaurant");
  });
  it("What biriyani do you have? → listing", () => {
    const r = answerChat("What biriyani do you have?", MENU, ectx());
    expect(r.text).toContain("Egg Biriyani");
    expect(r.intent).toBeUndefined();
  });
  it("Tell me about Egg Biriyani → food info", () => {
    const r = answerChat("Tell me about Egg Biriyani", MENU, ectx());
    expect(r.text).toContain("Egg Biriyani");
    expect(r.intent).toBeUndefined();
  });
  it("How much is Egg Biriyani? → price", () => {
    const r = answerChat("How much is Egg Biriyani?", MENU, ectx());
    expect(r.text).toContain("210");
    expect(r.intent).toBeUndefined();
  });
  it("Add two Egg Biriyani → order preview", () => {
    const r = answerChat("Add two Egg Biriyani", MENU, ectx());
    expect(r.intent!.items[0].menuItemId).toBe("eb");
    expect(r.intent!.items[0].quantity).toBe(2);
  });
});

describe("reported bugs — Tamil", () => {
  const tctx = () => ctx({ language: "ta" });
  it("இந்த உணவகம் பற்றி சொல்லுங்கள் → info", () => {
    expect(answerChat("இந்த உணவகம் பற்றி சொல்லுங்கள்", MENU, tctx()).text).toContain("Test Restaurant");
  });
  it("என்ன பிரியாணி இருக்கிறது? → listing", () => {
    const r = answerChat("என்ன பிரியாணி இருக்கிறது?", MENU, tctx());
    expect(r.text).toMatch(/Biriyani|biriyani|பிரியாணி/i);
    expect(r.intent).toBeUndefined();
  });
  it("Egg Biriyani எப்படி? → food info", () => {
    const r = answerChat("Egg Biriyani எப்படி?", MENU, tctx());
    expect(r.text).toContain("Egg Biriyani");
    expect(r.intent).toBeUndefined();
  });
  it("Egg Biriyani எவ்வளவு? → price", () => {
    const r = answerChat("Egg Biriyani எவ்வளவு?", MENU, tctx());
    expect(r.text).toContain("210");
    expect(r.intent).toBeUndefined();
  });
  it("இரண்டு Egg Biriyani வேண்டும் → order", () => {
    const r = answerChat("இரண்டு Egg Biriyani வேண்டும்", MENU, tctx());
    expect(r.intent!.items[0].menuItemId).toBe("eb");
    expect(r.intent!.items[0].quantity).toBe(2);
  });
});

describe("question vs order boundary", () => {
  const ectx = () => ctx({ language: "en" });
  it("questions never order merely because item exists", () => {
    for (const q of [
      "Tell me about Egg Biriyani",
      "What is Egg Biriyani?",
      "Which biriyani is cheapest?",
      "How much is Egg Biriyani?",
      "Is Egg Biriyani available?",
      "Tell me details about Egg Biriyani",
      "Recommend a biriyani",
      "Suggest a biriyani",
      "I want to know about Egg Biriyani",
    ]) {
      const r = answerChat(q, MENU, ectx());
      expect(r.intent, q).toBeUndefined();
    }
  });
  it("Tanglish questions never order", () => {
    for (const q of [
      "Egg biriyani pathi sollu",
      "Egg biriyani epdi",
      "Egg biriyani evlo",
      "Biriyani ena iruku",
      "biriyani kaatu",
    ]) {
      const r = answerChat(q, MENU, ctx());
      expect(r.intent, q).toBeUndefined();
    }
  });
  it("Tamil questions never order", () => {
    for (const q of ["Egg Biriyani எப்படி?", "Egg Biriyani பற்றி சொல்லுங்கள்", "Egg Biriyani எவ்வளவு?"]) {
      const r = answerChat(q, MENU, ctx({ language: "ta" }));
      expect(r.intent, q).toBeUndefined();
    }
  });
  it("clear orders do preview", () => {
    for (const q of [
      "Give me one Egg Biriyani",
      "Add Egg Biriyani",
      "I want 2 Egg Biriyani",
      "Order two Egg Biriyani",
    ]) {
      const r = answerChat(q, MENU, ectx());
      expect(r.intent, q).toBeDefined();
    }
  });
});

describe("follow-ups stay in scope", () => {
  it("cheapest reuses biriyani scope", () => {
    const first = answerChat("What biriyani do you have?", MENU, ctx({ language: "en" }));
    const follow = answerChat(
      "Which is cheapest?",
      MENU,
      ctx({ language: "en", lastIds: first.scopeIds, lastLabel: "biriyani" })
    );
    expect(follow.text).toContain("Egg Biriyani");
  });
  it("add that with single referent previews it", () => {
    const first = answerChat("Tell me about Egg Biriyani", MENU, ctx({ language: "en" }));
    const follow = answerChat(
      "add that",
      MENU,
      ctx({ language: "en", lastIds: first.scopeIds, lastLabel: "Egg Biriyani" })
    );
    expect(follow.intent!.items[0].menuItemId).toBe("eb");
  });
});
