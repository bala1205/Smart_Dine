import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, db } from "../lib/firebase";
import type { Order, OrderStatus, OrderItem } from "../types/order";
import { VALID_ORDER_TRANSITIONS } from "../types/order";

function orderCol(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "orders");
}

const TIMESTAMP_FIELDS = [
  "createdAt",
  "updatedAt",
  "preparingAt",
  "readyAt",
  "servedAt",
] as const;

function toMs(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "object") {
    const ts = value as { toMillis?: () => number };
    if (typeof ts.toMillis === "function") {
      const ms = ts.toMillis();
      return Number.isFinite(ms) ? ms : undefined;
    }
  }
  return undefined;
}

function normalizeOrderData(data: Record<string, unknown>): Omit<Order, "id"> {
  const out: Record<string, unknown> = { ...data };
  for (const field of TIMESTAMP_FIELDS) {
    if (field in out) out[field] = toMs(out[field]);
  }
  return out as Omit<Order, "id">;
}

export interface CreateOrderInput {
  restaurantId: string;
  tableId: string;
  qrToken: string;
  items: { menuItemId: string; quantity: number; specialInstruction: string }[];
  specialInstructions: string;
}

export async function createSecureOrder(input: CreateOrderInput): Promise<{
  orderId: string;
  trackingToken: string;
}> {
  const functions = getFunctions(app);
  const createSecureOrderFn = httpsCallable(functions, "createSecureOrder");
  const result = await createSecureOrderFn(input);
  const data = result.data as { orderId: string; trackingToken: string };
  return data;
}

function generateTrackingToken(): string {
  return (
    doc(collection(db, "__tokens")).id + "-" + doc(collection(db, "__tokens")).id
  );
}

/**
 * Creates an order directly via Firestore (client-side). Used as a fallback when
 * the `createSecureOrder` Cloud Function is unavailable (e.g. the Firebase free
 * Spark plan, where Cloud Functions cannot run). It re-validates the restaurant,
 * table/QR token and menu availability, and recomputes the total from the prices
 * stored in Firestore — the client never trusts any price it passes in.
 */
async function createClientOrder(
  input: CreateOrderInput
): Promise<{ orderId: string; trackingToken: string }> {
  const restaurantRef = doc(db, "restaurants", input.restaurantId);

  const restaurantSnap = await getDoc(restaurantRef);
  if (!restaurantSnap.exists()) {
    throw new Error("Restaurant not found.");
  }
  const restaurant = restaurantSnap.data() as {
    isActive?: boolean;
  };
  if (restaurant.isActive !== true) {
    throw new Error("Restaurant is not accepting orders.");
  }

  const tableRef = doc(
    db,
    "restaurants",
    input.restaurantId,
    "tables",
    input.tableId
  );
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) {
    throw new Error("Table not found.");
  }
  const table = tableSnap.data() as {
    tableNumber?: number;
    isActive?: boolean;
    qrToken?: string;
  };
  if (table.isActive !== true || table.qrToken !== input.qrToken) {
    console.error("[order:validation-failed]", {
      reason:
        table.isActive !== true
          ? "table-inactive"
          : "qr-token-mismatch",
      tableIsActive: table.isActive,
      storedQr: table.qrToken ? "present" : "(missing)",
      providedQr: input.qrToken ? "present" : "(missing)",
      tableId: input.tableId,
      restaurantId: input.restaurantId,
    });
    throw new Error("Table is not available.");
  }

  const menuSnap = await getDocs(
    collection(db, "restaurants", input.restaurantId, "menuItems")
  );
  const menuMap = new Map<string, { name?: string; price?: unknown; isAvailable?: boolean }>();
  menuSnap.docs.forEach((d) => menuMap.set(d.id, d.data() as never));

  let totalAmount = 0;
  const orderItems: Array<{
    menuItemId: string;
    itemName: string;
    price: number;
    quantity: number;
    specialInstruction: string;
    restaurantId: string;
    tableId: string;
    qrToken: string;
    createdAt: unknown;
  }> = [];

  const seen = new Set<string>();
  for (const item of input.items) {
    const qty = Math.floor(Number(item.quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error("Quantity must be greater than 0.");
    }
    if (seen.has(item.menuItemId)) {
      throw new Error("Duplicate menu item in order.");
    }
    seen.add(item.menuItemId);

    const menu = menuMap.get(item.menuItemId);
    if (!menu || menu.isAvailable !== true) {
      throw new Error("A menu item is no longer available.");
    }
    const price = Number(menu.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error("A menu item has an invalid price.");
    }
    totalAmount += price * qty;
    orderItems.push({
      menuItemId: item.menuItemId,
      itemName: menu.name || "",
      price,
      quantity: qty,
      specialInstruction: (item.specialInstruction || "").slice(0, 300),
      // Bound each item to the same table session as its parent order so the
      // Firestore items-create rule (QR token + active table) can validate it
      // atomically within the same batch.
      restaurantId: input.restaurantId,
      tableId: input.tableId,
      qrToken: input.qrToken,
      createdAt: serverTimestamp(),
    });
  }

  if (orderItems.length === 0) {
    throw new Error("Order is empty.");
  }

  const trackingToken = generateTrackingToken();
  const orderRef = doc(orderCol(input.restaurantId));
  const now = serverTimestamp();

  const batch = writeBatch(db);
  batch.set(orderRef, {
    restaurantId: input.restaurantId,
    tableId: input.tableId,
    qrToken: input.qrToken,
    tableNumber: table.tableNumber || 0,
    customerSessionId: generateTrackingToken(),
    status: "PLACED",
    totalAmount,
    specialInstructions: (input.specialInstructions || "").slice(0, 500),
    trackingToken,
    createdAt: now,
    updatedAt: now,
  });
  const itemsCol = collection(orderRef, "items");
  orderItems.forEach((oi) => {
    batch.set(doc(itemsCol), { ...oi, createdAt: serverTimestamp() });
  });
  await batch.commit();

  return { orderId: orderRef.id, trackingToken };
}

