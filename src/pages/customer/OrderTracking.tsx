import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  onSnapshot,
  collection,
  query,
  doc,
} from "firebase/firestore";
import { Check, ReceiptText, ShieldAlert, UtensilsCrossed } from "lucide-react";
import { db } from "../../lib/firebase";
import { useRestaurant } from "../../hooks/useRestaurant";
import { formatCurrency, formatTime } from "../../utils/formatting";
import { STATUS_LABELS, StatusBadge } from "../../components/common/StatusBadge";
import { PageLoader } from "../../components/common/Spinner";
import { ReadAloudButton } from "../../components/customer/ReadAloudButton";
import { useAdaptivePrefs } from "../../context/AdaptivePrefsContext";
import type { Order, OrderItem, OrderStatus } from "../../types/order";

const STEPS: OrderStatus[] = ["PLACED", "PREPARING", "READY", "SERVED"];

export default function OrderTracking() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const restaurantId = sessionStorage.getItem("smartdine_restaurant_id") || "";
  const { restaurant } = useRestaurant(restaurantId);
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [error, setError] = useState(false);
  const { prefs } = useAdaptivePrefs();

  useEffect(() => {
    if (!orderId || !restaurantId || !token) {
      setError(true);
      return;
    }
    const unsubOrder = onSnapshot(
      doc(db, "restaurants", restaurantId, "orders", orderId),
      (snap) => {
        if (!snap.exists()) {
          setError(true);
          return;
        }
        const data = snap.data() as Omit<Order, "id">;
        if (data.trackingToken !== token) {
          setError(true);
          return;
        }
        setOrder({ id: snap.id, ...data });
        setError(false);
      },
      () => setError(true)
    );

    const unsubItems = onSnapshot(
      query(collection(db, "restaurants", restaurantId, "orders", orderId, "items")),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<OrderItem, "id">),
        }));
        setItems(list);
      },
      () => setError(true)
    );

    return () => {
      unsubOrder();
      unsubItems();
    };
  }, [orderId, restaurantId, token]);

  if (error) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <div className="w-14 h-14 rounded-2xl bg-surface-50 border border-surface-200 flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <ShieldAlert className="w-7 h-7 text-ink-400" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900">Order not found</h1>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">
            Your order tracking link is invalid. Please check with the restaurant.
          </p>
          <button onClick={() => navigate("/")} className="mt-4 text-sm font-semibold text-brand-700 hover:underline underline-offset-2">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-surface-50">
        <PageLoader label="Loading your order..." />
      </div>
    );
  }

  const cancelled = order.status === "CANCELLED";
  const currentIdx = STEPS.indexOf(order.status);

  return (
    <div className="min-h-screen bg-surface-50 pb-10">
      <div className="max-w-lg mx-auto px-4 py-5 sm:py-6">
        <div className="text-center mb-6">
          <Link to="/" className="text-[13px] font-semibold text-brand-700 hover:underline underline-offset-2">
            Back to menu
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900 mt-3 tabular-nums">
            Order #{order.id.slice(-4).toUpperCase()}
          </h1>
          <p className="text-sm text-ink-500 mt-1.5">
            {restaurant?.name ? `${restaurant.name} • ` : ""}Table {order.tableNumber} • Placed at{" "}
            {formatTime(order.createdAt)}
          </p>
          <div className="mt-3 flex justify-center items-center gap-2" role="status" aria-live="polite">
            <StatusBadge status={order.status} pulse />
            {prefs.listen && (
              <ReadAloudButton
                text={`Order status: ${STATUS_LABELS[order.status]}. Table ${order.tableNumber}.`}
                label="order status"
              />
            )}
          </div>
        </div>

        {cancelled ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center" role="alert">
            <p className="text-sm text-red-700 font-semibold">Your order was cancelled. Please contact staff if you need help.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-5 mb-4">
            <ol className="space-y-0" aria-label="Order progress">
              {STEPS.map((step, idx) => {
                const active = idx <= currentIdx;
                const isCurrent = idx === currentIdx;
                const stepTime = stepTimeFor(order, step);
                return (
                  <li key={step} className="flex gap-3.5" aria-current={isCurrent ? "step" : undefined}>
                    <div className="flex flex-col items-center" aria-hidden="true">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center ${
                          active ? "bg-brand-600 text-white shadow-sm" : "bg-surface-50 border border-surface-200 text-ink-400"
                        }`}
                      >
                        {active ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <span className="w-1.5 h-1.5 rounded-full bg-ink-400/50" />}
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div className={`w-px flex-1 min-h-[18px] my-1 ${idx < currentIdx ? "bg-brand-200" : "bg-surface-200"}`} />
                      )}
                    </div>
                    <div className="flex-1 pb-5">
                      <div className={`text-sm font-semibold ${active ? "text-ink-900" : "text-ink-400"}`}>
                        {STEP_LABEL[step]}
                      </div>
                      {isCurrent && active ? (
                        <div className="text-xs text-brand-700 font-semibold mt-0.5">In progress</div>
                      ) : active && stepTime ? (
                        <div className="text-xs text-ink-400 mt-0.5 tabular-nums">{formatTime(stepTime)}</div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-5 mb-4">
          <h2 className="font-bold tracking-tight text-[15px] text-ink-900 mb-3">Items</h2>
          <div className="space-y-2.5">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between items-baseline gap-3 text-sm">
                <span className="text-ink-700 min-w-0">
                  <span className="font-medium">{item.itemName}</span> <span className="text-ink-400 tabular-nums">× {item.quantity}</span>
                </span>
                <span className="font-semibold text-ink-900 tabular-nums shrink-0">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-surface-100 mt-4 pt-3 space-y-1.5">
            <div className="flex justify-between text-sm text-ink-500">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(order.totalAmount)}</span>
            </div>
            {order.gstAmount != null && order.gstAmount > 0 && (
              <div className="flex justify-between text-sm text-ink-500">
                <span>GST {order.gstPercent ?? 0}%</span>
                <span className="tabular-nums">{formatCurrency(order.gstAmount)}</span>
              </div>
            )}
            {order.serviceChargeAmount != null && order.serviceChargeAmount > 0 && (
              <div className="flex justify-between text-sm text-ink-500">
                <span>Service charge {order.serviceChargePercent ?? 0}%</span>
                <span className="tabular-nums">{formatCurrency(order.serviceChargeAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[15px] font-bold text-ink-900">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(order.grandTotal ?? order.totalAmount)}</span>
            </div>
          </div>
          <Link
            to={`/bill/${restaurantId}/${order.id}`}
            className="pressable mt-4 flex items-center justify-center gap-2 w-full text-center py-3 min-h-[46px] rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-700"
          >
            <ReceiptText className="w-4 h-4" aria-hidden="true" />
            View digital bill
          </Link>
        </div>

        {order.status === "READY" && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center" role="status">
            <p className="text-sm text-green-700 font-semibold">
              Your order is ready. Please collect it at the counter.
            </p>
          </div>
        )}

        {order.status === "SERVED" && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center" role="status">
            <div className="w-12 h-12 rounded-2xl bg-white border border-green-200 flex items-center justify-center mx-auto mb-3" aria-hidden="true">
              <UtensilsCrossed className="w-6 h-6 text-green-700" strokeWidth={1.75} />
            </div>
            <h2 className="text-[17px] font-bold tracking-tight text-green-800">Order served</h2>
            <p className="text-sm text-green-700 mt-1">
              Your order has been served. Enjoy your meal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const STEP_LABEL: Record<OrderStatus, string> = {
  PLACED: "Order placed",
  PREPARING: "Preparing",
  READY: "Ready to serve",
  SERVED: "Served",
  CANCELLED: "Cancelled",
};

function stepTimeFor(order: Order, step: OrderStatus): number | null {
  const v =
    step === "PLACED"
      ? order.createdAt
      : step === "PREPARING"
      ? order.preparingAt
      : step === "READY"
      ? order.readyAt
      : step === "SERVED"
      ? order.servedAt
      : null;
  return v ?? null;
}
