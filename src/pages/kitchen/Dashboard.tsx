import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useRestaurant } from "../../hooks/useRestaurant";
import { useRealtimeOrders, useOrderItems } from "../../hooks/useOrders";
import { Button } from "../../components/common/Button";
import { StatusBadge } from "../../components/common/StatusBadge";
import { EmptyState } from "../../components/common/States";
import { formatTime } from "../../utils/formatting";
import type { Order, OrderStatus } from "../../types/order";

export default function KitchenDashboard() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;
  const { restaurant, loading: rLoading } = useRestaurant(restaurantId);
  const { orders, loading } = useRealtimeOrders(restaurantId);

  const active = ["PLACED", "PREPARING", "READY"] as OrderStatus[];

  if (rLoading || loading) {
    return <div className="text-center text-gray-500 py-16">Loading kitchen...</div>;
  }

  if (!restaurantId) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-600">You don't have an assigned restaurant.</p>
      </div>
    );
  }

  const byStatus = (s: OrderStatus) =>
    orders.filter((o) => o.status === s).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {restaurant ? restaurant.name : "Kitchen"}
        </h1>
        <p className="text-gray-500 text-sm">Live orders dashboard</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {active.map((status) => (
          <KitchenColumn
            key={status}
            status={status}
            orders={byStatus(status)}
            restaurantId={restaurantId}
          />
        ))}
      </div>
    </div>
  );
}

const COLUMN_TITLES: Record<string, string> = {
  PLACED: "New Orders",
  PREPARING: "Preparing",
  READY: "Ready",
};

const COLUMN_COLORS: Record<string, string> = {
  PLACED: "border-blue-200",
  PREPARING: "border-orange-200",
  READY: "border-green-200",
};

function KitchenColumn({
  status,
  orders,
  restaurantId,
}: {
  status: OrderStatus;
  orders: Order[];
  restaurantId: string;
}) {
  return (
    <div className={`bg-gray-50 rounded-xl border ${COLUMN_COLORS[status]} flex flex-col max-h-[70vh]`}>
      <div className="px-4 py-3 font-bold text-gray-700 flex items-center justify-between border-b border-gray-100">
        <span>{COLUMN_TITLES[status]}</span>
        <span className="text-xs bg-white rounded-full px-2 py-0.5 border border-gray-200">
          {orders.length}
        </span>
      </div>
      <div className="p-2 space-y-3 overflow-y-auto flex-1">
        {orders.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-8">No orders</div>
        )}
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} restaurantId={restaurantId} />
        ))}
      </div>
    </div>
  );
}

function OrderCard({ order, restaurantId }: { order: Order; restaurantId: string }) {
  const { items } = useOrderItems(restaurantId, order.id);
  const { changeStatus } = useRealtimeOrders(restaurantId);
  const [busy, setBusy] = useState(false);

  const action =
    order.status === "PLACED"
      ? { label: "Start Cooking", next: "PREPARING" as OrderStatus }
      : order.status === "PREPARING"
      ? { label: "Mark Ready", next: "READY" as OrderStatus }
      : order.status === "READY"
      ? { label: "Mark Served", next: "SERVED" as OrderStatus }
      : null;

  const handleAction = async () => {
    if (!action || busy) return;
    setBusy(true);
    try {
      await changeStatus(order.id, order.status, action.next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono font-bold text-gray-800">
          ORDER #{order.id.slice(-4).toUpperCase()}
        </span>
        <span className="text-brand-700 font-bold">TABLE {order.tableNumber}</span>
      </div>
      <div className="text-sm text-gray-700 space-y-0.5">
        {items.map((item) => (
          <div key={item.id}>
            <span className="font-medium">{item.itemName}</span>{" "}
            <span className="text-gray-400">× {item.quantity}</span>
            {item.specialInstruction && (
              <span className="text-amber-600 block text-xs ml-3">
                Note: {item.specialInstruction}
              </span>
            )}
          </div>
        ))}
      </div>
      {order.specialInstructions && (
        <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-md px-2 py-1">
          Note: {order.specialInstructions}
        </div>
      )}
      <div className="mt-3">
        {action && (
          <Button className="w-full" onClick={handleAction} disabled={busy}>
            {busy ? "Updating..." : action.label}
          </Button>
        )}
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-400">
        <StatusBadge status={order.status} />
        <span>{formatTime(order.createdAt)}</span>
      </div>
    </div>
  );
}
