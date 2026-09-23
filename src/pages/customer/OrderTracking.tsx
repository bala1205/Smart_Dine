import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  onSnapshot,
  collection,
  query,
  doc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useRestaurant } from "../../hooks/useRestaurant";
import { formatCurrency, formatTime } from "../../utils/formatting";
import { STATUS_LABELS } from "../../components/common/StatusBadge";
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-800">Order Not Found</h1>
          <p className="text-gray-600 mt-2">
            Your order tracking link is invalid. Please check with the restaurant.
          </p>
          <button onClick={() => navigate("/")} className="mt-4 text-brand-600 font-medium">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        Loading your order...
      </div>
    );
  }

  const cancelled = order.status === "CANCELLED";
  const currentIdx = STEPS.indexOf(order.status);

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <Link to="/" className="text-sm text-brand-600 font-medium">
            Back to menu
          </Link>
          <h1 className="text-3xl font-bold text-gray-800 mt-3">
            Order #{order.id.slice(-4).toUpperCase()}
          </h1>
          <p className="text-gray-500 mt-1">
            {restaurant?.name ? `${restaurant.name} • ` : ""}Table {order.tableNumber} • Placed at{" "}
            {formatTime(order.createdAt)}
          </p>
          <div className="mt-3">
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold bg-brand-100 text-brand-700">
              {STATUS_LABELS[order.status]}
            </span>
          </div>
        </div>

        {cancelled ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-700 font-medium">Your order was cancelled.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
            <div className="space-y-1">
              {STEPS.map((step, idx) => {
                const active = idx <= currentIdx;
                const isCurrent = idx === currentIdx;
                const stepTime = stepTimeFor(order, step);
                return (
                  <div key={step} className="flex items-center gap-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        active ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {active ? "✓" : "○"}
                    </div>
                    <div className="flex-1">
                      <div className={`font-medium ${active ? "text-gray-800" : "text-gray-400"}`}>
                        {STEP_LABEL[step]}
                      </div>
                      {isCurrent && active ? (
                        <div className="text-xs text-brand-600 font-medium">In progress</div>
                      ) : active && stepTime ? (
                        <div className="text-xs text-gray-400">{formatTime(stepTime)}</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
          <h2 className="font-semibold text-gray-800 mb-3">Items</h2>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {item.itemName} <span className="text-gray-400">× {item.quantity}</span>
                </span>
                <span className="font-medium text-gray-800">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 mt-4 pt-3 flex justify-between font-bold text-gray-900">
            <span>Total</span>
            <span>{formatCurrency(order.totalAmount)}</span>
          </div>
        </div>

        {order.status === "READY" && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-green-700 font-medium">
              Your order is ready! Please collect it at the counter.
            </p>
          </div>
        )}

        {order.status === "SERVED" && (
          <div className="bg-green-50 border border-green-300 rounded-xl p-5 text-center">
            <div className="text-6xl mb-3">🍽️</div>
            <h2 className="text-lg font-bold text-green-800">Order served</h2>
            <p className="text-green-700 mt-1">
              Your order has been served. Enjoy your meal!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const STEP_LABEL: Record<OrderStatus, string> = {
  PLACED: "ORDER PLACED",
  PREPARING: "PREPARING",
  READY: "READY TO SERVE",
  SERVED: "SERVED",
  CANCELLED: "CANCELLED",
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
