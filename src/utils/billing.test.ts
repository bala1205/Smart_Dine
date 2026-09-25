import { describe, it, expect } from "vitest";
import { calculateBill, splitEqually, splitByItems } from "./billing";

describe("calculateBill", () => {
  it("computes GST and service charge correctly", () => {
    const bill = calculateBill(1000, 5, 10);
    expect(bill.subtotal).toBe(1000);
    expect(bill.gstPercent).toBe(5);
    expect(bill.gstAmount).toBe(50);
    expect(bill.serviceChargePercent).toBe(10);
    expect(bill.serviceChargeAmount).toBe(100);
    expect(bill.grandTotal).toBe(1150);
  });

  it("handles zero subtotal", () => {
    const bill = calculateBill(0, 5, 5);
    expect(bill.grandTotal).toBe(0);
    expect(bill.gstAmount).toBe(0);
  });

  it("clamps GST and SC to 0-100", () => {
    const bill = calculateBill(100, 200, -10);
    expect(bill.gstPercent).toBe(100);
    expect(bill.serviceChargePercent).toBe(0);
    expect(bill.gstAmount).toBe(100);
  });

  it("rounds to 2 decimals", () => {
    const bill = calculateBill(333, 5, 5);
    // 333 * 0.05 = 16.65, *0.05 =16.65, total 366.3
    expect(bill.gstAmount).toBe(16.65);
    expect(bill.serviceChargeAmount).toBe(16.65);
    expect(bill.grandTotal).toBe(366.3);
  });

  it("handles string inputs via Number coercion", () => {
    const bill = calculateBill(Number("500"), Number("10"), Number("5"));
    expect(bill.grandTotal).toBe(575);
  });
});

describe("splitEqually", () => {
  it("splits correctly for 2 people", () => {
    const bill = calculateBill(1000, 5, 10);
    const split = splitEqually(bill, 2);
    expect(split.shareTotal).toBe(575);
    expect(split.shareSubtotal).toBe(500);
  });

  it("handles 1 person", () => {
    const bill = calculateBill(200, 0, 0);
    const split = splitEqually(bill, 1);
    expect(split.shareTotal).toBe(200);
  });

  it("clamps people to at least 1", () => {
    const bill = calculateBill(100, 0, 0);
    const split = splitEqually(bill, 0);
    expect(split.shareTotal).toBe(100);
  });
});

describe("splitByItems", () => {
  it("splits by selected indices", () => {
    const items = [
      { price: 100, quantity: 1 },
      { price: 200, quantity: 2 },
    ];
    const result = splitByItems(items, [true, false], 5, 0);
    // A: 100, B:400, GST 5% => A 105, B 420, total 525
    expect(result.customerA.grandTotal).toBe(105);
    expect(result.customerB.grandTotal).toBe(420);
    expect(result.totalCheck.grandTotal).toBe(525);
  });

  it("supports Set<string> ids", () => {
    const items = [
      { price: 50, quantity: 2 },
      { price: 30, quantity: 1 },
    ];
    const result = splitByItems(items, new Set(["0"]), 0, 0);
    expect(result.customerA.subtotal).toBe(100);
    expect(result.customerB.subtotal).toBe(30);
  });

  it("handles empty selection", () => {
    const items = [{ price: 100, quantity: 1 }];
    const result = splitByItems(items, new Set<string>(), 0, 0);
    expect(result.customerA.subtotal).toBe(0);
    expect(result.customerB.subtotal).toBe(100);
  });
});
