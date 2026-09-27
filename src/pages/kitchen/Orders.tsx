import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useOrders } from "../../hooks/useOrders";
import { StatusBadge } from "../../components/common/StatusBadge";
import { EmptyState } from "../../components/common/States";
import { formatCurrency, formatTime } from "../../utils/formatting";
import type { OrderStatus } from "../../types/order";

const FILTERS: { label: string; value: OrderStatus | null }[] = [
  { label: "All", value: null },
  { label: "Placed", value: "PLACED" },
  { label: "Preparing", value: "PREPARING" },
  { label: "Ready", value: "READY" },
  { label: "Served", value: "SERVED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function KitchenOrders() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const { orders, loading } = useOrders(restaurantId, status);

  if (loading && restaurantId) {
    return (
      <div className="space-y-2.5" aria-label="Loading orders">
        <div className="skeleton-shimmer rounded-2xl h-[68px] w-full" />
        <div className="skeleton-shimmer rounded-2xl h-[68px] w-full" />
        <div className="skeleton-shimmer rounded-2xl h-[68px] w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Order history</h1>
        <p>All kitchen orders in one place</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter orders">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setStatus(f.value)}
            aria-pressed={status === f.value}
            className="filter-pill"
          >
            {f.label}
          </button>
        ))}
      </div>
      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card">
          <EmptyState title="No orders yet" description="Orders will appear here." />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card divide-y divide-surface-100 overflow-hidden">
          {orders.map((order) => (
            <div key={order.id} className="px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3">
              <div className="min-w-32">
                <div className="font-mono font-bold text-ink-900 tabular-nums">
                  #{order.id.slice(-4).toUpperCase()}
                </div>
                <div className="text-[13px] text-ink-500">Table {order.tableNumber}</div>
              </div>
              <div className="flex-1 text-sm text-ink-500 tabular-nums">
                {formatTime(order.createdAt)}
              </div>
              <div className="font-bold text-ink-900 tabular-nums">
                {formatCurrency(order.totalAmount)}
              </div>
              <StatusBadge status={order.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
