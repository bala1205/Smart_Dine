import { useMemo } from "react";
import { useRealtimeOrders } from "./useOrders";
import type { Table } from "../types/table";
import type { Order } from "../types/order";

export type TableOccupancyStatus = "AVAILABLE" | "OCCUPIED" | "PAYMENT_PENDING";

export interface TableOccupancy {
  table: Table;
  status: TableOccupancyStatus;
  currentOrder: Order | null;
  activeOrders: Order[];
}

export function useTableOccupancy(restaurantId: string | null, tables: Table[]) {
  const { orders } = useRealtimeOrders(restaurantId);

  const occupancyMap = useMemo(() => {
    const map = new Map<string, TableOccupancy>();
    for (const table of tables) {
      const tableOrders = orders.filter((o) => o.tableId === table.id);
      // Sort by createdAt desc, most recent first
      const sorted = [...tableOrders].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      const active = sorted.find((o) => ["PLACED", "PREPARING", "READY"].includes(o.status));
      const paymentPending = sorted.find((o) => o.status === "SERVED" && (o as Order & { paymentStatus?: string }).paymentStatus !== "PAID");
      // If has active -> OCCUPIED, else if has recently SERVED with PENDING payment -> PAYMENT_PENDING
      let status: TableOccupancyStatus = "AVAILABLE";
      let currentOrder: Order | null = null;
      if (active) {
        status = "OCCUPIED";
        currentOrder = active;
      } else if (paymentPending) {
        const now = Date.now();
        const servedTime = paymentPending.servedAt || paymentPending.updatedAt || paymentPending.createdAt;
        if (servedTime && now - servedTime < 2 * 60 * 60 * 1000) {
          status = "PAYMENT_PENDING";
          currentOrder = paymentPending;
        } else if (sorted[0]?.id === paymentPending.id) {
          status = "PAYMENT_PENDING";
          currentOrder = paymentPending;
        }
      }
      map.set(table.id, {
        table,
        status,
        currentOrder,
        activeOrders: tableOrders,
      });
    }
    return map;
  }, [tables, orders]);

  return occupancyMap;
}
