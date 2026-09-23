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
    return <div className="text-center text-gray-500 py-16">Loading orders...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Order History</h1>
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setStatus(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${
              status === f.value ? "bg-brand-600 text-white" : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Orders will appear here." />
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {orders.map((order) => (
            <div key={order.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="min-w-32">
                <div className="font-bold text-gray-800">
                  #{order.id.slice(-4).toUpperCase()}
                </div>
                <div className="text-sm text-gray-500">Table {order.tableNumber}</div>
              </div>
              <div className="flex-1 text-sm text-gray-600">
                {formatTime(order.createdAt)}
              </div>
              <div className="font-semibold text-gray-800">
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
