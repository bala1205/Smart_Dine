import type { Order } from "../types/order";

/**
 * Client-side order history for Previous Orders.
 *
 * Uses ONLY existing order documents: entries stored are references
 * (orderId + trackingToken) created by this browser's own successful
 * checkouts. Listing reads each order through the existing getOrder path,
 * so no duplicate order storage exists and no other customer's orders can
 * appear — a different browser simply holds different references.
 */

export interface OrderHistoryEntry {
  orderId: string;
  trackingToken: string;
  restaurantId: string;
  tableId: string;
  tableNumber: number;
  createdAt: number;
}

const HISTORY_KEY = "smartdine_order_history";
const MAX_ENTRIES = 20;

function historyStore(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // ignore
  }
  return null;
}

/** Orders with a live lifecycle state (current) vs finished history. */
export function isLiveOrderStatus(
  status: Order["status"],
  paymentStatus?: string
): boolean {
  if (status === "PLACED" || status === "PREPARING" || status === "READY") return true;
  if (status === "SERVED" && paymentStatus !== "PAID") return true;
  return false;
}

export function recordOrder(entry: OrderHistoryEntry): void {
  const store = historyStore();
  if (!store) return;
  try {
    const raw = store.getItem(HISTORY_KEY);
    const list: OrderHistoryEntry[] = raw ? (JSON.parse(raw) as OrderHistoryEntry[]) : [];
    const valid = Array.isArray(list) ? list : [];
    const next = [
      entry,
      ...valid.filter((e) => e && e.orderId !== entry.orderId),
    ].slice(0, MAX_ENTRIES);
    store.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // corrupted or unavailable storage — history is best-effort
  }
}

export function listOrderHistory(): OrderHistoryEntry[] {
  const store = historyStore();
  if (!store) return [];
  try {
    const raw = store.getItem(HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as OrderHistoryEntry[];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (e) =>
        e &&
        typeof e.orderId === "string" &&
        typeof e.trackingToken === "string" &&
        typeof e.restaurantId === "string"
    );
  } catch {
    return [];
  }
}

export function clearOrderHistory(): void {
  try {
    historyStore()?.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}
