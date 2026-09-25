import { describe, it, expect } from "vitest";
import { formatCurrency, formatDateOnly, formatTime, toMs } from "./formatting";

describe("toMs", () => {
  it("handles number", () => {
    expect(toMs(1000)).toBe(1000);
  });
  it("handles null", () => {
    expect(toMs(null)).toBe(null);
  });
  it("handles Timestamp-like", () => {
    expect(toMs({ toMillis: () => 1234 })).toBe(1234);
  });
  it("handles invalid number", () => {
    expect(toMs(NaN)).toBe(null);
    expect(toMs(Infinity)).toBe(null);
  });
});

describe("formatCurrency", () => {
  it("formats INR", () => {
    const s = formatCurrency(1000);
    expect(s).toContain("₹");
    expect(s).toContain("1,000");
  });
  it("handles 0", () => {
    expect(formatCurrency(0)).toContain("0");
  });
});

describe("formatDateOnly / formatTime", () => {
  it("returns -- for null", () => {
    expect(formatDateOnly(null)).toBe("--");
    expect(formatTime(undefined)).toBe("--");
  });
  it("formats timestamp", () => {
    const ms = new Date("2024-01-15T10:30:00").getTime();
    expect(formatDateOnly(ms)).not.toBe("--");
    expect(formatTime(ms)).not.toBe("--");
  });
});
