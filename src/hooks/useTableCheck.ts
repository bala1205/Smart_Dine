import { useEffect, useMemo, useState } from "react";
import useTables from "./useTables";
import { useRealtimeOrders } from "./useOrders";
import { useMenu } from "./useMenu";
import { getOrCreateSessionId } from "../utils/session";
import {
  resolveTableCheckStatus,
  subscribeTableReservations,
  type TableCheckStatus,
  type TableReservation,
} from "../services/tableCheckService";
import { estimateTableWait, type WaitEstimate } from "../services/tableWaitTimeService";
import { getOrderItems, subscribeToOrder } from "../services/orderService";
import { getGuestDb } from "../lib/firebase";
import type { Order, OrderItem } from "../types/order";
import type { Table } from "../types/table";

export interface TableCheckViewModel {
  table: Table;
  status: TableCheckStatus;
  order: Order | null;
  reservation: TableReservation | null;
  ownReservation: boolean;
  /** Reservation countdown for the owner's own live reservation. */
  reservationExpiresInMs: number | null;
  wait: WaitEstimate | null;
}

interface TableClaimRef {
  tableId: string;
  orderId: string;
}

/**
 * Guest-safe order resolution.
 *
 * Customers are unauthenticated and Firestore rules do NOT allow listing the
 * orders collection for them (queries are not filters). They CAN read the
 * public table docs (which carry the `currentOrderId` claim) and then read
 * that single order + its items via the existing tracking-token rules — the
 * same secure flow the menu page already uses. Subscribing to those exact
 * order docs keeps the estimate live as the kitchen updates the status,
 * without ever listing private orders or weakening the rules.
 */
function useClaimedTableOrders(
  restaurantId: string | null | undefined,
  tables: Table[],
  enabled: boolean
): {
  ordersByTable: Map<string, Order[]>;
  loading: boolean;
  claimErrors: Set<string>;
} {
  // Key the subscriptions on the claim ids only. Table snapshots also change
  // when unrelated fields update; without this, every snapshot would tear
  // down and re-create each order subscription (visible estimate flicker).
  const claimsKey = useMemo(() => {
    if (!enabled || !restaurantId) return "";
    return tables
      .filter(
        (t) =>
          typeof t.currentOrderId === "string" && t.currentOrderId.length > 0
      )
      .map((t) => `${t.id}:${t.currentOrderId as string}`)
      .sort()
      .join("|");
  }, [enabled, restaurantId, tables]);

  const claims = useMemo<TableClaimRef[]>(() => {
    if (!claimsKey) return [];
    return claimsKey.split("|").map((entry) => {
      const separator = entry.indexOf(":");
      return {
        tableId: entry.slice(0, separator),
        orderId: entry.slice(separator + 1),
      };
    });
  }, [claimsKey]);

  const [ordersByTable, setOrdersByTable] = useState<Map<string, Order[]>>(new Map());
  const [settled, setSettled] = useState("");
  const [failed, setFailed] = useState("");

  useEffect(() => {
    if (!enabled || !restaurantId || claims.length === 0) {
      setOrdersByTable(new Map());
      setSettled("");
      setFailed("");
      return;
    }
    let cancelled = false;
    const map = new Map<string, Order[]>();
    const done = new Set<string>();
    const failedTables = new Set<string>();
    // Guest reads must run unauthenticated even if this browser has a staff
    // session (rules only allow tracking-token reads for request.auth == null).
    const database = getGuestDb();
    setOrdersByTable(new Map());
    setSettled("");
    setFailed("");

    const publish = () => {
      setOrdersByTable(new Map(map));
      setSettled(Array.from(done).join("|"));
      setFailed(Array.from(failedTables).join("|"));
    };

    const unsubs = claims.map(({ tableId, orderId }) => {
      const key = `${tableId}:${orderId}`;
      return subscribeToOrder(
        restaurantId,
        orderId,
        (order) => {
          if (cancelled) return;
          failedTables.delete(tableId);
          if (order) map.set(tableId, [order]);
          else map.delete(tableId);
          done.add(key);
          publish();
        },
        {
          database,
          onError: () => {
            if (cancelled) return;
            // The table points at an order we cannot verify. Never fall back
            // to AVAILABLE/RESERVED for that table — surface OCCUPIED instead.
            failedTables.add(tableId);
            map.delete(tableId);
            done.add(key);
            publish();
          },
        }
      );
    });
    return () => {
      cancelled = true;
      for (const unsub of unsubs) unsub();
    };
  }, [enabled, restaurantId, claims]);

  // Drop claims that no longer exist on the table or no longer match the
  // order id, so a released table never keeps a stale estimate.
  const visible = useMemo(() => {
    if (!enabled) return new Map<string, Order[]>();
    const claimOrder = new Map(claims.map((c) => [c.tableId, c.orderId]));
    const out = new Map<string, Order[]>();
    for (const [tableId, list] of ordersByTable) {
      const orderId = claimOrder.get(tableId);
      if (!orderId) continue;
      const match = list.find((o) => o.id === orderId);
      if (match) out.set(tableId, [match]);
    }
    return out;
  }, [enabled, claims, ordersByTable]);

  const settledSet = useMemo(
    () => new Set(settled ? settled.split("|") : []),
    [settled]
  );
  const loading =
    enabled &&
    claims.some(({ tableId, orderId }) => !settledSet.has(`${tableId}:${orderId}`));

  const claimErrors = useMemo(
    () => new Set(failed ? failed.split("|") : []),
    [failed]
  );

  return { ordersByTable: visible, loading, claimErrors };
}

