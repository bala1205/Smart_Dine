import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Order } from "../types/order";
import type { Table } from "../types/table";

/**
 * SmartDine Table Check (entrance/reception) booking.
 *
 * Coexists with the existing physical per-table QR flow:
 * - FLOW A (new):  /table-check/{restaurantId} → welcome → availability →
 *   atomic reservation → /menu/{restaurantId}/{tableId}?token={qrToken}
 * - FLOW B (existing, untouched): per-table QR → menu directly.
 *
 * Reservations live in `restaurants/{rid}/tableReservations/{tableId}` (doc
 * ID = tableId, at most one live reservation per table). This avoids a
 * parallel occupancy system: order-derived occupancy (useTableOccupancy
 * semantics) always wins; reservations only gate pre-menu selection.
 *
 * Atomicity: `reserveTableAtomic` runs a Firestore transaction on the
 * reservation doc (+ table + claim order reads), so two near-simultaneous
 * tappers serialize — exactly one wins, the other gets TABLE_RESERVED.
 */

export const TABLE_RESERVATION_TTL_MS = 5 * 60 * 1000;
export const TABLE_RESERVATION_SKEW_MS = 2 * 60 * 1000;
/** Mirrors useTableOccupancy: SERVED-unpaid reads PAYMENT_PENDING in window. */
export const PAYMENT_PENDING_WINDOW_MS = 2 * 60 * 60 * 1000;

export type TableCheckStatus =
  | "AVAILABLE"
  | "OCCUPIED"
  | "PAYMENT_PENDING"
  | "RESERVED";

export interface TableReservation {
  sessionId: string;
  expiresAt: number;
  createdAt: number;
}

export type ReservationDecision =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "TABLE_INACTIVE"
        | "TABLE_UNAVAILABLE"
        | "TABLE_OCCUPIED"
        | "TABLE_RESERVED";
    };

export interface TableLike {
  id: string;
  tableNumber: number;
  isActive: boolean;
  isAccessAvailable?: boolean;
  currentOrderId?: string;
}

export function tableCheckUrl(restaurantId: string): string {
  const envBase =
    (import.meta.env.VITE_PUBLIC_URL as string | undefined) || undefined;
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";
  return `${(envBase || origin).replace(/\/+$/, "")}/table-check/${restaurantId}`;
}

/** Firestore path (doc ID = tableId). Pure — lets tests assert isolation. */
export function reservationDocPath(restaurantId: string, tableId: string): string {
  return `restaurants/${restaurantId}/tableReservations/${tableId}`;
}

/**
 * Customer/owner-facing expiry text from the authoritative reservation
 * timestamp. UI-only: returns null once expired (callers then derive
 * AVAILABLE through the existing realtime status system — no writes).
 */
export function formatReservationExpiry(
  expiresAt: number,
  now: number = Date.now()
): string | null {
  const ms = expiresAt - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const mins = ms / 60000;
  if (mins < 1) return "Expires in <1 min";
  return `Expires in ~${Math.max(1, Math.round(mins))} min`;
}

export function isReservationLive(
  res: TableReservation | null | undefined,
  now: number = Date.now()
): boolean {
  if (!res) return false;
  return (
    typeof res.sessionId === "string" &&
    res.sessionId.length > 0 &&
    typeof res.expiresAt === "number" &&
    res.expiresAt > now
  );
}

function liveOrderForTable(
  ordersForTable: Order[],
  now: number
): { kind: "active" | "payment" | null; order: Order | null } {
  const sorted = [...ordersForTable].sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
  );
  const active = sorted.find((o) =>
    ["PLACED", "PREPARING", "READY"].includes(o.status)
  );
  if (active) return { kind: "active", order: active };
  const paymentPending = sorted.find(
    (o) => o.status === "SERVED" && o.paymentStatus !== "PAID"
  );
  if (paymentPending) {
    const servedTime =
      paymentPending.servedAt || paymentPending.updatedAt || paymentPending.createdAt;
    if (servedTime && now - servedTime < PAYMENT_PENDING_WINDOW_MS) {
      return { kind: "payment", order: paymentPending };
    }
    if (sorted[0]?.id === paymentPending.id) {
      return { kind: "payment", order: paymentPending };
    }
  }
  return { kind: null, order: null };
}

/**
 * Pure reservation gate. Same-session re-reserve refreshes (ok). Expired
 * reservations read as absent — no manual cleanup needed. Never trusts
 * client booleans: order liveness derives from real order state.
 */
