const SESSION_KEY = "smartdine_customer_session";

// In-memory fallback for non-browser runtimes (tests). Never used when a
// real Web Storage implementation exists.
const memoryFallback = new Map<string, string>();

function sessionStore(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    // ignore — fall through to localStorage / memory
  }
  return null;
}

function localStore(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // ignore
  }
  return null;
}

function read(store: Pick<Storage, "getItem" | "setItem"> | null): string | null {
  if (!store) return null;
  try {
    return store.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function write(store: Pick<Storage, "getItem" | "setItem"> | null, value: string): void {
  if (!store) return;
  try {
    store.setItem(SESSION_KEY, value);
  } catch {
    // storage may be unavailable/blocked — memory fallback covers it
  }
}

/**
 * Stable per-browser customer identity used for table reservations and
 * occupancy claims. Single system — no IP/phone/fingerprint signals.
 *
 * Persistence: sessionStorage is the primary store (same-tab flow as
 * before); the SAME id is mirrored to localStorage so the reservation
 * context survives page reloads AND closing/reopening the browser. A
 * different browser/device holds a different id and can never see this
 * customer's private reservation or orders.
 */
export function getOrCreateSessionId(): string {
  const session = sessionStore();
  const local = localStore();

  let id = read(session);
  if (!id) {
    // Returning browser (new tab / restart): adopt the persisted id.
    id = read(local);
    if (id) write(session, id);
  }
  if (!id) {
    id = memoryFallback.get(SESSION_KEY) ?? null;
  }
  if (!id) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    if (!session && !local) {
      memoryFallback.set(SESSION_KEY, id);
    }
  }
  if (id) {
    write(session, id);
    write(local, id);
  }
  return id;
}

export function getRestaurantContext(): {
  restaurantId: string | null;
  tableId: string | null;
  qrToken: string | null;
} {
  const rid = sessionStorage.getItem("smartdine_restaurant_id");
  const tid = sessionStorage.getItem("smartdine_table_id");
  const token = sessionStorage.getItem("smartdine_qr_token");
  return { restaurantId: rid, tableId: tid, qrToken: token };
}

export function setRestaurantContext(restaurantId: string, tableId: string, qrToken?: string) {
  sessionStorage.setItem("smartdine_restaurant_id", restaurantId);
  sessionStorage.setItem("smartdine_table_id", tableId);
  if (qrToken) {
    sessionStorage.setItem("smartdine_qr_token", qrToken);
  }
}

export function clearRestaurantContext() {
  sessionStorage.removeItem("smartdine_restaurant_id");
  sessionStorage.removeItem("smartdine_table_id");
  sessionStorage.removeItem("smartdine_qr_token");
}
