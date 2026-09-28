import { describe, it, expect } from "vitest";
import {
  formatMenuItemAnnouncement,
  formatAddToCartLabel,
  formatSearchAnnouncement,
  formatVoiceMatchAnnouncement,
  formatConfirmationAnnouncement,
  formatAddedAnnouncement,
  formatAmbiguousAnnouncement,
  formatNoMatchAnnouncement,
  formatUnavailableAnnouncement,
  menuItemAvailability,
} from "./announcements";
import type { MenuItem } from "../types/menu";
import type { OrderIntent } from "../types/aiOrder";

function item(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "x1",
    name: "Hyderabadi Chicken Dum Biriyani",
    description: "",
    price: 280,
    categoryId: "c1",
    imageUrl: "",
    preparationTime: 15,
    isAvailable: true,
    trackStock: false,
    stockQuantity: 10,
    lowStockThreshold: 2,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("menuItemAvailability", () => {
  it("available by default", () => {
    expect(menuItemAvailability(item())).toEqual({ available: true, stockRemaining: null });
  });
  it("unavailable flag", () => {
    expect(menuItemAvailability(item({ isAvailable: false })).available).toBe(false);
  });
  it("tracked stock zero means unavailable", () => {
    expect(menuItemAvailability(item({ trackStock: true, stockQuantity: 0 })).available).toBe(false);
  });
  it("tracked stock reports remaining", () => {
    expect(menuItemAvailability(item({ trackStock: true, stockQuantity: 3 }))).toEqual({
      available: true,
      stockRemaining: 3,
    });
  });
});

describe("formatMenuItemAnnouncement", () => {
  it("available item", () => {
    expect(formatMenuItemAnnouncement(item())).toBe(
      "Hyderabadi Chicken Dum Biriyani. 280 rupees. Available."
    );
  });
  it("unavailable item", () => {
    expect(formatMenuItemAnnouncement(item({ isAvailable: false }))).toBe(
      "Hyderabadi Chicken Dum Biriyani. 280 rupees. Currently unavailable."
    );
  });
  it("low stock announces remaining", () => {
    expect(formatMenuItemAnnouncement(item({ trackStock: true, stockQuantity: 3 }))).toBe(
      "Hyderabadi Chicken Dum Biriyani. 280 rupees. Available. 3 remaining."
    );
  });
  it("never includes internal ids", () => {
    expect(formatMenuItemAnnouncement(item({ id: "secret-id" }))).not.toContain("secret-id");
  });

  it("add-to-cart label carries name, price, availability", () => {
    expect(formatAddToCartLabel(item())).toBe(
      "Add Hyderabadi Chicken Dum Biriyani to cart, 280 rupees"
    );
    expect(formatAddToCartLabel(item({ isAvailable: false }))).toContain("currently unavailable");
    expect(formatAddToCartLabel(item({ trackStock: true, stockQuantity: 3 }))).toContain("3 remaining");
  });
});

describe("formatSearchAnnouncement", () => {
  it("count", () => {
    expect(formatSearchAnnouncement(7, "biriyani")).toBe("7 menu items found for biriyani.");
    expect(formatSearchAnnouncement(1, "dosa")).toBe("1 menu item found for dosa.");
  });
  it("none", () => {
    expect(formatSearchAnnouncement(0, "xyz")).toBe("No menu items found for xyz.");
  });
  it("empty query stays silent", () => {
    expect(formatSearchAnnouncement(150, "")).toBe("");
  });
});

describe("voice announcements use real menu facts", () => {
  const menu = [item(), item({ id: "m2", name: "Mutton Biriyani", price: 300 })];
  const intent: OrderIntent = {
    items: [{ menuItemId: "x1", quantity: 2, name: "Hyderabadi Chicken Dum Biriyani", price: 280, available: true }],
    notes: "medium spicy no onion",
    transcript: "2 chicken biriyani",
  };

  it("match announcement names real item, qty, price, total, note", () => {
    const msg = formatVoiceMatchAnnouncement(intent, menu);
    expect(msg).toContain("Hyderabadi Chicken Dum Biriyani");
    expect(msg).toContain("Quantity 2");
    expect(msg).toContain("280 rupees each");
    expect(msg).toContain("560 rupees");
    expect(msg).toContain("medium spicy no onion");
    expect(msg).toContain("add it to your cart");
  });

  it("match ignores AI price, uses menu price", () => {
    const lying: OrderIntent = {
      ...intent,
      items: [{ ...intent.items[0], price: 1 }],
    };
    expect(formatVoiceMatchAnnouncement(lying, menu)).toContain("280 rupees each");
  });

  it("confirmation announcement", () => {
    expect(formatConfirmationAnnouncement(intent, menu)).toBe(
      "Please confirm: add 2 Hyderabadi Chicken Dum Biriyani to your cart for 560 rupees."
    );
  });

  it("added announcement with cart total", () => {
    expect(
      formatAddedAnnouncement([{ name: "Hyderabadi Chicken Dum Biriyani", quantity: 2 }], 560)
    ).toBe("Added 2 Hyderabadi Chicken Dum Biriyani to your cart. Your cart total is 560 rupees.");
  });

  it("ambiguous lists real options", () => {
    const msg = formatAmbiguousAnnouncement("biriyani", [{ name: "Hyderabadi Chicken Dum Biriyani" }, { name: "Mutton Biriyani" }]);
    expect(msg).toContain("1. Hyderabadi Chicken Dum Biriyani");
    expect(msg).toContain("2. Mutton Biriyani");
    expect(msg).toContain("Please choose one");
  });

  it("no-match and unavailable", () => {
    expect(formatNoMatchAnnouncement()).toContain("couldn't find that item");
    expect(formatUnavailableAnnouncement("Mutton Biriyani")).toBe(
      "Mutton Biriyani is currently unavailable. Please choose another item."
    );
  });

  it("empty intent falls back to no-match", () => {
    expect(formatVoiceMatchAnnouncement({ items: [], notes: "" }, menu)).toBe(
      formatNoMatchAnnouncement()
    );
  });
});
