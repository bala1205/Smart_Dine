import { useCallback, useEffect, useState } from "react";
import {
  getRestaurantOrders,
  getOrderItems,
  subscribeToOrders,
  updateOrderStatus,
} from "../services/orderService";
import type { Order, OrderItem, OrderStatus } from "../types/order";

export function useRealtimeOrders(restaurantId?: string | null, status?: OrderStatus | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToOrders(restaurantId, (o) => {
      setOrders(o);
      setLoading(false);
    }, status);
    return () => unsub();
  }, [restaurantId, status]);

  const changeStatus = useCallback(
    async (orderId: string, currentStatus: OrderStatus, newStatus: OrderStatus) => {
      if (!restaurantId) return;
      await updateOrderStatus(restaurantId, orderId, currentStatus, newStatus);
    },
    [restaurantId]
  );

  return { orders, loading, changeStatus };
}

export function useOrderItems(restaurantId?: string | null, orderId?: string | null) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId || !orderId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getOrderItems(restaurantId, orderId)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [restaurantId, orderId]);

  return { items, loading };
}

export function useOrders(restaurantId?: string | null, status?: OrderStatus | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getRestaurantOrders(restaurantId, status)
      .then((o) => active && setOrders(o))
      .catch(() => active && setError("Unable to load orders"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [restaurantId, status]);

  return { orders, loading, error };
}
