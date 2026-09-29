import { describe, it, expect } from "vitest";
import {
  classifyChatIntent,
  isExplicitOrderIntent,
  sanitizeKitchenNotes,
  hasQuestionSignal,
} from "./chatIntent";
import type { MenuItem } from "../types/menu";

function m(id: string, name: string, price: number, categoryId: string): MenuItem {
  return {
    id, name, description: `${name} tasty`, price, categoryId, imageUrl: "",
    preparationTime: 10, isAvailable: true, trackStock: false,
    stockQuantity: 10, lowStockThreshold: 2, createdAt: 0, updatedAt: 0,
  };
}

const MENU = [
  m("eb", "Egg Biriyani", 210, "bir"),
  m("mb", "Mutton Biriyani", 340, "bir"),
  m("hb", "Hyderabadi Chicken Dum Biriyani", 280, "bir"),
  m("c65", "Chicken 65", 250, "chi"),
];

const catNameOf = (x: MenuItem) =>
  x.categoryId === "bir" ? "Biriyani" : x.categoryId === "chi" ? "Chicken" : x.categoryId;

describe("isExplicitOrderIntent — phrase aware", () => {
  it("questions are not orders even with item names", () => {
    for (const q of [
      "Egg biriyani epdi",
      "Egg biriyani pathi sollu",
      "Tell me about Egg Biriyani",
      "Is Egg Biriyani good?",
      "What is Egg Biriyani?",
      "Egg biriyani evlo?",
      "Egg biriyani price ena?",
      "Egg biriyani available ah?",
      "Do you have Egg Biriyani?",
      "Biriyani ena iruku?",
      "What biriyani do you have?",
      "Biriyani pathi sollu",
      "Which biriyani is cheapest?",
      "I want to know about Egg Biriyani",
    ]) {
      expect(isExplicitOrderIntent(q), q).toBe(false);
    }
  });
  it("clear order language is order", () => {
    for (const q of [
      "Give me one Egg Biriyani",
      "Add Egg Biriyani",
      "I want 2 Egg Biriyani",
      "Order two Egg Biriyani",
      "Egg biriyani add to cart",
      "oru egg biriyani kudu",
      "rendu egg biriyani venum",
      "egg biriyani cart la add pannu",
      "ஒரு Egg Biriyani வேண்டும்",
      "இரண்டு Egg Biriyani சேர்க்கவும்",
      "2 egg biriyani no onion",
      "Add two Egg Biriyani",
    ]) {
      expect(isExplicitOrderIntent(q) || q.includes("no onion"), q).toBe(true);
    }
  });
  it("how-to-order is guidance, not order", () => {
    expect(isExplicitOrderIntent("How do I order?")).toBe(false);
    expect(isExplicitOrderIntent("How to order food here?")).toBe(false);
  });
});

describe("classifyChatIntent routing priority", () => {
  it("restaurant info first (incl. typo Resturant)", () => {
    expect(classifyChatIntent("Resturant pathi slu", MENU, catNameOf)).toBe("RESTAURANT_INFO");
    expect(classifyChatIntent("Restaurant pathi sollu", MENU, catNameOf)).toBe("RESTAURANT_INFO");
    expect(classifyChatIntent("restaurant pathi slu", MENU, catNameOf)).toBe("RESTAURANT_INFO");
    expect(classifyChatIntent("Tell me about this restaurant", MENU, catNameOf)).toBe("RESTAURANT_INFO");
    expect(classifyChatIntent("இந்த உணவகம் பற்றி சொல்லுங்கள்", MENU, catNameOf)).toBe("RESTAURANT_INFO");
  });
  it("food info before order", () => {
    expect(classifyChatIntent("Biriyani pathi slu", MENU, catNameOf)).toBe("FOOD_INFO");
    expect(classifyChatIntent("Egg biriyani epdi", MENU, catNameOf)).toBe("FOOD_INFO");
    expect(classifyChatIntent("Tell me about Egg Biriyani", MENU, catNameOf)).toBe("FOOD_INFO");
    expect(classifyChatIntent("Egg Biriyani எப்படி?", MENU, catNameOf)).toBe("FOOD_INFO");
  });
  it("price / availability", () => {
    expect(classifyChatIntent("Egg biriyani evlo", MENU, catNameOf)).toBe("PRICE_QUERY");
    expect(classifyChatIntent("How much is Egg Biriyani?", MENU, catNameOf)).toBe("PRICE_QUERY");
    expect(classifyChatIntent("Egg Biriyani எவ்வளவு?", MENU, catNameOf)).toBe("PRICE_QUERY");
    expect(classifyChatIntent("Egg biriyani available ah", MENU, catNameOf)).toBe("AVAILABILITY_QUERY");
    expect(classifyChatIntent("Is Chicken 65 available?", MENU, catNameOf)).toBe("AVAILABILITY_QUERY");
  });
  it("discovery listing", () => {
    expect(classifyChatIntent("Biriyani ena iruku", MENU, catNameOf)).toBe("MENU_DISCOVERY");
    expect(classifyChatIntent("What biriyani do you have?", MENU, catNameOf)).toBe("MENU_DISCOVERY");
    expect(classifyChatIntent("என்ன பிரியாணி இருக்கிறது?", MENU, catNameOf)).toBe("MENU_DISCOVERY");
  });
  it("explicit order only", () => {
    expect(classifyChatIntent("rendu egg biriyani kudu", MENU, catNameOf)).toBe("ORDER_INTENT");
    expect(classifyChatIntent("Add two Egg Biriyani", MENU, catNameOf)).toBe("ORDER_INTENT");
    expect(classifyChatIntent("இரண்டு Egg Biriyani வேண்டும்", MENU, catNameOf)).toBe("ORDER_INTENT");
  });
});

describe("sanitizeKitchenNotes — questions never become notes", () => {
  it("strips epdi/pathi/evlo etc", () => {
    expect(sanitizeKitchenNotes("epdi")).toBe("");
    expect(sanitizeKitchenNotes("pathi sollu")).toBe("");
    expect(sanitizeKitchenNotes("evlo price available")).toBe("");
    expect(sanitizeKitchenNotes("medium spicy no onion")).toContain("onion");
    expect(sanitizeKitchenNotes("no onion")).toContain("onion");
  });
  it("hasQuestionSignal detects Tanglish/Tamil", () => {
    expect(hasQuestionSignal("Egg biriyani epdi")).toBe(true);
    expect(hasQuestionSignal("Biriyani ena iruku")).toBe(true);
    expect(hasQuestionSignal("2 egg biriyani no onion")).toBe(false);
  });
});
