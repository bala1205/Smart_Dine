import { describe, it, expect } from "vitest";
import {
  estimateTableWait,
  formatWaitLabel,
  categoryPrepDefault,
  RESTAURANT_DEFAULT_PREP_MIN,
  type WaitTimeInput,
} from "./tableWaitTimeService";

// Fixed clock so every assertion is deterministic.
const NOW = 1_700_000_000_000;
const MIN = 60_000;

function base(overrides: Partial<WaitTimeInput> = {}): WaitTimeInput {
  return {
    status: "PLACED",
    paymentStatus: "PENDING",
    createdAt: NOW - 2 * MIN,
    updatedAt: NOW - 2 * MIN,
    items: [],
    ...overrides,
  };
}

describe("categoryPrepDefault", () => {
  it("maps real categories, null for unknown", () => {
    expect(categoryPrepDefault("Biriyani")).toBe(25);
    expect(categoryPrepDefault("South Indian Filter Coffee")).toBe(5);
    expect(categoryPrepDefault("Utterly Unknown Category")).toBeNull();
  });
});

describe("estimateTableWait — NEW order", () => {
  it("PLACED uses real prep + dining, rounded", () => {
    const est = estimateTableWait(
      base({
        items: [
          { preparationTime: 20, categoryName: "Biriyani", quantity: 1 },
          { preparationTime: 10, categoryName: "Dosas", quantity: 2 },
        ],
      }),
      NOW
    )!;
    // prep = max(20,10) + 2*1 = 22; dining = 25; total 47 → 45
    expect(est.remainingMinutes).toBe(45);
    expect(est.label).toBe("approx");
    expect(est.confidence).toBe("MEDIUM");
    expect(est.basis).toBe("placed-full");
  });
  it("PLACED falls back transparently when prep unknown", () => {
    const est = estimateTableWait(
      base({ items: [{ preparationTime: 0, categoryName: "Mystery", quantity: 1 }] }),
      NOW
    )!;
    // prep = restaurant default 15; dining 25 → 40
    expect(est.remainingMinutes).toBe(40);
    expect(est.confidence).toBe("LOW");
    expect(est.basis).toContain("fallback");
    expect(RESTAURANT_DEFAULT_PREP_MIN).toBe(15);
  });
  it("PLACED with no items uses documented fallback", () => {
    const est = estimateTableWait(base({ items: [] }), NOW)!;
    expect(est.remainingMinutes).toBe(40);
    expect(est.confidence).toBe("LOW");
  });
});

describe("estimateTableWait — status awareness", () => {
  const items = [{ preparationTime: 20, categoryName: "Biriyani", quantity: 1 }];
  it("PREPARING subtracts elapsed prep", () => {
    const est = estimateTableWait(
      base({ status: "PREPARING", preparingAt: NOW - 10 * MIN, items }),
      NOW
    )!;
    // prep 20 − 10 elapsed = 10 + dining 25 = 35
    expect(est.remainingMinutes).toBe(35);
    expect(est.basis).toBe("preparing-partial");
  });
  it("READY uses serve buffer + dining", () => {
    const est = estimateTableWait(
      base({ status: "READY", readyAt: NOW - 1 * MIN, items }),
      NOW
    )!;
    // 5 buffer + 25 dining = 30
    expect(est.remainingMinutes).toBe(30);
    expect(est.basis).toBe("ready-buffer");
  });
  it("SERVED unpaid shows payment label, not food estimate", () => {
    const est = estimateTableWait(
      base({ status: "SERVED", servedAt: NOW - 1 * MIN, items }),
      NOW
    )!;
    expect(est.label).toBe("payment");
    expect(est.confidence).toBe("LOW");
    expect(est.basis).toBe("payment-pending");
    expect(formatWaitLabel(est, "en")).toBe("Finishing payment");
  });
  it("SERVED long ago keeps payment label without false minutes", () => {
    const est = estimateTableWait(
      base({ status: "SERVED", servedAt: NOW - 60 * MIN, items }),
      NOW
    )!;
    expect(est.label).toBe("payment");
    expect(est.remainingMinutes).toBeNull();
  });
  it("CANCELLED and PAID read as available (null)", () => {
    expect(estimateTableWait(base({ status: "CANCELLED", items }), NOW)).toBeNull();
    expect(
      estimateTableWait(base({ status: "SERVED", paymentStatus: "PAID", items }), NOW)
    ).toBeNull();
  });
});

describe("estimateTableWait — rounding and clamping", () => {
  it("rounds to nearest 5", () => {
    // prep 21 + dining 25 = 46 → 45; prep 23 + 25 = 48 → 50
    const e1 = estimateTableWait(
      base({ items: [{ preparationTime: 21, categoryName: "X", quantity: 1 }] }),
      NOW
    )!;
    const e2 = estimateTableWait(
      base({ items: [{ preparationTime: 23, categoryName: "X", quantity: 1 }] }),
      NOW
    )!;
    expect(e1.remainingMinutes).toBe(45);
    expect(e2.remainingMinutes).toBe(50);
  });
  it("clamps to 5..90", () => {
    const huge = estimateTableWait(
      base({
        items: Array.from({ length: 10 }, () => ({
          preparationTime: 60,
          categoryName: "Biriyani",
          quantity: 5,
        })),
      }),
      NOW
    )!;
    expect(huge.remainingMinutes).toBeLessThanOrEqual(90);
    expect(huge.remainingMinutes).toBeGreaterThanOrEqual(5);
  });
});

describe("formatWaitLabel", () => {
  it("localizes approx + unavailable", () => {
    const approx = { remainingMinutes: 20, label: "approx", confidence: "MEDIUM", basis: "x" } as const;
    expect(formatWaitLabel(approx, "en")).toBe("Approx. 20 min remaining");
    expect(formatWaitLabel(approx, "ta")).toContain("20");
    const un = { remainingMinutes: null, label: "unavailable", confidence: "LOW", basis: "x" } as const;
    expect(formatWaitLabel(un, "en")).toContain("unavailable");
  });
});
