import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, TriangleAlert, QrCode, ShoppingBag } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "../../lib/firebase";
import { useCart } from "../../context/CartContext";
import { getTable } from "../../services/tableService";
import { createOrder } from "../../services/orderService";
import { getRestaurantContext } from "../../utils/session";
import { formatCurrency } from "../../utils/formatting";
import { calculateBill } from "../../utils/billing";
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
    if (import.meta.env.DEV) console.log("[QR_SESSION] checkout session", {
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
        <div className="space-y-3" aria-label="Loading checkout">
          <div className="skeleton-shimmer rounded-2xl h-20 w-full" />
          <div className="skeleton-shimmer rounded-2xl h-40 w-full" />
          <div className="skeleton-shimmer rounded-2xl h-32 w-full" />
        </div>
      </CheckoutShell>
    );
  }

  const isAccessAvailable = (table as unknown as { isAccessAvailable?: boolean })?.isAccessAvailable ?? true;
  if (!isAccessAvailable) {
    return (
      <CheckoutShell>
        <div className="text-center bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <TriangleAlert className="w-7 h-7 text-amber-600" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900">Table currently unavailable</h1>
          <p className="text-sm text-ink-500 mt-2">Please contact the restaurant staff.</p>
        </div>
      </CheckoutShell>
    );
  }

  if (!restaurant || !table || !qrToken || !restaurant.isActive || !table.isActive) {
    return (
      <CheckoutShell>
        <div className="text-center bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <div className="w-14 h-14 rounded-2xl bg-surface-50 border border-surface-200 flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <QrCode className="w-7 h-7 text-ink-400" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900">Session invalid</h1>
          <p className="text-sm text-ink-500 mt-2">Please rescan the QR code to place an order.</p>
          <Link to="/" className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline underline-offset-2">
            Go back
          </Link>
        </div>
      </CheckoutShell>
    );
  }

  if (count === 0) {
    return (
      <CheckoutShell>
        <div className="text-center bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <div className="w-14 h-14 rounded-2xl bg-surface-50 border border-surface-200 flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <ShoppingBag className="w-7 h-7 text-ink-400" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900">Your cart is empty</h1>
          <p className="text-sm text-ink-500 mt-2">Add some items before checkout.</p>
          <Link
            to={`/menu/${restaurant.id}/${table.id}?token=${qrToken}`}
            className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline underline-offset-2"
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
    // Stale-state guard: re-read table from Firestore so a disable that happened
    // after the menu was opened is not bypassed by cached state.
    try {
      const freshTable = await getTable(restaurant.id, table.id);
      if (!freshTable || freshTable.isActive !== true) {
        toast.error("This table is no longer available.");
        setPlacing(false);
        return;
      }
      if ((freshTable as unknown as { isAccessAvailable?: boolean }).isAccessAvailable === false) {
        toast.error("This table is currently unavailable. Please contact staff.");
        setPlacing(false);
        return;
      }
      if (freshTable.qrToken !== qrToken) {
        toast.error("Your table session has expired. Please rescan the QR code.");
        setPlacing(false);
        return;
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error("[checkout] table re-validation failed", e);
      toast.error("Unable to verify table. Please rescan the QR code.");
      setPlacing(false);
      return;
    }
    if (import.meta.env.DEV) console.log("[ORDER] create started", {
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
      if (import.meta.env.DEV) console.log("[ORDER] create success", { orderId, hasTrackingToken: !!trackingToken });
      clear();
      navigate(`/order/${orderId}?token=${trackingToken}`);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (import.meta.env.DEV) console.error("[ORDER] create failed", {
        code: err?.code ?? "unknown",
        message: err?.message ?? String(e),
        restaurantId: restaurant.id,
        tableId: table.id,
        hasQrToken: !!qrToken,
      });
      const code = (err?.code || "").toLowerCase();
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("table_occupied") || msg.includes("currently occupied")) {
        toast.error(
          `Table ${table.tableNumber} is currently occupied. Please wait until the current order is completed and payment is confirmed.`
        );
      } else if (code.includes("permission") || code.includes("denied") || code === "firestore/permission-denied") {
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
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="pressable w-10 h-10 rounded-xl bg-white border border-surface-200 hover:border-surface-300 flex items-center justify-center text-ink-500 hover:text-ink-900 shadow-card"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900 leading-none">Checkout</h1>
          <p className="text-[13px] text-ink-500 mt-1">{count} item{count > 1 ? "s" : ""} • Table {table.tableNumber}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-4 sm:p-5 mb-3.5">
        <div className="font-bold tracking-tight text-[15px] text-ink-900">{restaurant.name}</div>
        <div className="text-[13px] text-ink-500 mt-0.5">Table {table.tableNumber} • Dine-in</div>
      </div>

      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-4 sm:p-5 mb-3.5">
        <h2 className="font-bold tracking-tight text-[15px] text-ink-900 mb-3">Order items</h2>
        <div className="space-y-2.5">
          {lines.map((line) => (
            <div key={line.menuItemId} className="flex justify-between items-baseline gap-3 text-sm">
              <span className="text-ink-700 min-w-0">
                <span className="font-medium">{line.name}</span> <span className="text-ink-400 tabular-nums">× {line.quantity}</span>
              </span>
              <span className="font-semibold text-ink-900 tabular-nums shrink-0">
                {formatCurrency(line.price * line.quantity)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-4 sm:p-5 mb-3.5">
        <TextArea
          label="Special instructions"
          placeholder="e.g. Less spicy, no onions..."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
        />
      </div>

      {(() => {
        const bill = calculateBill(total, restaurant.gstPercent ?? 0, restaurant.serviceChargePercent ?? 0);
        return (
          <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-4 sm:p-5 mb-4 space-y-1.5">
            <div className="flex justify-between text-sm text-ink-500">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(bill.subtotal)}</span>
            </div>
            {bill.gstAmount > 0 && (
              <div className="flex justify-between text-sm text-ink-500">
                <span>GST {bill.gstPercent}%</span>
                <span className="tabular-nums">{formatCurrency(bill.gstAmount)}</span>
              </div>
            )}
            {bill.serviceChargeAmount > 0 && (
              <div className="flex justify-between text-sm text-ink-500">
                <span>Service charge {bill.serviceChargePercent}%</span>
                <span className="tabular-nums">{formatCurrency(bill.serviceChargeAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[15px] font-bold text-ink-900 border-t border-surface-100 pt-2.5 mt-2">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(bill.grandTotal)}</span>
            </div>
          </div>
        );
      })()}

      <div className="sm:static sticky bottom-4">
        <Button onClick={placeOrder} loading={placing} size="lg" className="w-full text-[15px]">
          {placing ? "Placing order..." : "Place order"}
        </Button>
      </div>
    </CheckoutShell>
  );
}

function CheckoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-surface-50 pb-10">
      <div className="max-w-lg mx-auto px-4 py-5 sm:py-6">{children}</div>
    </div>
  );
}