export type TableCheckDataSource = "staff" | "guest";

export interface UseTableCheckOptions {
  /**
   * "staff" (default) reads the restaurant order feed (owner/kitchen/waiter).
   * "guest" reads only each table's public currentOrderId claim — the secure
   * customer path that works under the deployed Firestore rules.
   */
  source?: TableCheckDataSource;
}

/**
 * Live Table Check view models: tables + orders + reservations + menu
 * (for real preparationTime lookups). Order-derived states mirror
 * useTableOccupancy exactly so owner Tables and Table Check always agree.
 */
export function useTableCheck(
  restaurantId?: string | null,
  options?: UseTableCheckOptions
) {
  const source = options?.source ?? "staff";
  const isGuest = source === "guest";
  const { tables, loading: tablesLoading } = useTables(restaurantId);
  // Guests cannot list orders; keep the staff feed disabled for them.
  const { orders, loading: staffOrdersLoading } = useRealtimeOrders(
    isGuest ? null : restaurantId
  );
  const guest = useClaimedTableOrders(restaurantId, tables, isGuest);
  const { items: menuItems, categories } = useMenu(restaurantId);
  const [reservations, setReservations] = useState<Map<string, TableReservation>>(new Map());
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [itemsByOrder, setItemsByOrder] = useState<Map<string, OrderItem[]>>(new Map());
  const sessionId = useMemo(() => getOrCreateSessionId(), []);
  // Lightweight UI clock so countdown text refreshes and expired holds flip
  // to AVAILABLE locally. Display-only: no Firestore writes on tick; the
  // stored expiry timestamp + realtime subscriptions stay authoritative.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = subscribeTableReservations(restaurantId, setReservations);
    return () => unsub();
  }, [restaurantId, refreshNonce]);

  const staffOrdersByTable = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const list = map.get(o.tableId) || [];
      list.push(o);
      map.set(o.tableId, list);
    }
    return map;
  }, [orders]);

  const ordersByTable = isGuest ? guest.ordersByTable : staffOrdersByTable;
  const ordersLoading = isGuest ? guest.loading : staffOrdersLoading;

  // Fetch items for live orders only (wait-time prep inputs).
  useEffect(() => {
    if (!restaurantId) return;
    const liveIds = new Set<string>();
    for (const [, list] of ordersByTable) {
      const sorted = [...list].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      const live = sorted.find((o) =>
        ["PLACED", "PREPARING", "READY"].includes(o.status) ||
        (o.status === "SERVED" && o.paymentStatus !== "PAID")
      );
      if (live) liveIds.add(live.id);
    }
    let cancelled = false;
    (async () => {
      const next = new Map<string, OrderItem[]>();
      const database = isGuest ? getGuestDb() : undefined;
      await Promise.all(
        [...liveIds].map(async (id) => {
          try {
            next.set(id, await getOrderItems(restaurantId, id, database));
          } catch {
            next.set(id, []);
          }
        })
      );
      if (!cancelled) setItemsByOrder(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, ordersByTable, isGuest]);

  const menuById = useMemo(() => new Map(menuItems.map((mi) => [mi.id, mi])), [menuItems]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const models: TableCheckViewModel[] = useMemo(() => {
    const now = nowTick;
    const sorted = [...tables].sort((a, b) => a.tableNumber - b.tableNumber);
    return sorted.map((table) => {
      const tableOrders = ordersByTable.get(table.id) || [];
      const base = resolveTableCheckStatus({
        table,
        ordersForTable: tableOrders,
        reservation: reservations.get(table.id) ?? null,
        sessionId,
        now,
      });
      // If the table claims an order we could not read — or carries an
      // occupancy session without a usable order id (legacy/partial claim) —
      // never advertise it as available or merely reserved. Order creation
      // fails closed on that same state, so OCCUPIED is the honest status.
      // Show it without fabricating a wait estimate.
      const hasUnreadableClaim =
        guest.claimErrors.has(table.id) ||
        (!table.currentOrderId &&
          typeof table.occupiedBy === "string" &&
          table.occupiedBy.length > 0);
      const claimUnverified = isGuest && hasUnreadableClaim;
      const resolved =
        claimUnverified &&
        (base.status === "AVAILABLE" || base.status === "RESERVED")
          ? {
              status: "OCCUPIED" as const,
              order: null,
              reservation: null,
              ownReservation: false,
            }
          : base;
      let wait: WaitEstimate | null = null;
      if ((resolved.status === "OCCUPIED" || resolved.status === "PAYMENT_PENDING") && resolved.order) {
        const order = resolved.order;
        const orderItems = itemsByOrder.get(order.id) || [];
        wait = estimateTableWait(
          {
            status: order.status,
            paymentStatus: order.paymentStatus,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            preparingAt: order.preparingAt,
            readyAt: order.readyAt,
            servedAt: order.servedAt,
            items: orderItems.map((oi) => {
              const menu = menuById.get(oi.menuItemId);
              return {
                preparationTime: menu?.preparationTime ?? 0,
                categoryName: menu ? catById.get(menu.categoryId) || "" : "",
                quantity: oi.quantity,
                // Real dish name drives the food-reference prep range;
                // falls back to the order snapshot name when menu is loading.
                name: menu?.name ?? oi.itemName,
              };
            }),
          },
          now
        );
      }
      const live = resolved.reservation;
      return {
        table,
        status: resolved.status,
        order: resolved.order,
        reservation: resolved.reservation,
        ownReservation: resolved.ownReservation,
        reservationExpiresInMs: live ? Math.max(0, live.expiresAt - now) : null,
        wait,
      };
    });
  }, [tables, ordersByTable, reservations, sessionId, itemsByOrder, menuById, catById, nowTick, isGuest, guest.claimErrors]);

  const counts = useMemo(() => {
    let available = 0;
    let occupied = 0;
    let paymentPending = 0;
    let reserved = 0;
    for (const m of models) {
      if (!m.table.isActive) continue;
      if (m.status === "AVAILABLE") available++;
      else if (m.status === "OCCUPIED") occupied++;
      else if (m.status === "PAYMENT_PENDING") paymentPending++;
      else if (m.status === "RESERVED") reserved++;
    }
    return { available, occupied, paymentPending, reserved, total: available + occupied + paymentPending + reserved };
  }, [models]);

  return {
    models,
    counts,
    sessionId,
    loading: tablesLoading || ordersLoading,
    refresh: () => setRefreshNonce((n) => n + 1),
  };
}