/**
 * Places an order. Prefers the server-side `createSecureOrder` Cloud Function;
 * if it cannot be reached (not deployed, e.g. the Firebase Spark plan), it falls
 * back to client-side Firestore creation so the full ordering flow keeps working
 * on the free plan without any billing upgrade.
 */
export async function createOrder(
  input: CreateOrderInput
): Promise<{ orderId: string; trackingToken: string }> {
  console.log("[order:create-debug]", {
    restaurantId: input.restaurantId,
    tableId: input.tableId,
    hasQrToken: !!input.qrToken,
    itemCount: input.items.length,
    status: "PLACED",
  });
  try {
    const result = await createSecureOrder(input);
    console.log("[order:create] created via secure function", result);
    return result;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.warn("[order:create] secure function failed, falling back to client", {
      code: err?.code ?? "unknown",
      message: err?.message ?? String(e),
    });
    try {
      const result = await createClientOrder(input);
      return result;
    } catch (ce) {
      const cerr = ce as { code?: string; message?: string };
      console.error("[order:firestore-denied]", {
        code: cerr?.code ?? "unknown",
        message: cerr?.message ?? String(ce),
        path: `restaurants/${input.restaurantId}/orders/{orderId}`,
        restaurantId: input.restaurantId,
        tableId: input.tableId,
        hasQrToken: !!input.qrToken,
      });
      throw ce;
    }
  }
}

export async function getOrder(
  restaurantId: string,
  orderId: string
): Promise<Order | null> {
  const snap = await getDoc(doc(orderCol(restaurantId), orderId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...normalizeOrderData(snap.data()) };
}

export async function getOrderItems(
  restaurantId: string,
  orderId: string
): Promise<OrderItem[]> {
  const snap = await getDocs(
    collection(orderCol(restaurantId), orderId, "items")
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderItem, "id">) }));
}

export async function getRestaurantOrders(
  restaurantId: string,
  status?: OrderStatus | null,
  max = 200
): Promise<Order[]> {
  let q = query(orderCol(restaurantId), orderBy("createdAt", "desc"), limit(max));
  if (status) {
    q = query(
      orderCol(restaurantId),
      where("status", "==", status),
      orderBy("createdAt", "desc"),
      limit(max)
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...normalizeOrderData(d.data()) }));
}

export async function updateOrderStatus(
  restaurantId: string,
  orderId: string,
  currentStatus: OrderStatus,
  newStatus: OrderStatus
): Promise<void> {
  if (!VALID_ORDER_TRANSITIONS[currentStatus]?.includes(newStatus)) {
    throw new Error(`Cannot transition order from ${currentStatus} to ${newStatus}`);
  }
  const statusTimestampField =
    newStatus === "PREPARING"
      ? "preparingAt"
      : newStatus === "READY"
      ? "readyAt"
      : newStatus === "SERVED"
      ? "servedAt"
      : null;
  const update: Record<string, unknown> = {
    status: newStatus,
    updatedAt: serverTimestamp(),
  };
  if (statusTimestampField) {
    update[statusTimestampField] = serverTimestamp();
  }
  await updateDoc(doc(orderCol(restaurantId), orderId), update);
}

export function subscribeToOrders(
  restaurantId: string,
  callback: (orders: Order[]) => void,
  status?: OrderStatus | null
): Unsubscribe {
  let q = query(orderCol(restaurantId), orderBy("createdAt", "desc"), limit(200));
  if (status) {
    q = query(
      orderCol(restaurantId),
      where("status", "==", status),
      orderBy("createdAt", "desc"),
      limit(200)
    );
  }
  return onSnapshot(q, (snap) => {
    const orders = snap.docs.map((d) => ({
      id: d.id,
      ...normalizeOrderData(d.data()),
    }));
    callback(orders);
  });
}

export async function getTodayOrders(
  restaurantId: string
): Promise<Order[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const q = query(
    orderCol(restaurantId),
    where("createdAt", ">=", Timestamp.fromDate(start)),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...normalizeOrderData(d.data()) }));
}

export function subscribeToOrder(  restaurantId: string,
  orderId: string,
  callback: (order: Order | null) => void
): Unsubscribe {
  return onSnapshot(doc(orderCol(restaurantId), orderId), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback({ id: snap.id, ...(snap.data() as Omit<Order, "id">) });
  });
}
