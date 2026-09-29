import { describe, it, expect } from "vitest";
import { lookupPrepRange, normalizeFoodName, FOOD_PREP_COUNT } from "./foodPrepTimes";

describe("food prep reference", () => {
  it("contains the full supplied reference", () => {
    expect(FOOD_PREP_COUNT).toBe(136);
  });
  it("representative foods map to min/max ranges", () => {
    expect(lookupPrepRange("Samosa")).toEqual({ min: 5, max: 8 });
    expect(lookupPrepRange("Plain Dosa")).toEqual({ min: 10, max: 15 });
    expect(lookupPrepRange("Egg Biriyani")).toEqual({ min: 18, max: 25 });
    expect(lookupPrepRange("Hyderabadi Chicken Dum Biriyani")).toEqual({ min: 20, max: 30 });
    expect(lookupPrepRange("Tandoori Chicken (Full)")).toEqual({ min: 30, max: 45 });
    expect(lookupPrepRange("Tandoori Chicken (Half)")).toEqual({ min: 20, max: 30 });
    expect(lookupPrepRange("Butter Naan")).toEqual({ min: 5, max: 8 });
    expect(lookupPrepRange("Cappuccino")).toEqual({ min: 10, max: 15 });
    expect(lookupPrepRange("Watermelon Juice")).toEqual({ min: 5, max: 8 });
  });
  it("alias normalization never duplicates menu items", () => {
    // Ghee/can/pcs suffixes stripped; half/full kept distinct.
    expect(lookupPrepRange("Podi Idli (Ghee)")).toEqual({ min: 8, max: 12 });
    expect(lookupPrepRange("Hot and Sour Chicken Soup")).toEqual({ min: 8, max: 12 });
    expect(lookupPrepRange("Hot & Sour Chicken Soup")).toEqual({ min: 8, max: 12 });
    expect(lookupPrepRange("Lemon-Lime Soda (Can)")).toEqual({ min: 5, max: 8 });
    expect(normalizeFoodName("Samosa (2 pcs)")).toBe("samosa");
  });
  it("unknown foods fall back (null)", () => {
    expect(lookupPrepRange("Volcano Pizza Xyzq")).toBeNull();
    expect(lookupPrepRange("")).toBeNull();
  });
});