export function decideReservation(input: {
  table: TableLike;
  ordersForTable: Order[];
  existingReservation: TableReservation | null;
  sessionId: string;
  now?: number;
}): ReservationDecision {
  const now = input.now ?? Date.now();
  const { table } = input;
  if (!table.isActive) return { ok: false, reason: "TABLE_INACTIVE" };
  if (table.isAccessAvailable === false)
    return { ok: false, reason: "TABLE_UNAVAILABLE" };
  const live = liveOrderForTable(input.ordersForTable, now);
  if (live.kind) return { ok: false, reason: "TABLE_OCCUPIED" };
  const existing = input.existingReservation;
  if (
    isReservationLive(existing, now) &&
    existing!.sessionId !== input.sessionId
  ) {
    return { ok: false, reason: "TABLE_RESERVED" };
  }
  return { ok: true };
}

export interface TableCheckStatusResult {
  status: TableCheckStatus;
  order: Order | null;
  reservation: TableReservation | null;
  /** Live reservation belongs to this browser session. */
  ownReservation: boolean;
}

/**
 * Single source of truth shared by customer Table Check + owner Table Check
 * dashboard. Order-derived states (OCCUPIED/PAYMENT_PENDING) match
 * useTableOccupancy exactly; RESERVED only applies when no live order exists.
 */
export function resolveTableCheckStatus(input: {
  table: TableLike;
  ordersForTable: Order[];
  reservation: TableReservation | null;
  sessionId?: string | null;
  now?: number;
}): TableCheckStatusResult {
  const now = input.now ?? Date.now();
  if (!input.table.isActive) {
    return { status: "AVAILABLE", order: null, reservation: null, ownReservation: false };
  }
  const live = liveOrderForTable(input.ordersForTable, now);
  if (live.kind === "active" && live.order) {
    return { status: "OCCUPIED", order: live.order, reservation: null, ownReservation: false };
  }
  if (live.kind === "payment" && live.order) {
    return {
      status: "PAYMENT_PENDING",
      order: live.order,
      reservation: null,
      ownReservation: false,
    };
  }
  const res = input.reservation;
  if (isReservationLive(res, now)) {
    const own = !!input.sessionId && res!.sessionId === input.sessionId;
    return {
      status: "RESERVED",
      order: null,
      reservation: res,
      ownReservation: own,
    };
  }
  return { status: "AVAILABLE", order: null, reservation: null, ownReservation: false };
}

function reservationsCol(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "tableReservations");
}

export async function getTableReservation(
  restaurantId: string,
  tableId: string
): Promise<TableReservation | null> {
  const snap = await getDoc(doc(reservationsCol(restaurantId), tableId));
  if (!snap.exists()) return null;
  return snap.data() as TableReservation;
}

export function subscribeTableReservations(
  restaurantId: string,
  callback: (reservations: Map<string, TableReservation>) => void
): Unsubscribe {
  return onSnapshot(
    reservationsCol(restaurantId),
    (snap) => {
      const map = new Map<string, TableReservation>();
      for (const d of snap.docs) map.set(d.id, d.data() as TableReservation);
      callback(map);
    },
    () => callback(new Map())
  );
}

