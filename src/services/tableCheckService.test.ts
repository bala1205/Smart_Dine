import { describe, it, expect } from "vitest";
import {
  canOwnerReleaseTable,
  decideReservation,
  formatReservationExpiry,
  isReservationLive,
  reservationDocPath,
  resolveTableCheckStatus,
  TABLE_RESERVATION_TTL_MS,
  tableCheckUrl,
  type TableLike,
  type TableReservation,
} from "./tableCheckService";
import { tableCheckUrl as qrTableCheckUrl, tableMenuUrl } from "../utils/qr";
import type { Order } from "../types/order";
import type { Table } from "../types/table";

const NOW = 1_700_000_000_000;

function table(overrides: Partial<TableLike> = {}): TableLike {
  return { id: "t1", tableNumber: 1, isActive: true, ...overrides };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    restaurantId: "r1",
    tableId: "t1",
    tableNumber: 1,
    customerSessionId: "sess",
    status: "PLACED",
    totalAmount: 100,
    specialInstructions: "",
    trackingToken: "tok",
    paymentStatus: "PENDING",
    createdAt: NOW - 60_000,
    updatedAt: NOW - 60_000,
    ...overrides,
  };
}

function res(sessionId: string, expiresAt: number): TableReservation {
  return { sessionId, expiresAt, createdAt: NOW - 60_000 };
}

describe("Table Check URL generation", () => {
  it("restaurant-level QR has no tableId/token", () => {
    const url = tableCheckUrl("resto123");
    expect(url).toContain("/table-check/resto123");
    expect(url).not.toContain("token");
    expect(url).not.toContain("/menu/");
    expect(qrTableCheckUrl("resto123")).toContain("/table-check/resto123");
  });
  it("existing physical QR format unchanged", () => {
    const t = { id: "t9", qrToken: "secret-token-xyz" } as Table;
    const url = tableMenuUrl("resto123", t);
    expect(url).toContain("/menu/resto123/t9?token=secret-token-xyz");
  });
  it("reservation ttl is a 5-minute named constant", () => {
    expect(TABLE_RESERVATION_TTL_MS).toBe(5 * 60 * 1000);
  });
  it("reservation doc path is restaurant-scoped (no cross-restaurant writes)", () => {
    expect(reservationDocPath("restoA", "t1")).toBe(
      "restaurants/restoA/tableReservations/t1"
    );
    expect(reservationDocPath("restoA", "t1")).not.toContain("restoB");
  });
});

describe("formatReservationExpiry — dynamic countdown, UI-only", () => {
  it("5 minutes remaining", () => {
    expect(formatReservationExpiry(NOW + 5 * 60_000, NOW)).toBe("Expires in ~5 min");
  });
  it("3 minutes remaining", () => {
    expect(formatReservationExpiry(NOW + 3 * 60_000, NOW)).toBe("Expires in ~3 min");
  });
  it("under a minute", () => {
    expect(formatReservationExpiry(NOW + 30_000, NOW)).toBe("Expires in <1 min");
  });
  it("expired reads null so callers derive AVAILABLE", () => {
    expect(formatReservationExpiry(NOW - 1, NOW)).toBeNull();
    expect(formatReservationExpiry(NOW, NOW)).toBeNull();
    const r = resolveTableCheckStatus({
      table: table(), ordersForTable: [],
      reservation: res("gone", NOW - 1), sessionId: "s", now: NOW,
    });
    expect(r.status).toBe("AVAILABLE");
  });
});

describe("isReservationLive", () => {
  it("active / expired / missing / empty-session", () => {
    expect(isReservationLive(res("a", NOW + 60_000), NOW)).toBe(true);
    expect(isReservationLive(res("a", NOW - 1), NOW)).toBe(false);
    expect(isReservationLive(null, NOW)).toBe(false);
    expect(isReservationLive(res("", NOW + 60_000), NOW)).toBe(false);
  });
});

