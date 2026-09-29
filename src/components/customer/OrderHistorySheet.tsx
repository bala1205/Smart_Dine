import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ReceiptText, X } from "lucide-react";
import { useOrderHistory } from "../../hooks/useOrderHistory";
import { isLiveOrderStatus } from "../../utils/orderHistory";
import { formatCurrency, formatTime } from "../../utils/formatting";
import { AccessibleStatus } from "./AccessibleStatus";

function shortRef(orderId: string): string {
  return `#${orderId.slice(-4).toUpperCase()}`;
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function orderStateLabel(status: string, paymentStatus?: string): string {
  if (status === "SERVED" && paymentStatus === "PAID") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "SERVED") return "Served";
  if (status === "READY") return "Ready";
  if (status === "PREPARING") return "Preparing";
  return "Placed";
}

/**
 * Previous Orders entry point on the customer menu page: a floating action
 * styled like the AI Chat trigger, placed ABOVE it, opening a bottom-sheet
 * history panel. Reads only this browser's own order references through the
 * existing order services — no other customer's orders can appear.
 */
export function OrderHistorySheet({ restaurantId }: { restaurantId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [liveMessage, setLiveMessage] = useState("Previous orders closed");
  const { orders, loading } = useOrderHistory(open ? restaurantId : null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setLiveMessage("Previous orders opened");
      closeRef.current?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    return undefined;
  }, [open ]);

  useEffect(() => {
    if (!open) triggerRef.current?.focus();
  }, [open ]);

  if (!open) {
    return (
      <>
        <AccessibleStatus message={liveMessage} />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open previous orders"
          aria-haspopup="dialog"
          className="pressable fixed z-40 right-4 bottom-[10.5rem] w-14 h-14 rounded-full bg-ink-900 text-white shadow-medium border border-white/10 flex items-center justify-center hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <ReceiptText className="w-6 h-6" aria-hidden="true" />
        </button>
      </>
    );
  }

  return (
    <>
      <AccessibleStatus message={liveMessage} />
      <div className="fixed inset-0 z-40 bg-ink-900/30" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sd-history-title"
        className="fixed z-50 bg-white shadow-medium border border-surface-200 flex flex-col overflow-hidden
          inset-x-0 bottom-0 top-auto max-h-[85dvh] rounded-t-3xl
          sm:inset-x-auto sm:right-4 sm:bottom-6 sm:w-[380px] sm:rounded-3xl animate-modal-in"
      >
        <div className="px-4 pt-3 pb-2 border-b border-surface-100">
          <div className="flex items-center gap-2">
            <h2 id="sd-history-title" className="text-[15px] font-bold tracking-tight text-ink-900 mr-auto">
              Previous Orders
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close previous orders"
              className="pressable p-2 rounded-xl text-ink-400 hover:text-ink-700 hover:bg-surface-50 min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll px-4 py-3" role="log" aria-label="Previous orders">
          {loading ? (
            <p className="text-[13px] text-ink-500">Loading orders…</p>
          ) : orders.length === 0 ? (
            <p className="text-[13px] text-ink-500">No previous orders yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {orders.map(({ order, items }) => {
                const live = isLiveOrderStatus(order.status, order.paymentStatus);
                return (
                  <li key={order.id} className="border border-surface-200 rounded-2xl px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-ink-900 text-sm">Order {shortRef(order.id)}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${live ? "bg-blue-50 text-blue-700" : order.status === "CANCELLED" ? "bg-surface-100 text-ink-500" : "bg-green-50 text-green-700"}`}>
                        {orderStateLabel(order.status, order.paymentStatus)}
                      </span>
                    </div>
                    <p className="text-xs text-ink-500 mt-1">Table {order.tableNumber} • {formatDate(order.createdAt)}{formatTime(order.createdAt) ? `, ${formatTime(order.createdAt)}` : ""}</p>
                    {items.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {items.map((it) => (
                          <li key={it.id} className="flex justify-between text-[13px] gap-2">
                            <span className="text-ink-700 min-w-0">{it.itemName} <span className="tabular-nums">× {it.quantity}</span></span>
                            <span className="font-semibold tabular-nums shrink-0">{formatCurrency(it.price * it.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-bold tabular-nums">{formatCurrency(order.grandTotal ?? order.totalAmount)}</span>
                      <button
                        type="button"
                        onClick={() => navigate(`/order/${order.id}?token=${order.trackingToken}`)}
                        className="pressable text-[13px] font-semibold text-brand-700 px-2 py-2 min-h-[40px]"
                      >
                        View Order
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
