import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "../../lib/firebase";
import { useCart } from "../../context/CartContext";
import { getTable } from "../../services/tableService";
import { createOrder } from "../../services/orderService";
import { getRestaurantContext } from "../../utils/session";
import { formatCurrency } from "../../utils/formatting";
import { Button } from "../../components/common/Button";
import { TextArea } from "../../components/common/Form";
import type { Table } from "../../types/table";
import type { Restaurant } from "../../types/restaurant";

export default function Checkout() {
  const navigate = useNavigate();
  const { lines, total, clear, count } = useCart();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [qrToken, setQrToken] = useState("");

  useEffect(() => {
    const ctx = getRestaurantContext();
    // Prefer the token in the URL, then fall back to the one saved in the
    // session context so Checkout works when reached from the cart drawer
    // (which navigates to /checkout without a query string).
    const token =
      new URLSearchParams(window.location.search).get("token") || ctx.qrToken || "";
    setQrToken(token);
    console.log("[QR_SESSION] checkout session", {
      restaurantId: ctx.restaurantId,
      tableId: ctx.tableId,
      hasRestaurantId: !!ctx.restaurantId,
      hasTableId: !!ctx.tableId,
      hasQrToken: !!token,
    });
    if (!ctx.restaurantId || !ctx.tableId) {
      setLoading(false);
      return;
    }
    Promise.all([
      getDoc(doc(db, "restaurants", ctx.restaurantId)),
      getTable(ctx.restaurantId, ctx.tableId),
    ])
      .then(([restSnap, t]) => {
        setTable(t);
        if (restSnap.exists()) {
          const data = restSnap.data() as Omit<Restaurant, "id">;
          setRestaurant({ id: ctx.restaurantId!, ...data });
        }
      })
      .catch(() => setRestaurant(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <CheckoutShell>
        <div className="text-center py-16 text-gray-500">Loading checkout...</div>
      </CheckoutShell>
    );
  }

  if (!restaurant || !table || !qrToken || !restaurant.isActive || !table.isActive) {
    return (
      <CheckoutShell>
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🍽️</div>
          <h1 className="text-xl font-bold text-gray-800">Session Invalid</h1>
          <p className="text-gray-600 mt-2">Please rescan the QR code to place an order.</p>
          <Link to="/" className="mt-4 inline-block text-brand-600 font-medium">
            Go back
          </Link>
        </div>
      </CheckoutShell>
    );
  }

  if (count === 0) {
    return (
      <CheckoutShell>
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🛒</div>
          <h1 className="text-xl font-bold text-gray-800">Your cart is empty</h1>
          <p className="text-gray-600 mt-2">Add some items before checkout.</p>
          <Link
            to={`/menu/${restaurant.id}/${table.id}?token=${qrToken}`}
            className="mt-4 inline-block text-brand-600 font-medium"
          >
            Back to menu
          </Link>
        </div>
      </CheckoutShell>
    );
  }

  async function placeOrder() {
    if (!restaurant || !table || placing) return;
    setPlacing(true);
    console.log("[ORDER] create started", {
      restaurantId: restaurant.id,
      tableId: table.id,
      hasQrToken: !!qrToken,
      itemCount: lines.length,
    });
    try {
      const { orderId, trackingToken } = await createOrder({
        restaurantId: restaurant.id,
        tableId: table.id,
        qrToken,
        items: lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          specialInstruction: l.specialInstruction,
        })),
        specialInstructions: instructions,
      });
      console.log("[ORDER] create success", { orderId, hasTrackingToken: !!trackingToken });
      clear();
      navigate(`/order/${orderId}?token=${trackingToken}`);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      console.error("[ORDER] create failed", {
        code: err?.code ?? "unknown",
        message: err?.message ?? String(e),
        restaurantId: restaurant.id,
        tableId: table.id,
        hasQrToken: !!qrToken,
      });
      const code = (err?.code || "").toLowerCase();
      const msg = (err?.message || "").toLowerCase();
      if (code.includes("permission") || code.includes("denied") || code === "firestore/permission-denied") {
        toast.error("Unable to place order. Your table session may have expired. Please rescan the QR code.");
      } else if (code === "not-found" || code === "firestore/not-found") {
        toast.error("The restaurant or table is no longer available.");
      } else if (code === "unavailable" || code === "firestore/unavailable") {
        toast.error("Unable to place order. Please try again.");
      } else if (
        msg.includes("table not found") ||
        msg.includes("table is not available") ||
        msg.includes("restaurant not found") ||
        msg.includes("restaurant is not accepting")
      ) {
        toast.error("This table QR session has expired. Please scan the table QR again.");
      } else if (msg.includes("available") || msg.includes("quantity") || msg.includes("duplicate")) {
        toast.error("Some items are no longer available. Please review your cart.");
      } else {
        toast.error("Unable to place order. Please try again.");
      }
    } finally {
      setPlacing(false);
    }
  }

  return (
    <CheckoutShell>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-800">Checkout</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="font-medium text-gray-800">{restaurant.name}</div>
        <div className="text-sm text-gray-500 mt-1">Table {table.tableNumber}</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">Order Items</h2>
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.menuItemId} className="flex justify-between text-sm">
              <span className="text-gray-700">
                {line.name} <span className="text-gray-400">× {line.quantity}</span>
              </span>
              <span className="font-medium text-gray-800">
                {formatCurrency(line.price * line.quantity)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <TextArea
          label="Special Instructions"
          placeholder="e.g. Less spicy, no onions..."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 space-y-1">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>{formatCurrency(total)}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-gray-900">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      <Button onClick={placeOrder} loading={placing} className="w-full py-3 text-base">
        {placing ? "Placing Order..." : "Place Order"}
      </Button>
    </CheckoutShell>
  );
}

function CheckoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="max-w-lg mx-auto px-4 py-6">{children}</div>
    </div>
  );
}
