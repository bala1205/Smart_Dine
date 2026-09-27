import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useRestaurant } from "../../hooks/useRestaurant";
import { useRealtimeOrders, useOrderItems } from "../../hooks/useOrders";
import { Button } from "../../components/common/Button";
import { StatusBadge } from "../../components/common/StatusBadge";
import { EmptyState } from "../../components/common/States";
import { ConfirmDialog } from "../../components/common/Modal";
import { formatTime } from "../../utils/formatting";
import { toast } from "sonner";
import type { Order, OrderStatus } from "../../types/order";

export default function KitchenDashboard() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;
  const { restaurant, loading: rLoading } = useRestaurant(restaurantId);
  const { orders, loading } = useRealtimeOrders(restaurantId);

  const active = ["PLACED", "PREPARING", "READY"] as OrderStatus[];

  if (rLoading || loading) {
    return (
      <div className="space-y-3" aria-label="Loading kitchen">
        <div className="skeleton-shimmer rounded-2xl h-16 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="skeleton-shimmer rounded-2xl h-64 w-full" />
          <div className="skeleton-shimmer rounded-2xl h-64 w-full" />
          <div className="skeleton-shimmer rounded-2xl h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!restaurantId) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-surface-200 shadow-card">
        <p className="text-sm text-ink-500">You don&apos;t have an assigned restaurant.</p>
      </div>
    );
  }

  const byStatus = (s: OrderStatus) =>
    orders.filter((o) => o.status === s).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <div className="page-header">
        <h1>
          {restaurant ? restaurant.name : "Kitchen"}
        </h1>
        <p>Live orders dashboard</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" role="log" aria-live="polite" aria-label="Live kitchen orders">
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

const COLUMN_ACCENT: Record<string, string> = {
  PLACED: "bg-blue-500",
  PREPARING: "bg-orange-500",
  READY: "bg-green-500",
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
    <section aria-label={`${COLUMN_TITLES[status]} column`} className="bg-white rounded-2xl border border-surface-200 shadow-card flex flex-col max-h-[70vh] overflow-hidden">
      <div className="px-4 py-3.5 flex items-center justify-between gap-2 border-b border-surface-100">
        <span className="flex items-center gap-2 text-sm font-bold tracking-tight text-ink-900">
          <span className={`w-2 h-2 rounded-full shrink-0 ${COLUMN_ACCENT[status]}`} aria-hidden="true" />
          {COLUMN_TITLES[status]}
        </span>
        <span className="text-xs font-bold tabular-nums bg-surface-50 border border-surface-200 text-ink-500 rounded-full px-2.5 py-1 min-w-[28px] text-center">
          {orders.length}
        </span>
      </div>
      <div className="p-2.5 space-y-3 overflow-y-auto thin-scroll flex-1 bg-surface-50/60">
        {orders.length === 0 && (
          <div className="text-center text-sm text-ink-400 py-8 bg-white rounded-xl border border-dashed border-surface-200">No orders</div>
        )}
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} restaurantId={restaurantId} />
        ))}
      </div>
    </section>
  );
}

function OrderCard({ order, restaurantId }: { order: Order; restaurantId: string }) {
  const { items } = useOrderItems(restaurantId, order.id);
  const { changeStatus } = useRealtimeOrders(restaurantId);
  const [busy, setBusy] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const action =
    order.status === "PLACED"
      ? { label: "Start Cooking", next: "PREPARING" as OrderStatus }
      : order.status === "PREPARING"
      ? { label: "Mark Ready", next: "READY" as OrderStatus }
      : order.status === "READY"
      ? { label: "Mark Served", next: "SERVED" as OrderStatus }
      : null;

  const canCancel = order.status === "PLACED" || order.status === "PREPARING";

  const handleAction = async () => {
    if (!action || busy) return;
    setBusy(true);
    try {
      await changeStatus(order.id, order.status, action.next);
    } catch {
      toast.error("Failed to update order");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await changeStatus(order.id, order.status, "CANCELLED");
      toast.success("Order cancelled");
    } catch {
      toast.error("Failed to cancel order");
    } finally {
      setBusy(false);
      setShowCancel(false);
    }
  };

  return (
    <article className="bg-white rounded-2xl shadow-card p-4 border border-surface-200">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-[13px] font-bold text-ink-900 tabular-nums">
          #{order.id.slice(-4).toUpperCase()}
        </span>
        <span className="text-[13px] text-brand-700 font-bold">Table {order.tableNumber}</span>
      </div>
      <div className="text-sm text-ink-700 space-y-1">
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
        <div className="mt-2.5 text-xs leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5">
          <span className="font-semibold">Note:</span> {order.specialInstructions}
        </div>
      )}
      <div className="mt-3 space-y-2">
        {action && (
          <Button className="w-full" size="sm" onClick={handleAction} disabled={busy} loading={busy}>
            {busy ? "Updating..." : action.label}
          </Button>
        )}
        {canCancel && (
          <button
            onClick={() => setShowCancel(true)}
            disabled={busy}
            aria-label={`Cancel order ${order.id.slice(-4).toUpperCase()}`}
            className="pressable w-full py-2 min-h-[36px] rounded-xl border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <StatusBadge status={order.status} />
        <span className="text-xs text-ink-400 tabular-nums">{formatTime(order.createdAt)}</span>
      </div>
      <ConfirmDialog
        open={showCancel}
        title="Cancel Order"
        message={`Cancel order #${order.id.slice(-4).toUpperCase()}?`}
        confirmLabel="Cancel Order"
        danger
        onConfirm={handleCancel}
        onCancel={() => setShowCancel(false)}
      />
    </article>
  );
}