describe("decideReservation", () => {
  it("available table may be claimed", () => {
    expect(
      decideReservation({ table: table(), ordersForTable: [], existingReservation: null, sessionId: "s1", now: NOW })
    ).toEqual({ ok: true });
  });
  it("inactive / access-paused tables refuse", () => {
    expect(
      decideReservation({ table: table({ isActive: false }), ordersForTable: [], existingReservation: null, sessionId: "s1", now: NOW }).ok
    ).toBe(false);
    const r = decideReservation({ table: table({ isAccessAvailable: false }), ordersForTable: [], existingReservation: null, sessionId: "s1", now: NOW });
    expect(r).toEqual({ ok: false, reason: "TABLE_UNAVAILABLE" });
  });
  it("live PLACED/PREPARING/READY orders block (TABLE_OCCUPIED)", () => {
    for (const status of ["PLACED", "PREPARING", "READY"] as const) {
      const r = decideReservation({ table: table(), ordersForTable: [order({ status })], existingReservation: null, sessionId: "s1", now: NOW });
      expect(r).toEqual({ ok: false, reason: "TABLE_OCCUPIED" });
    }
  });
  it("SERVED unpaid blocks; SERVED paid and CANCELLED do not", () => {
    expect(
      decideReservation({ table: table(), ordersForTable: [order({ status: "SERVED", paymentStatus: "PENDING" })], existingReservation: null, sessionId: "s1", now: NOW })
    ).toEqual({ ok: false, reason: "TABLE_OCCUPIED" });
    expect(
      decideReservation({ table: table(), ordersForTable: [order({ status: "SERVED", paymentStatus: "PAID" })], existingReservation: null, sessionId: "s1", now: NOW }).ok
    ).toBe(true);
    expect(
      decideReservation({ table: table(), ordersForTable: [order({ status: "CANCELLED" })], existingReservation: null, sessionId: "s1", now: NOW }).ok
    ).toBe(true);
  });
  it("foreign live reservation blocks; expired and own do not", () => {
    const foreign = decideReservation({
      table: table(), ordersForTable: [],
      existingReservation: res("other", NOW + 60_000), sessionId: "mine", now: NOW,
    });
    expect(foreign).toEqual({ ok: false, reason: "TABLE_RESERVED" });
    expect(
      decideReservation({ table: table(), ordersForTable: [], existingReservation: res("other", NOW - 1), sessionId: "mine", now: NOW }).ok
    ).toBe(true);
    expect(
      decideReservation({ table: table(), ordersForTable: [], existingReservation: res("mine", NOW + 60_000), sessionId: "mine", now: NOW }).ok
    ).toBe(true);
  });
  it("atomic race: two simultaneous tappers → one wins", () => {
    const first = decideReservation({ table: table(), ordersForTable: [], existingReservation: null, sessionId: "A", now: NOW });
    expect(first.ok).toBe(true);
    // First win applied (as the transaction would write it)…
    const applied = res("A", NOW + TABLE_RESERVATION_TTL_MS);
    // …second tapper serializes after it and loses.
    const second = decideReservation({ table: table(), ordersForTable: [], existingReservation: applied, sessionId: "B", now: NOW });
    expect(second).toEqual({ ok: false, reason: "TABLE_RESERVED" });
  });
  it("stale reservation needs no cleanup to be reusable", () => {
    const r = decideReservation({ table: table(), ordersForTable: [], existingReservation: res("gone", NOW - 1000), sessionId: "new", now: NOW });
    expect(r.ok).toBe(true);
  });
});

