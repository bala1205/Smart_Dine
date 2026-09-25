import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { subscribeToOrders, getOrderItems } from "../../services/orderService";
import { formatCurrency } from "../../utils/formatting";
import {
  computeAnalytics,
  computeMostOrderedDishes,
  computePeakHours,
  getDateRangeBounds,
} from "../../hooks/useAnalytics";
import type { Order, OrderItem } from "../../types/order";
import type { DateRange } from "../../hooks/useAnalytics";

const RANGES: { label: string; value: DateRange }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "thisWeek" },
  { label: "This Month", value: "thisMonth" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "last7" },
  { label: "Last 30 Days", value: "last30" },
];

export default function OwnerAnalytics() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const [orders, setOrders] = useState<Order[]>([]);
  const [range, setRange] = useState<DateRange>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    const unsub = subscribeToOrders(restaurantId, (list) => {
      setOrders(list);
      setLoading(false);
    });
    return () => unsub();
  }, [restaurantId]);

  const filtered = useMemo(() => {
    const { start, end } =
      range === "custom" && customStart && customEnd
        ? getDateRangeBounds("custom", new Date(customStart), new Date(customEnd))
        : getDateRangeBounds(range);
    return orders.filter((o) => {
      const t = o.createdAt ?? 0;
      return t >= start && t <= end;
    });
  }, [orders, range, customStart, customEnd]);

  // Dish stats based on filtered orders — batched to avoid N+1 thundering herd
  const [filteredDishItems, setFilteredDishItems] = useState<OrderItem[]>([]);
  useEffect(() => {
    if (!restaurantId || filtered.length === 0) {
      setFilteredDishItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const concurrency = 10;
      const all: OrderItem[][] = [];
      for (let i = 0; i < filtered.length; i += concurrency) {
        const chunk = filtered.slice(i, i + concurrency);
        const results = await Promise.all(chunk.map((o) => getOrderItems(restaurantId, o.id)));
        all.push(...results);
        if (cancelled) return;
      }
      if (!cancelled) setFilteredDishItems(all.flat());
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, filtered]);

  const analytics = useMemo(() => computeAnalytics(filtered), [filtered]);
  const dishStats = useMemo(() => computeMostOrderedDishes(filteredDishItems), [filteredDishItems]);
  const peakHours = useMemo(() => computePeakHours(filtered), [filtered]);

  const maxPeak = Math.max(1, ...peakHours.map((p) => p.count));

  if (loading) return <div className="text-center text-gray-500 py-16">Loading analytics...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Sales Analytics</h1>

      <div className="flex flex-wrap gap-2 mb-6">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${range === r.value ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
          >
            {r.label}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
          <span className="text-gray-400">-</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
          <button onClick={() => setRange("custom")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${range === "custom" ? "bg-brand-600 text-white" : "bg-white border border-gray-200"}`}>Custom</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-xs text-gray-500 uppercase">Total Sales</div>
          <div className="text-xl font-bold text-gray-800 mt-1">{formatCurrency(analytics.totalSales)}</div>
          <div className="text-xs text-gray-400">{analytics.completedOrders} served orders</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-xs text-gray-500 uppercase">Total Orders</div>
          <div className="text-xl font-bold text-gray-800 mt-1">{analytics.totalOrders}</div>
          <div className="text-xs text-gray-400">All statuses</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-xs text-gray-500 uppercase">Avg Order Value</div>
          <div className="text-xl font-bold text-gray-800 mt-1">{formatCurrency(analytics.avgOrderValue)}</div>
          <div className="text-xs text-gray-400">Based on served</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-xs text-gray-500 uppercase">Completed</div>
          <div className="text-xl font-bold text-green-600 mt-1">{analytics.completedOrders}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-xs text-gray-500 uppercase">Pending</div>
          <div className="text-xl font-bold text-amber-600 mt-1">{analytics.pendingOrders}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-xs text-gray-500 uppercase">Cancelled</div>
          <div className="text-xl font-bold text-red-600 mt-1">{analytics.cancelledOrders}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Most Ordered Dishes 🍽️</h3>
          {dishStats.length === 0 ? (
            <p className="text-sm text-gray-400">No dish data for this period</p>
          ) : (
            <div className="space-y-2">
              {dishStats.map((d, idx) => (
                <div key={d.menuItemId} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                  <span className="flex-1 text-sm font-medium text-gray-700 truncate">{d.itemName}</span>
                  <span className="text-sm text-gray-500">{d.quantity} sold</span>
                  <span className="text-sm font-semibold text-gray-800">{formatCurrency(d.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Peak Ordering Hours ⏰</h3>
          {peakHours.every((p) => p.count === 0) ? (
            <p className="text-sm text-gray-400">No orders in this period</p>
          ) : (
            <div className="space-y-1.5">
              {peakHours.map((p) => (
                <div key={p.hour} className="flex items-center gap-2">
                  <span className="w-16 text-xs text-gray-500">{p.label}</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(p.count / maxPeak) * 100}%` }} />
                  </div>
                  <span className="w-8 text-xs text-gray-700 text-right">{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 mt-6">
        <h3 className="font-semibold text-gray-800 mb-2">GST & Service Charge Collected</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">GST Collected</div>
            <div className="font-bold text-gray-800">{formatCurrency(analytics.totalGst)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">Service Charge</div>
            <div className="font-bold text-gray-800">{formatCurrency(analytics.totalServiceCharge)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
