import { describe, it, expect } from "vitest";
import { VALID_ORDER_TRANSITIONS } from "./order";

describe("VALID_ORDER_TRANSITIONS", () => {
  it("allows PLACED -> PREPARING and CANCELLED", () => {
    expect(VALID_ORDER_TRANSITIONS["PLACED"]).toContain("PREPARING");
    expect(VALID_ORDER_TRANSITIONS["PLACED"]).toContain("CANCELLED");
    expect(VALID_ORDER_TRANSITIONS["PLACED"]).not.toContain("READY");
  });
  it("allows PREPARING -> READY and CANCELLED", () => {
    expect(VALID_ORDER_TRANSITIONS["PREPARING"]).toContain("READY");
    expect(VALID_ORDER_TRANSITIONS["PREPARING"]).toContain("CANCELLED");
  });
  it("allows READY -> SERVED only", () => {
    expect(VALID_ORDER_TRANSITIONS["READY"]).toEqual(["SERVED"]);
  });
  it("disallows SERVED and CANCELLED transitions", () => {
    expect(VALID_ORDER_TRANSITIONS["SERVED"]).toEqual([]);
    expect(VALID_ORDER_TRANSITIONS["CANCELLED"]).toEqual([]);
  });
});
