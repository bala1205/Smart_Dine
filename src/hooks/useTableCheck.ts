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
import { getOrderItems } from "../services/orderService";
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

/**
 * Live Table Check view models: tables + orders + reservations + menu
 * (for real preparationTime lookups). Order-derived states mirror
 * useTableOccupancy exactly so owner Tables and Table Check always agree.
 */
export function useTableCheck(restaurantId?: string | null) {
  const { tables, loading: tablesLoading } = useTables(restaurantId);
  const { orders, loading: ordersLoading } = useRealtimeOrders(restaurantId);
  const { items: menuItems, categories } = useMenu(restaurantId);
  const [reservations, setReservations] = useState<Map<string, TableReservation>>(new Map());
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [itemsByOrder, setItemsByOrder] = useState<Map<string, OrderItem[]>>(new Map());
  const sessionId = useMemo(() => getOrCreateSessionId(), []);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = subscribeTableReservations(restaurantId, setReservations);
    return () => unsub();
  }, [restaurantId, refreshNonce]);

  const ordersByTable = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const list = map.get(o.tableId) || [];
      list.push(o);
      map.set(o.tableId, list);
    }
    return map;
  }, [orders]);

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
      await Promise.all(
        [...liveIds].map(async (id) => {
          try {
            next.set(id, await getOrderItems(restaurantId, id));
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
  }, [restaurantId, ordersByTable]);

  const menuById = useMemo(() => new Map(menuItems.map((mi) => [mi.id, mi])), [menuItems]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const models: TableCheckViewModel[] = useMemo(() => {
    const now = Date.now();
    const sorted = [...tables].sort((a, b) => a.tableNumber - b.tableNumber);
    return sorted.map((table) => {
      const tableOrders = ordersByTable.get(table.id) || [];
      const resolved = resolveTableCheckStatus({
        table,
        ordersForTable: tableOrders,
        reservation: reservations.get(table.id) ?? null,
        sessionId,
        now,
      });
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
  }, [tables, ordersByTable, reservations, sessionId, itemsByOrder, menuById, catById]);

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
