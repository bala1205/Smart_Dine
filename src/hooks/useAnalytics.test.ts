import { describe, it, expect } from "vitest";
import {
  getDateRangeBounds,
  computeAnalytics,
  computeMostOrderedDishes,
  computePeakHours,
} from "./useAnalytics";
import type { Order } from "../types/order";
import type { OrderItem } from "../types/order";

function makeOrder(over: Partial<Order>): Order {
  return {
    id: "o1",
    restaurantId: "r1",
    tableId: "t1",
    tableNumber: 1,
    customerSessionId: "s1",
    status: "SERVED",
    totalAmount: 100,
    specialInstructions: "",
    trackingToken: "tok",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  } as Order;
}

describe("getDateRangeBounds", () => {
  it("today within same day", () => {
    const { start, end } = getDateRangeBounds("today");
    expect(end - start).toBeGreaterThan(0);
    expect(end - start).toBeLessThan(24 * 60 * 60 * 1000 + 1000);
  });
  it("custom range", () => {
    const s = new Date("2024-01-01");
    const e = new Date("2024-01-31");
    const { start, end } = getDateRangeBounds("custom", s, e);
    expect(start).toBe(new Date("2024-01-01").setHours(0, 0, 0, 0));
    expect(end).toBe(new Date("2024-01-31").setHours(23, 59, 59, 999));
  });
});

describe("computeAnalytics", () => {
  it("sums served only for sales", () => {
    const orders: Order[] = [
      makeOrder({ status: "SERVED", totalAmount: 200, grandTotal: 230, gstAmount: 20, serviceChargeAmount: 10 }),
      makeOrder({ status: "PLACED", totalAmount: 100 }),
      makeOrder({ status: "CANCELLED", totalAmount: 50 }),
    ];
    const a = computeAnalytics(orders);
    expect(a.totalOrders).toBe(3);
    expect(a.completedOrders).toBe(1);
    expect(a.totalSales).toBe(230);
    expect(a.pendingOrders).toBe(1);
    expect(a.cancelledOrders).toBe(1);
    expect(a.avgOrderValue).toBe(230);
  });
  it("handles empty", () => {
    const a = computeAnalytics([]);
    expect(a.totalSales).toBe(0);
    expect(a.avgOrderValue).toBe(0);
  });
});

describe("computeMostOrderedDishes", () => {
  it("aggregates quantity and revenue sorted", () => {
    const items: OrderItem[] = [
      { id: "i1", menuItemId: "m1", itemName: "Biriyani", price: 100, quantity: 2, specialInstruction: "", createdAt: 0 } as OrderItem,
      { id: "i2", menuItemId: "m1", itemName: "Biriyani", price: 100, quantity: 1, specialInstruction: "", createdAt: 0 } as OrderItem,
      { id: "i3", menuItemId: "m2", itemName: "Curry", price: 50, quantity: 5, specialInstruction: "", createdAt: 0 } as OrderItem,
    ];
    const stats = computeMostOrderedDishes(items);
    expect(stats[0].menuItemId).toBe("m2"); // 5 vs 3
    expect(stats[0].quantity).toBe(5);
    expect(stats[1].quantity).toBe(3);
  });
});

describe("computePeakHours", () => {
  it("counts hours", () => {
    const orders: Order[] = [
      makeOrder({ createdAt: new Date("2024-01-01T08:15:00").getTime() }),
      makeOrder({ createdAt: new Date("2024-01-01T08:45:00").getTime() }),
      makeOrder({ createdAt: new Date("2024-01-01T14:00:00").getTime() }),
    ];
    const peak = computePeakHours(orders);
    expect(peak[8].count).toBe(2);
    expect(peak[14].count).toBe(1);
  });
});
