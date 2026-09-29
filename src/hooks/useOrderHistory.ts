import { useEffect, useState } from "react";
import { getOrder, getOrderItems } from "../services/orderService";
import { listOrderHistory } from "../utils/orderHistory";
import type { Order, OrderItem } from "../types/order";

export interface HistoryOrder {
  order: Order;
  items: OrderItem[];
}

/**
 * Previous-orders data for the current browser only: reads the locally
 * stored order references (created by this browser's checkouts) through the
 * existing order services. Entries whose tracking token no longer matches
 * are dropped, so tampered references reveal nothing.
 */
export function useOrderHistory(restaurantId?: string | null) {
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const entries = listOrderHistory().filter((e) => e.restaurantId === restaurantId);
      const out: HistoryOrder[] = [];
      for (const entry of entries) {
        try {
          const order = await getOrder(restaurantId, entry.orderId);
          if (!order || order.trackingToken !== entry.trackingToken) continue;
          let items: OrderItem[] = [];
          try {
            items = await getOrderItems(restaurantId, entry.orderId);
          } catch {
            items = [];
          }
          out.push({ order, items });
        } catch {
          // order removed or unreadable — skip silently
        }
      }
      out.sort((a, b) => (b.order.createdAt ?? 0) - (a.order.createdAt ?? 0));
      if (!cancelled) {
        setOrders(out);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  return { orders, loading };
}