describe("resolveTableCheckStatus", () => {
  it("available / occupied / payment-pending / reserved", () => {
    expect(
      resolveTableCheckStatus({ table: table(), ordersForTable: [], reservation: null, now: NOW }).status
    ).toBe("AVAILABLE");
    expect(
      resolveTableCheckStatus({ table: table(), ordersForTable: [order({ status: "PREPARING" })], reservation: null, now: NOW }).status
    ).toBe("OCCUPIED");
    expect(
      resolveTableCheckStatus({ table: table(), ordersForTable: [order({ status: "SERVED", paymentStatus: "PENDING" })], reservation: null, now: NOW }).status
    ).toBe("PAYMENT_PENDING");
    const r = resolveTableCheckStatus({ table: table(), ordersForTable: [], reservation: res("other", NOW + 60_000), sessionId: "mine", now: NOW });
    expect(r.status).toBe("RESERVED");
    expect(r.ownReservation).toBe(false);
  });
  it("own reservation is flagged; live order beats any reservation", () => {
    const own = resolveTableCheckStatus({ table: table(), ordersForTable: [], reservation: res("mine", NOW + 60_000), sessionId: "mine", now: NOW });
    expect(own.status).toBe("RESERVED");
    expect(own.ownReservation).toBe(true);
    const beaten = resolveTableCheckStatus({
      table: table(), ordersForTable: [order({ status: "PLACED" })],
      reservation: res("mine", NOW + 60_000), sessionId: "mine", now: NOW,
    });
    expect(beaten.status).toBe("OCCUPIED");
  });
  it("owner release gate: only RESERVED may be released", () => {
    expect(canOwnerReleaseTable("RESERVED")).toBe(true);
    expect(canOwnerReleaseTable("AVAILABLE")).toBe(false);
    expect(canOwnerReleaseTable("OCCUPIED")).toBe(false);
    expect(canOwnerReleaseTable("PAYMENT_PENDING")).toBe(false);
  });
  it("owner release case 4: expired reservation already reads AVAILABLE", () => {
    const r = resolveTableCheckStatus({
      table: table(), ordersForTable: [],
      reservation: res("gone", NOW - 1000), sessionId: "owner-view", now: NOW,
    });
    expect(r.status).toBe("AVAILABLE");
    // …so no owner action is required for stale holds.
    expect(canOwnerReleaseTable(r.status)).toBe(false);
  });
  it("owner release cases 2+3: live order / payment-pending never releasable", () => {
    const occ = resolveTableCheckStatus({
      table: table(), ordersForTable: [order({ status: "PREPARING" })],
      reservation: null, now: NOW,
    });
    expect(occ.status).toBe("OCCUPIED");
    expect(canOwnerReleaseTable(occ.status)).toBe(false);
    const pay = resolveTableCheckStatus({
      table: table(), ordersForTable: [order({ status: "SERVED", paymentStatus: "PENDING" })],
      reservation: null, now: NOW,
    });
    expect(pay.status).toBe("PAYMENT_PENDING");
    expect(canOwnerReleaseTable(pay.status)).toBe(false);
  });
  it("owner release case 1: live reservation without order is releasable", () => {
    const r = resolveTableCheckStatus({
      table: table(), ordersForTable: [],
      reservation: res("guest", NOW + 60_000), sessionId: "owner-view", now: NOW,
    });
    expect(r.status).toBe("RESERVED");
    expect(canOwnerReleaseTable(r.status)).toBe(true);
  });
  it("firestore rules: only owners may delete reservations", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const rulesPath = fileURLToPath(new URL("../../firestore.rules", import.meta.url));
    const rules = readFileSync(rulesPath, "utf8");
    const block = rules.slice(rules.indexOf("match /tableReservations/"));
    expect(block).toContain("allow delete: if isOwnerOf(restaurantId);");
    // No guest/customer delete path exists in the reservation rules.
    expect(block).not.toMatch(/allow delete: if true/);
    expect(block).not.toMatch(/allow delete:[^;]*validGuest/);
  });
  it("reservation → order transition: own order holds the table, no self-conflict", () => {
    // Customer reserves, enters menu, places order through the EXISTING flow
    // (which claims occupiedBy/currentOrderId — reservations are never
    // consulted by order creation, so no TABLE_OCCUPIED fires against self).
    const afterOrder = resolveTableCheckStatus({
      table: table(), ordersForTable: [order({ status: "PLACED", customerSessionId: "mine" })],
      reservation: res("mine", NOW + 60_000), sessionId: "mine", now: NOW,
    });
    expect(afterOrder.status).toBe("OCCUPIED");
    expect(afterOrder.order?.id).toBe("o1");
  });
});