export class TableReservationError extends Error {
  code:
    | "TABLE_INACTIVE"
    | "TABLE_UNAVAILABLE"
    | "TABLE_OCCUPIED"
    | "TABLE_RESERVED";
  constructor(
    code: TableReservationError["code"],
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

/**
 * Atomically reserves an AVAILABLE table for this browser session.
 * Serializes on the reservation doc: concurrent tappers → one wins.
 * Re-validates table state + live orders + foreign reservations INSIDE the
 * transaction. Does NOT touch occupiedBy/currentOrderId (no fake orders, no
 * competing ownership model) and never regenerates QR tokens.
 */
export async function reserveTableAtomic(
  restaurantId: string,
  table: Table,
  sessionId: string
): Promise<TableReservation> {
  const tableRef = doc(db, "restaurants", restaurantId, "tables", table.id);
  const resRef = doc(reservationsCol(restaurantId), table.id);
  const now = Date.now();

  return runTransaction(db, async (tx) => {
    const tableSnap = await tx.get(tableRef);
    if (!tableSnap.exists()) {
      throw new TableReservationError("TABLE_INACTIVE", "Table not found.");
    }
    const t = { id: tableSnap.id, ...(tableSnap.data() as Omit<Table, "id">) };
    if (!t.isActive) {
      throw new TableReservationError("TABLE_INACTIVE", "Table is not active.");
    }
    if (t.isAccessAvailable === false) {
      throw new TableReservationError(
        "TABLE_UNAVAILABLE",
        "Table is currently unavailable."
      );
    }
    // Live-order check via the table's claim pointer (same semantics as the
    // order flow: PLACED/PREPARING/READY or SERVED-unpaid blocks).
    if (typeof t.currentOrderId === "string" && t.currentOrderId.length > 0) {
      try {
        const orderSnap = await tx.get(
          doc(db, "restaurants", restaurantId, "orders", t.currentOrderId)
        );
        if (orderSnap.exists()) {
          const o = orderSnap.data() as { status?: unknown; paymentStatus?: unknown };
          const live =
            o.status === "PLACED" ||
            o.status === "PREPARING" ||
            o.status === "READY" ||
            (o.status === "SERVED" && o.paymentStatus !== "PAID");
          if (live) {
            throw new TableReservationError(
              "TABLE_OCCUPIED",
              "Sorry, this table was just taken. Please choose another available table."
            );
          }
        }
      } catch (e) {
        if (e instanceof TableReservationError) throw e;
        throw new TableReservationError(
          "TABLE_OCCUPIED",
          "Sorry, this table was just taken. Please choose another available table."
        );
      }
    }
    const resSnap = await tx.get(resRef);
    const existing = resSnap.exists()
      ? (resSnap.data() as TableReservation)
      : null;
    if (
      isReservationLive(existing, now) &&
      existing!.sessionId !== sessionId
    ) {
      throw new TableReservationError(
        "TABLE_RESERVED",
        "Sorry, this table was just taken. Please choose another available table."
      );
    }
    const reservation: TableReservation = {
      sessionId,
      expiresAt: now + TABLE_RESERVATION_TTL_MS,
      createdAt: now,
    };
    tx.set(resRef, reservation);
    return reservation;
  });
}

// ---------------------------------------------------------------------------
// Owner manual release: RESERVED → AVAILABLE.
// ---------------------------------------------------------------------------

export type OwnerReleaseResult = "released" | "already-available";

export class OwnerReleaseError extends Error {
  code: "NOT_OWNER" | "ACTIVE_ORDER";
  constructor(code: OwnerReleaseError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * UI gate: the Mark Available action is offered ONLY for RESERVED tables.
 * OCCUPIED / PAYMENT_PENDING must follow order → served/payment/cancelled →
 * release; AVAILABLE needs nothing.
 */
export function canOwnerReleaseTable(status: TableCheckStatus): boolean {
  return status === "RESERVED";
}

function isLiveOrderData(o: { status?: unknown; paymentStatus?: unknown }): boolean {
  return (
    o.status === "PLACED" ||
    o.status === "PREPARING" ||
    o.status === "READY" ||
    (o.status === "SERVED" && o.paymentStatus !== "PAID")
  );
}

/**
 * Owner-only cancellation of a table reservation.
 *
 * - Verifies owner authorization (callers pass the authenticated profile
 *   check; Firestore rules independently require isOwnerOf for deletes, so
 *   customers can never delete — not even their own — via this path).
 * - Re-reads table + claim order + reservation; refuses when a LIVE order
 *   exists (active-order and payment-pending protection: never touches
 *   occupiedBy/currentOrderId/order/payment state).
 * - Expired/missing reservations already read AVAILABLE through the derived
 *   status system; an expired doc is cleaned up and reported as
 *   already-available.
 */
export async function ownerReleaseReservation(
  restaurantId: string,
  tableId: string,
  isOwner: boolean
): Promise<OwnerReleaseResult> {
  if (!isOwner) {
    throw new OwnerReleaseError("NOT_OWNER", "Only the restaurant owner can release tables.");
  }
  const tableRef = doc(db, "restaurants", restaurantId, "tables", tableId);
  const resRef = doc(reservationsCol(restaurantId), tableId);
  const now = Date.now();

  const tableSnap = await getDoc(tableRef);
  if (tableSnap.exists()) {
    const t = tableSnap.data() as { currentOrderId?: unknown };
    if (typeof t.currentOrderId === "string" && t.currentOrderId.length > 0) {
      try {
        const orderSnap = await getDoc(
          doc(db, "restaurants", restaurantId, "orders", t.currentOrderId)
        );
        if (orderSnap.exists() && isLiveOrderData(orderSnap.data())) {
          throw new OwnerReleaseError(
            "ACTIVE_ORDER",
            "This table has an active order and cannot be force-released."
          );
        }
      } catch (e) {
        if (e instanceof OwnerReleaseError) throw e;
        // Unverifiable claim: fail closed, same as the order flow.
        throw new OwnerReleaseError(
          "ACTIVE_ORDER",
          "This table has an active order and cannot be force-released."
        );
      }
    }
  }

  const resSnap = await getDoc(resRef);
  if (!resSnap.exists()) return "already-available";
  const existing = resSnap.data() as TableReservation;
  if (!isReservationLive(existing, now)) {
    try {
      await deleteDoc(resRef);
    } catch {
      // already-availalbe either way; cleanup is best-effort
    }
    return "already-available";
  }
  // Owner delete is authorized by Firestore rules (isOwnerOf); customers
  // have no delete permission on tableReservations.
  await deleteDoc(resRef);
  return "released";
}
