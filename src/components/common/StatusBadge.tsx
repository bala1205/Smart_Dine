import type { OrderStatus } from "../../types/order";

const STATUS_STYLES: Record<OrderStatus, string> = {
  PLACED: "bg-blue-50 text-blue-700 border-blue-200",
  PREPARING: "bg-orange-50 text-orange-700 border-orange-200",
  READY: "bg-green-50 text-green-700 border-green-200",
  SERVED: "bg-surface-50 text-ink-500 border-surface-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_DOT: Record<OrderStatus, string> = {
  PLACED: "bg-blue-500",
  PREPARING: "bg-orange-500",
  READY: "bg-green-500",
  SERVED: "bg-ink-400",
  CANCELLED: "bg-red-500",
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: "New",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served",
  CANCELLED: "Cancelled",
};

export function StatusBadge({ status, pulse = false }: { status: OrderStatus; pulse?: boolean }) {
  const live = pulse || status === "PLACED" || status === "PREPARING";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${STATUS_STYLES[status]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]} ${live ? "animate-pulse" : ""}`}
        aria-hidden="true"
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
