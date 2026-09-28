import { describe, it, expect } from "vitest";
import { answerMenuQuestion } from "./naturalLanguageOrderService";
import type { MenuItem } from "../types/menu";

function m(id: string, name: string, price: number, categoryId: string, isAvailable = true): MenuItem {
  return {
    id, name, description: "", price, categoryId, imageUrl: "",
    preparationTime: 10, isAvailable, trackStock: false,
    stockQuantity: 10, lowStockThreshold: 2, createdAt: 0, updatedAt: 0,
  };
}

const CATS = new Map([
  ["bir", "Biriyani"],
  ["dos", "Dosas"],
  ["jui", "Juices"],
  ["moc", "Mocktails"],
  ["cof", "Coffee"],
  ["des", "Desserts"],
  ["cak", "Cakes"],
]);

const MENU = [
  m("h", "Hyderabadi Chicken Dum Biriyani", 280, "bir"),
  m("mb", "Mutton Biriyani", 340, "bir"),
  m("eb", "Egg Biriyani", 210, "bir"),
  m("md", "Masala Dosa", 110, "dos"),
  m("pd", "Plain Dosa", 80, "dos"),
  m("fj", "Fresh Lime Soda", 70, "jui"),
  m("vm", "Virgin Mojito", 130, "moc"),
  m("sc", "South Indian Filter Coffee", 50, "cof"),
  m("gj", "Gulab Jamun (2 pcs)", 80, "des"),
  m("bf", "Black Forest Pastry", 110, "cak"),
  m("off", "Old Fish Fry", 999, "sea", false),
];

describe("answerMenuQuestion — same menu, same matcher", () => {
  it("price question uses the real menu price", () => {
    const r = answerMenuQuestion("How much is Mutton Biriyani?", MENU, CATS);
    expect(r).not.toBeNull();
    expect(r!.answer).toContain("Mutton Biriyani");
    expect(r!.answer).toContain("340");
    expect(r!.matches).toEqual([]);
  });

  it("availability question answers from isAvailable", () => {
    const yes = answerMenuQuestion("Is Hyderabadi Chicken Dum Biriyani available?", MENU, CATS);
    expect(yes!.answer).toMatch(/yes/i);
    expect(yes!.answer).toContain("280");
    const no = answerMenuQuestion("Is Old Fish Fry available?", MENU, CATS);
    expect(no!.answer).toMatch(/currently unavailable/i);
  });

  it("cheapest dosa computes from the real menu", () => {
    const r = answerMenuQuestion("What is the cheapest dosa?", MENU, CATS);
    expect(r).not.toBeNull();
    expect(r!.matches[0].name).toBe("Plain Dosa");
    expect(r!.answer).toContain("Plain Dosa");
    expect(r!.answer).toContain("80");
  });

  it("biriyani listing returns real items, never invented", () => {
    const r = answerMenuQuestion("What biriyani do you have?", MENU, CATS);
    expect(r).not.toBeNull();
    const names = r!.matches.map((x) => x.name);
    expect(names).toContain("Hyderabadi Chicken Dum Biriyani");
    expect(names).toContain("Mutton Biriyani");
    expect(names).toContain("Egg Biriyani");
    expect(r!.answer).toContain("3");
  });

  it("drinks listing resolves across real drink categories", () => {
    const r = answerMenuQuestion("Which drinks do you have?", MENU, CATS);
    expect(r).not.toBeNull();
    const names = r!.matches.map((x) => x.name);
    expect(names).toContain("Fresh Lime Soda");
    expect(names).toContain("Virgin Mojito");
    expect(names).toContain("South Indian Filter Coffee");
  });

  it("dessert listing resolves real dessert categories", () => {
    const r = answerMenuQuestion("Show me desserts", MENU, CATS);
    expect(r).not.toBeNull();
    const names = r!.matches.map((x) => x.name);
    expect(names).toContain("Gulab Jamun (2 pcs)");
    expect(names).toContain("Black Forest Pastry");
  });

  it("order intents are NOT hijacked by Q&A", () => {
    expect(answerMenuQuestion("2 chicken biriyani medium spicy no onion", MENU, CATS)).toBeNull();
    expect(answerMenuQuestion("Rendu dosa", MENU, CATS)).toBeNull();
    expect(answerMenuQuestion("Enakku veg venum", MENU, CATS)).toBeNull();
    expect(answerMenuQuestion("give me two chicken biriyani", MENU, CATS)).toBeNull();
    expect(answerMenuQuestion("I want chicken", MENU, CATS)).toBeNull();
  });

  it("unanswerable questions fall through to order parsing", () => {
    expect(answerMenuQuestion("xyzq volcano zzz", MENU, CATS)).toBeNull();
  });
});
