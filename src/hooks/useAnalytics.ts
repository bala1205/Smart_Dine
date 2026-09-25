import { useMemo } from "react";
import type { Order, OrderItem } from "../types/order";

export type DateRange = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "thisWeek" | "custom";

export function getDateRangeBounds(range: DateRange, customStart?: Date, customEnd?: Date): { start: number; end: number } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let start: Date;
  switch (range) {
    case "today":
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = new Date(y);
      start.setHours(0, 0, 0, 0);
      const e = new Date(y);
      e.setHours(23, 59, 59, 999);
      return { start: start.getTime(), end: e.getTime() };
    }
    case "last7":
      start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "last30":
      start = new Date(now);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    case "thisMonth":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      break;
    case "thisWeek": {
      const day = now.getDay(); // 0 Sun, 1 Mon
      const diff = day === 0 ? -6 : 1 - day; // Monday as start
      start = new Date(now);
      start.setDate(now.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "custom":
      if (customStart && customEnd) {
        const s = new Date(customStart);
        s.setHours(0, 0, 0, 0);
        const e = new Date(customEnd);
        e.setHours(23, 59, 59, 999);
        return { start: s.getTime(), end: e.getTime() };
      }
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
  }
  return { start: start.getTime(), end: end.getTime() };
}

export interface AnalyticsData {
  totalSales: number;
  totalOrders: number;
  avgOrderValue: number;
  completedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  totalGst: number;
  totalServiceCharge: number;
}

export function computeAnalytics(orders: Order[]): AnalyticsData {
  const totalOrders = orders.length;
  let totalSales = 0;
  let completed = 0;
  let pending = 0;
  let cancelled = 0;
  let totalGst = 0;
  let totalSc = 0;
  for (const o of orders) {
    const grand = o.grandTotal ?? o.totalAmount ?? 0;
    const gst = o.gstAmount ?? 0;
    const sc = o.serviceChargeAmount ?? 0;
    if (o.status === "SERVED") {
      totalSales += grand;
      completed++;
      totalGst += gst;
      totalSc += sc;
    } else if (o.status === "CANCELLED") {
      cancelled++;
    } else {
      // For sales we count only SERVED as completed sales per spec, but also include PLACED etc for avg?
      // We'll count totalSales only for SERVED, but pending for active
      if (["PLACED", "PREPARING", "READY"].includes(o.status)) pending++;
    }
  }
  // Include all orders for avg, but sales only served
  const avgOrderValue = completed > 0 ? totalSales / completed : 0;
  return {
    totalSales,
    totalOrders,
    avgOrderValue,
    completedOrders: completed,
    pendingOrders: pending,
    cancelledOrders: cancelled,
    totalGst,
    totalServiceCharge: totalSc,
  };
}

export interface DishStat {
  menuItemId: string;
  itemName: string;
  quantity: number;
  revenue: number;
}

export function computeMostOrderedDishes(items: OrderItem[]): DishStat[] {
  const map = new Map<string, DishStat>();
  for (const it of items) {
    const key = it.menuItemId;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += it.quantity;
      existing.revenue += it.price * it.quantity;
    } else {
      map.set(key, {
        menuItemId: it.menuItemId,
        itemName: it.itemName,
        quantity: it.quantity,
        revenue: it.price * it.quantity,
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);
}

export interface PeakHour {
  hour: number;
  label: string;
  count: number;
}

export function computePeakHours(orders: Order[]): PeakHour[] {
  const counts = new Array(24).fill(0);
  for (const o of orders) {
    const d = new Date(o.createdAt);
    const h = d.getHours();
    if (h >= 0 && h < 24) counts[h]++;
  }
  return counts.map((count, hour) => ({
    hour,
    label: `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`,
    count,
  }));
}

export function useFilteredOrders(
  orders: Order[],
  range: DateRange,
  customStart?: Date,
  customEnd?: Date
) {
  return useMemo(() => {
    const { start, end } = getDateRangeBounds(range, customStart, customEnd);
    return orders.filter((o) => {
      const t = o.createdAt ?? 0;
      return t >= start && t <= end;
    });
  }, [orders, range, customStart, customEnd]);
}
