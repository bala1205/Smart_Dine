import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardList,
  CookingPot,
  CheckCircle2,
  IndianRupee,
  UtensilsCrossed,
  Grid3X3,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useRestaurant } from "../../hooks/useRestaurant";
import { useRealtimeOrders } from "../../hooks/useOrders";
import { getTables } from "../../services/tableService";
import { getMenuItems } from "../../services/menuService";
import { getTodayOrders } from "../../services/orderService";
import { StatusBadge } from "../../components/common/StatusBadge";
import { EmptyState, Skeleton } from "../../components/common/States";
import { formatCurrency, formatTime } from "../../utils/formatting";
import type { Order } from "../../types/order";

export default function OwnerDashboard() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;
  const { restaurant, loading: rLoading } = useRestaurant(restaurantId);
  const { orders, loading: ordersLoading } = useRealtimeOrders(restaurantId);
  const [tableCount, setTableCount] = useState<number | null>(null);
  const [menuCount, setMenuCount] = useState<number | null>(null);
  const [todayRevenue, setTodayRevenue] = useState<number | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    getTables(restaurantId).then((t) => setTableCount(t.length)).catch(() => setTableCount(0));
    getMenuItems(restaurantId).then((m) => setMenuCount(m.length)).catch(() => setMenuCount(0));
    getTodayOrders(restaurantId)
      .then((today: Order[]) => {
        setTodayCount(today.length);
        setTodayRevenue(
          today
            .filter((o) => o.status !== "CANCELLED")
            .reduce((sum, o) => sum + o.totalAmount, 0)
        );
      })
      .catch(() => {
        setTodayCount(0);
        setTodayRevenue(0);
      });
  }, [restaurantId]);

  const activeCount = orders.filter((o) =>
    ["PLACED", "PREPARING", "READY"].includes(o.status)
  ).length;
  const completedCount = orders.filter((o) => o.status === "SERVED").length;
  const recent = orders.slice(0, 8);

  const cards = [
    {
      label: "Today's Orders",
      value: todayCount,
      icon: ClipboardList,
      color: "bg-blue-100 text-blue-600",
      loading: todayCount === null,
    },
    {
      label: "Active Orders",
      value: activeCount,
      icon: CookingPot,
      color: "bg-orange-100 text-orange-600",
      loading: ordersLoading,
    },
    {
      label: "Completed Orders",
      value: completedCount,
      icon: CheckCircle2,
      color: "bg-green-100 text-green-600",
      loading: ordersLoading,
    },
    {
      label: "Today's Revenue",
      value: todayRevenue === null ? null : formatCurrency(todayRevenue),
      icon: IndianRupee,
      color: "bg-emerald-100 text-emerald-600",
      loading: todayRevenue === null,
    },
    {
      label: "Menu Items",
      value: menuCount,
      icon: UtensilsCrossed,
      color: "bg-purple-100 text-purple-600",
      loading: menuCount === null,
    },
    {
      label: "Tables",
      value: tableCount,
      icon: Grid3X3,
      color: "bg-amber-100 text-amber-600",
      loading: tableCount === null,
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {rLoading ? "Dashboard" : restaurant ? restaurant.name : "Dashboard"}
        </h1>
        <p className="text-gray-500 text-sm">Monitoring your restaurant in real time</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-surface-200 p-5 shadow-card hover-lift">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            {card.loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-2xl font-bold tracking-tight text-ink-900">{card.value ?? "0"}</div>
            )}
            <div className="text-xs font-medium text-ink-500 mt-1 tracking-wide">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-surface-200 shadow-card">
        <div className="px-6 py-4 border-b border-surface-100 flex items-center justify-between">
          <h2 className="font-bold tracking-tight text-ink-900">Live Orders</h2>
          <Link to="/owner/orders" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-6">
          {["PLACED", "PREPARING", "READY"].map((s) => (
            <div key={s} className="bg-surface-50 rounded-xl p-4 border border-surface-200">
              <div className="text-[11px] font-bold tracking-widest uppercase text-ink-400 mb-3">{s}</div>
              {recent.length === 0 ? (
                <p className="text-sm text-ink-400">No orders</p>
              ) : (
                <div className="space-y-2.5">
                  {recent
                    .filter((o) => o.status === s)
                    .slice(0, 4)
                    .map((o) => (
                      <div key={o.id} className="text-sm flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-surface-200">
                        <span className="font-semibold text-ink-700">Table {o.tableNumber}</span>
                        <span className="font-medium text-ink-900">{formatCurrency(o.totalAmount)}</span>
                      </div>
                    ))}
                  {recent.filter((o) => o.status === s).length === 0 && (
                    <p className="text-sm text-ink-400">None</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-bold tracking-tight text-ink-900 mb-4">Recent Orders</h2>
        {recent.length === 0 ? (
          <EmptyState title="No orders yet" description="Customer orders will show up here in real time." />
        ) : (
          <div className="bg-white rounded-2xl border border-surface-200 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-100 text-sm">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold tracking-widest uppercase text-ink-400">Order</th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold tracking-widest uppercase text-ink-400">Table</th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold tracking-widest uppercase text-ink-400">Amount</th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold tracking-widest uppercase text-ink-400">Status</th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold tracking-widest uppercase text-ink-400">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {recent.map((o) => (
                    <tr key={o.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-ink-900">
                        #{o.id.slice(-4).toUpperCase()}
                      </td>
                      <td className="px-6 py-4 text-ink-600 font-medium">Table {o.tableNumber}</td>
                      <td className="px-6 py-4 font-bold text-ink-900">{formatCurrency(o.totalAmount)}</td>
                      <td className="px-6 py-4"><StatusBadge status={o.status} /></td>
                      <td className="px-6 py-4 text-ink-500">{formatTime(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
