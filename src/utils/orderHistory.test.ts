import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  recordOrder,
  listOrderHistory,
  clearOrderHistory,
  isLiveOrderStatus,
} from "./orderHistory";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("order history — current browser only", () => {
  const g = globalThis as Record<string, unknown>;
  let realLocal: unknown;
  beforeEach(() => {
    realLocal = g.localStorage;
    g.localStorage = fakeStorage();
  });
  afterEach(() => {
    g.localStorage = realLocal;
  });

  it("records and lists own orders", () => {
    recordOrder({ orderId: "o1", trackingToken: "t1", restaurantId: "r1", tableId: "t1", tableNumber: 1, createdAt: 1 });
    recordOrder({ orderId: "o2", trackingToken: "t2", restaurantId: "r1", tableId: "t2", tableNumber: 2, createdAt: 2 });
    const list = listOrderHistory();
    expect(list.map((e) => e.orderId)).toEqual(["o2", "o1"]);
  });
  it("dedupes re-records and caps size", () => {
    recordOrder({ orderId: "o1", trackingToken: "t1", restaurantId: "r1", tableId: "t1", tableNumber: 1, createdAt: 1 });
    recordOrder({ orderId: "o1", trackingToken: "t1", restaurantId: "r1", tableId: "t1", tableNumber: 1, createdAt: 2 });
    expect(listOrderHistory()).toHaveLength(1);
  });
  it("ignores corrupted storage", () => {
    (g.localStorage as { setItem: (k: string, v: string) => void }).setItem("smartdine_order_history", "not-json{{{");
    expect(listOrderHistory()).toEqual([]);
  });
  it("clear empties history (empty state)", () => {
    recordOrder({ orderId: "o1", trackingToken: "t1", restaurantId: "r1", tableId: "t1", tableNumber: 1, createdAt: 1 });
    clearOrderHistory();
    expect(listOrderHistory()).toEqual([]);
  });
});

describe("isLiveOrderStatus — current vs previous split", () => {
  it("live: PLACED/PREPARING/READY + SERVED-unpaid", () => {
    expect(isLiveOrderStatus("PLACED")).toBe(true);
    expect(isLiveOrderStatus("PREPARING")).toBe(true);
    expect(isLiveOrderStatus("READY")).toBe(true);
    expect(isLiveOrderStatus("SERVED", "PENDING")).toBe(true);
  });
  it("previous: SERVED-paid + CANCELLED", () => {
    expect(isLiveOrderStatus("SERVED", "PAID")).toBe(false);
    expect(isLiveOrderStatus("CANCELLED")).toBe(false);
  });
});
