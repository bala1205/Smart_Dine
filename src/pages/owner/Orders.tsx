import { useMemo, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useRealtimeOrders, useOrderItems } from "../../hooks/useOrders";
import { StatusBadge } from "../../components/common/StatusBadge";
import { EmptyState } from "../../components/common/States";
import { Modal } from "../../components/common/Modal";
import { formatCurrency, formatDate, formatDateOnly, formatTime } from "../../utils/formatting";
import type { Order, OrderStatus } from "../../types/order";
import type { OrderItem } from "../../types/order";

const FILTERS: { label: string; value: OrderStatus | null }[] = [
  { label: "All", value: null },
  { label: "New", value: "PLACED" },
  { label: "Preparing", value: "PREPARING" },
  { label: "Ready", value: "READY" },
  { label: "Served", value: "SERVED" },
  { label: "Cancelled", value: "CANCELLED" },
];

function statusTimestampFor(order: Order, status: OrderStatus): number | null {
  const v =
    status === "PLACED"
      ? order.createdAt
      : status === "PREPARING"
      ? order.preparingAt
      : status === "READY"
      ? order.readyAt
      : status === "SERVED"
      ? order.servedAt
      : (null as number | null);
  return v ?? null;
}

export default function OwnerOrders() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const { orders, loading, changeStatus } = useRealtimeOrders(restaurantId);
  const [selected, setSelected] = useState<Order | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { PLACED: 0, PREPARING: 0, READY: 0, SERVED: 0, CANCELLED: 0 };
    for (const order of orders) c[order.status] = (c[order.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    return status
      ? orders.filter((o) => o.status === status)
      : orders;
  }, [orders, status]);

  const sorted = [...filtered].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Orders</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setStatus(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              status === f.value
                ? "bg-brand-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f.label}
            {f.value && (
              <span className={`ml-1.5 text-xs ${status === f.value ? "text-brand-100" : "text-gray-400"}`}>
                {counts[f.value] ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading orders...</div>
      ) : sorted.length === 0 ? (
        <EmptyState title="No orders yet" description="Customer orders will appear here in real time." />
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {sorted.map((order) => (
            <button
              key={order.id}
              onClick={() => setSelected(order)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex flex-wrap items-center gap-3"
            >
              <div className="min-w-28">
                <div className="font-mono font-bold text-gray-800">
                  #{order.id.slice(-4).toUpperCase()}
                </div>
                <div className="text-sm text-gray-500">Table {order.tableNumber}</div>
              </div>
              <div className="flex-1 min-w-40 text-sm text-gray-600 truncate">
                {order.specialInstructions || "No special instructions"}
              </div>
              <div className="text-xs text-gray-400">
                <div>{formatDateOnly(order.createdAt)}</div>
                <div>{formatTime(order.createdAt)}</div>
              </div>
              <div className="font-semibold text-gray-800">
                {formatCurrency(order.totalAmount)}
              </div>
              <StatusBadge status={order.status} />
            </button>
          ))}
        </div>
      )}

      {selected && (
        <OrderDetailModal
          order={selected}
          restaurantId={restaurantId}
          changeStatus={changeStatus}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function OrderDetailModal({
  order,
  restaurantId,
  changeStatus,
  onClose,
}: {
  order: Order;
  restaurantId: string;
  changeStatus: (orderId: string, currentStatus: OrderStatus, newStatus: OrderStatus) => Promise<void>;
  onClose: () => void;
}) {
  const { items } = useOrderItems(restaurantId, order.id);
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
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const timeline: { status: OrderStatus; time: number | null }[] = (
    ["PLACED", "PREPARING", "READY", "SERVED"] as OrderStatus[]
  ).map((s) => ({ status: s, time: statusTimestampFor(order, s) }));

  return (
    <Modal open onClose={onClose} title={`Order #${order.id.slice(-4).toUpperCase()}`} wide>
      <div className="space-y-4 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Status</span>
          <StatusBadge status={order.status} />
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Table</span>
          <span className="font-medium text-gray-800">Table {order.tableNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Placed At</span>
          <span className="font-medium text-gray-800">
            {formatDateOnly(order.createdAt)} · {formatTime(order.createdAt)}
          </span>
        </div>

        <div>
          <div className="text-gray-500 mb-2">Timeline</div>
          <div className="space-y-1">
            {timeline.map((step) => (
              <div key={step.status} className="flex items-center gap-3">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    step.time != null ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {step.time != null ? "✓" : "○"}
                </span>
                <span className={step.time != null ? "font-medium text-gray-800" : "text-gray-400"}>
                  {step.status.charAt(0) + step.status.slice(1).toLowerCase()}
                </span>
                {step.time != null && (
                  <span className="ml-auto text-xs text-gray-400">{formatTime(step.time)}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {order.specialInstructions && (
          <div className="bg-amber-50 rounded-md p-3 text-amber-800">
            <span className="font-medium">Instructions: </span>
            {order.specialInstructions}
          </div>
        )}

        <div>
          <div className="text-gray-500 mb-2">Items</div>
          <ItemsList items={items} />
        </div>

        <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900">
          <span>Total</span>
          <span>{formatCurrency(order.totalAmount)}</span>
        </div>

        {action && (
          <button
            onClick={handleAction}
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Updating..." : action.label}
          </button>
        )}
      </div>
    </Modal>
  );
}

function ItemsList({ items }: { items: OrderItem[] }) {
  if (items.length === 0) return <p className="text-gray-400">Loading items...</p>;
  return (
    <div className="space-y-1 mt-2">
      {items.map((item) => (
        <div key={item.id} className="flex justify-between">
          <span className="text-gray-700">
            {item.itemName} <span className="text-gray-400">× {item.quantity}</span>
            {item.specialInstruction && (
              <span className="block text-xs text-amber-600">Note: {item.specialInstruction}</span>
            )}
          </span>
          <span className="font-medium text-gray-800">
            {formatCurrency(item.price * item.quantity)}
          </span>
        </div>
      ))}
    </div>
  );
}
