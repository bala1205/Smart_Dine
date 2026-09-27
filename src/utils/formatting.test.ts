import { describe, it, expect } from "vitest";
import { formatCurrency, formatDateOnly, formatTime, formatRelativeTime, toMs } from "./formatting";

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

describe("formatRelativeTime", () => {
  const now = new Date("2024-01-15T10:30:00").getTime();
  it("returns -- for null", () => {
    expect(formatRelativeTime(null, now)).toBe("--");
  });
  it("says Just now under a minute", () => {
    expect(formatRelativeTime(now - 10 * 1000, now)).toBe("Just now");
  });
  it("formats minutes", () => {
    expect(formatRelativeTime(now - 2 * 60 * 1000, now)).toBe("2 min ago");
    expect(formatRelativeTime(now - 60 * 1000, now)).toBe("1 min ago");
  });
  it("formats hours and days", () => {
    expect(formatRelativeTime(now - 3 * 60 * 60 * 1000, now)).toBe("3 hours ago");
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60 * 1000, now)).toBe("2 days ago");
  });
});
