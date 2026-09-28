import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, collection, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useRestaurant } from "../../hooks/useRestaurant";
import { formatCurrency, formatDate, formatTime } from "../../utils/formatting";
import { escapeHtml } from "../../utils/sanitize";
import { calculateBill } from "../../utils/billing";
import { PageLoader } from "../../components/common/Spinner";
import { Button } from "../../components/common/Button";
import { ReadAloudButton } from "../../components/customer/ReadAloudButton";
import { useAdaptivePrefs } from "../../context/AdaptivePrefsContext";
import { useAutoSpeak } from "../../hooks/useAutoSpeak";
import { Download, Share2, Split, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { Order, OrderItem } from "../../types/order";
import type { Restaurant } from "../../types/restaurant";

function BillSplit({ order, items, restaurant }: { order: Order; items: OrderItem[]; restaurant: Restaurant | null }) {
  // Historical bill must stay on order snapshot even if restaurant settings changed later.
  // Prefer order's stored percentages when present.
  const gst = order.gstPercent ?? restaurant?.gstPercent ?? 0;
  const sc = order.serviceChargePercent ?? restaurant?.serviceChargePercent ?? 0;
  const bill = calculateBill(order.totalAmount, gst, sc);
  const [people, setPeople] = useState(2);
  const [mode, setMode] = useState<"equal" | "items">("equal");
  const [selected, setSelected] = useState<boolean[]>(() => items.map(() => false));

  const equalShare = (() => {
    const n = Math.max(1, people);
    return {
      subtotal: Math.round((bill.subtotal / n) * 100) / 100,
      gst: Math.round((bill.gstAmount / n) * 100) / 100,
      sc: Math.round((bill.serviceChargeAmount / n) * 100) / 100,
      total: Math.round((bill.grandTotal / n) * 100) / 100,
    };
  })();

  const itemSplit = (() => {
    let subA = 0;
    let subB = 0;
    items.forEach((it, idx) => {
      const amt = it.price * it.quantity;
      if (selected[idx]) subA += amt;
      else subB += amt;
    });
    const a = calculateBill(subA, gst, sc);
    const b = calculateBill(subB, gst, sc);
    return { a, b, check: subA + subB };
  })();

  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-4 sm:p-5 mt-4">
      <h3 className="font-bold tracking-tight text-[15px] text-ink-900 mb-3 flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-surface-50 border border-surface-200 flex items-center justify-center shrink-0" aria-hidden="true">
          <Split className="w-4 h-4 text-ink-500" />
        </span>
        Split bill
      </h3>
      <div className="flex gap-2 mb-3" role="group" aria-label="Split mode">
        <button onClick={() => setMode("equal")} aria-pressed={mode === "equal"} className={`pressable flex-1 py-2.5 min-h-[42px] rounded-xl text-[13px] font-semibold border ${mode === "equal" ? "bg-ink-900 border-ink-900 text-white" : "bg-white border-surface-200 text-ink-500 hover:border-surface-300"}`}>
          Split equally
        </button>
        <button onClick={() => setMode("items")} aria-pressed={mode === "items"} className={`pressable flex-1 py-2.5 min-h-[42px] rounded-xl text-[13px] font-semibold border ${mode === "items" ? "bg-ink-900 border-ink-900 text-white" : "bg-white border-surface-200 text-ink-500 hover:border-surface-300"}`}>
          Split by items
        </button>
      </div>

      {mode === "equal" ? (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <label htmlFor="split-people" className="text-[13px] font-semibold text-ink-700">People</label>
            <input id="split-people" type="number" min={2} max={12} value={people} onChange={(e) => setPeople(Math.min(12, Math.max(2, Number(e.target.value) || 2)))} className="w-20 px-3 py-2 min-h-[40px] border border-surface-200 rounded-xl text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto thin-scroll pr-0.5">
            {Array.from({ length: people }).map((_, i) => (
              <div key={i} className="bg-surface-50 border border-surface-200 rounded-xl p-3 text-sm">
                <div className="font-semibold text-ink-900">Person {i + 1}</div>
                <div className="text-ink-500 text-[13px] tabular-nums">Pays {formatCurrency(equalShare.total)}</div>
                <div className="font-bold text-ink-900 tabular-nums mt-0.5">{formatCurrency(equalShare.total)}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-400 mt-2 tabular-nums">Total of splits {formatCurrency(equalShare.total * people)} • Bill {formatCurrency(bill.grandTotal)}</p>
        </div>
      ) : (
        <div>
          <p className="text-xs text-ink-500 mb-2">Select items for Group A, rest goes to Group B</p>
          <fieldset className="space-y-2 max-h-64 overflow-y-auto thin-scroll mb-3 pr-0.5">
            <legend className="sr-only">Choose items for Group A</legend>
            {items.map((it, idx) => (
              <label key={it.id} className="flex items-center gap-2.5 p-2.5 border border-surface-200 rounded-xl cursor-pointer hover:border-surface-300 hover:bg-surface-50 has-checked:border-brand-300 has-checked:bg-brand-50/50">
                <input type="checkbox" checked={selected[idx]} onChange={(e) => setSelected((s) => s.map((v, i) => (i === idx ? e.target.checked : v)))} className="w-4 h-4 rounded accent-orange-600" />
                <span className="flex-1 text-sm text-ink-700 min-w-0 truncate">{it.itemName} <span className="text-ink-400 tabular-nums">× {it.quantity}</span></span>
                <span className="text-sm font-semibold tabular-nums">{formatCurrency(it.price * it.quantity)}</span>
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-surface-50 border border-surface-200 rounded-xl p-3">
              <div className="font-semibold text-[13px] text-ink-900">Group A</div>
              <div className="font-bold text-ink-900 tabular-nums mt-0.5">{formatCurrency(itemSplit.a.grandTotal)}</div>
            </div>
            <div className="bg-surface-50 border border-surface-200 rounded-xl p-3">
              <div className="font-semibold text-[13px] text-ink-900">Group B</div>
              <div className="font-bold text-ink-900 tabular-nums mt-0.5">{formatCurrency(itemSplit.b.grandTotal)}</div>
            </div>
          </div>
          <p className="text-xs text-ink-400 mt-2 tabular-nums">Combined {formatCurrency(itemSplit.a.grandTotal + itemSplit.b.grandTotal)} • Bill {formatCurrency(bill.grandTotal)}</p>
        </div>
      )}
    </div>
  );
}

export default function DigitalBill() {
  const { restaurantId = "", orderId = "" } = useParams();
  const navigate = useNavigate();
  const { restaurant } = useRestaurant(restaurantId);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSplit, setShowSplit] = useState(false);
  const { prefs } = useAdaptivePrefs();

  useEffect(() => {
    if (!restaurantId || !orderId) return;
    setLoading(true);
    // Items are fixed at order time: one-time read. The ORDER doc uses a
    // realtime listener so payment status (Mark as Paid) updates live without
    // refresh — a single listener, no duplicates.
    getDocs(collection(db, "restaurants", restaurantId, "orders", orderId, "items"))
      .then((iSnap) => {
        setItems(iSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderItem, "id">) })));
      })
      .catch(() => setItems([]));
    const unsub = onSnapshot(
      doc(db, "restaurants", restaurantId, "orders", orderId),
      (oSnap) => {
        if (oSnap.exists()) {
          const data = oSnap.data() as Omit<Order, "id">;
          setOrder({
            id: oSnap.id,
            ...data,
            paidAt:
              typeof data.paidAt === "number"
                ? data.paidAt
                : (data.paidAt as unknown as { toMillis?: () => number })?.toMillis?.() ??
                  undefined,
          } as Order);
        } else {
          setOrder(null);
        }
        setLoading(false);
      },
      () => {
        setOrder(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [restaurantId, orderId]);

  // Listen mode: announce the bill summary aloud once it loads.
  useAutoSpeak(
    order
      ? `Bill total ${Math.round(order.grandTotal ?? order.totalAmount)} rupees. ${
          order.paymentStatus === "PAID" ? "Bill paid." : "Payment pending."
        }`
      : "",
    prefs.listen && !!order
  );

  if (loading) return <div className="min-h-screen bg-surface-50 flex items-center justify-center"><PageLoader label="Loading bill..." /></div>;
  if (!order) return <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4"><div className="text-center bg-white rounded-2xl border border-surface-200 shadow-card p-8 max-w-sm"><p className="text-sm font-semibold text-ink-900">Order not found</p><p className="text-sm text-ink-500 mt-1">This bill link may be invalid or expired.</p><button onClick={() => navigate(-1)} className="mt-4 text-sm font-semibold text-brand-700 hover:underline underline-offset-2">Go back</button></div></div>;

  const currentOrder = order as Order;
  // Use historical order snapshot for GST/service charge so bill doesn't change if restaurant updates settings later.
  const gstPercent = currentOrder.gstPercent ?? restaurant?.gstPercent ?? 0;
  const scPercent = currentOrder.serviceChargePercent ?? restaurant?.serviceChargePercent ?? 0;
  // Prefer stored grandTotal/gstAmount when available to preserve exact historical values, otherwise recompute.
  const bill = currentOrder.gstAmount != null && currentOrder.serviceChargeAmount != null && currentOrder.grandTotal != null
    ? {
        subtotal: currentOrder.totalAmount,
        gstPercent,
        gstAmount: currentOrder.gstAmount,
        serviceChargePercent: scPercent,
        serviceChargeAmount: currentOrder.serviceChargeAmount,
        grandTotal: currentOrder.grandTotal,
      }
    : calculateBill(currentOrder.totalAmount, gstPercent, scPercent);

  function handleDownload() {
    if (!currentOrder) return;
    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) {
      toast.error("Please allow popups to download bill");
      return;
    }
    const html = `
      <html><head><title>Bill #${escapeHtml(currentOrder.id.slice(-4).toUpperCase())}</title>
      <style>body{font-family:Inter,sans-serif;padding:24px;color:#111;max-width:600px;margin:0 auto}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px;text-align:left;border-bottom:1px solid #eee}th{background:#f9fafb}.total{font-weight:bold;border-top:2px solid #111}.muted{color:#6b7280;font-size:12px}</style>
      </head><body>
        <h1>${escapeHtml(restaurant?.name || "Smart Dine")}</h1>
        <p class="muted">${escapeHtml(restaurant?.address || "")} ${restaurant?.phone ? "• " + escapeHtml(restaurant.phone) : ""}</p>
        <p><strong>Table:</strong> ${escapeHtml(String(currentOrder.tableNumber))} &nbsp; <strong>Order:</strong> #${escapeHtml(currentOrder.id.slice(-4).toUpperCase())}<br/>
        <strong>Date:</strong> ${escapeHtml(formatDate(currentOrder.createdAt))}<br/>
        <strong>Status:</strong> ${escapeHtml(currentOrder.status)}<br/>
        <strong>Payment:</strong> ${escapeHtml(currentOrder.paymentStatus === "PAID" ? "PAID" : "PENDING")}</p>
        <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
        ${items.map((it) => `<tr><td>${escapeHtml(it.itemName)}</td><td>${escapeHtml(String(it.quantity))}</td><td>${escapeHtml(formatCurrency(it.price))}</td><td>${escapeHtml(formatCurrency(it.price * it.quantity))}</td></tr>`).join("")}
        </tbody></table>
        <table>
          <tr><td>Subtotal</td><td style="text-align:right">${escapeHtml(formatCurrency(bill.subtotal))}</td></tr>
          <tr><td>GST ${escapeHtml(String(bill.gstPercent))}%</td><td style="text-align:right">${escapeHtml(formatCurrency(bill.gstAmount))}</td></tr>
          <tr><td>Service Charge ${escapeHtml(String(bill.serviceChargePercent))}%</td><td style="text-align:right">${escapeHtml(formatCurrency(bill.serviceChargeAmount))}</td></tr>
          <tr class="total"><td>TOTAL</td><td style="text-align:right">${escapeHtml(formatCurrency(bill.grandTotal))}</td></tr>
        </table>
        <p class="muted">Generated by Smart Dine • ${escapeHtml(new Date().toLocaleString())}</p>
        <script>window.onload=function(){window.print()}</script>
      </body></html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    toast.success("Bill opened for printing/downloading");
  }

  async function handleShare() {
    if (!currentOrder) return;
    const text = `Smart Dine Bill\n${restaurant?.name || ""}\nTable ${currentOrder.tableNumber} • Order #${currentOrder.id.slice(-4).toUpperCase()}\nDate ${formatDate(currentOrder.createdAt)}\n` +
      items.map((it) => `${it.itemName} x${it.quantity} = ${formatCurrency(it.price * it.quantity)}`).join("\n") +
      `\nSubtotal ${formatCurrency(bill.subtotal)}\nGST ${bill.gstPercent}% ${formatCurrency(bill.gstAmount)}\nService ${bill.serviceChargePercent}% ${formatCurrency(bill.serviceChargeAmount)}\nTOTAL ${formatCurrency(bill.grandTotal)}\nStatus ${currentOrder.status}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Bill #${currentOrder.id.slice(-4)}`, text });
        toast.success("Bill shared");
      } catch {
        // cancelled
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast.success("Bill copied to clipboard");
    } else {
      handleDownload();
    }
  }

  return (
    <main aria-label="Digital bill" className="min-h-screen bg-surface-50 pb-10">
      <div className="max-w-lg mx-auto px-4 py-5 sm:py-6">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="pressable flex items-center gap-1.5 text-[13px] font-semibold text-ink-500 hover:text-ink-900 mb-4 px-1 py-1.5">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
        </button>

        <div id="bill-content" className="bg-white rounded-2xl border border-surface-200 shadow-card p-5 sm:p-6">
          <div className="text-center border-b border-surface-100 pb-4 mb-4">
            {restaurant?.logoUrl ? <img src={restaurant.logoUrl} alt={`${restaurant?.name} logo`} className="w-14 h-14 rounded-2xl object-cover mx-auto mb-2.5 border border-surface-100" /> : <div className="w-14 h-14 rounded-2xl bg-surface-50 border border-surface-200 flex items-center justify-center text-xl font-bold text-ink-500 mx-auto mb-2.5" aria-hidden="true">{restaurant?.name?.charAt(0) || "S"}</div>}
            <h1 className="text-xl font-bold tracking-tight text-ink-900">{restaurant?.name || "Smart Dine"}</h1>
            {restaurant?.address && <p className="text-xs text-ink-500 mt-1">{restaurant.address}</p>}
            {restaurant?.phone && <p className="text-xs text-ink-500 tabular-nums">{restaurant.phone}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div><span className="text-xs font-medium text-ink-400">Table</span><div className="font-bold text-ink-900 mt-0.5">Table {currentOrder.tableNumber}</div></div>
            <div className="text-right"><span className="text-xs font-medium text-ink-400">Order</span><div className="font-mono font-bold text-ink-900 tabular-nums mt-0.5">#{currentOrder.id.slice(-4).toUpperCase()}</div></div>
            <div><span className="text-xs font-medium text-ink-400">Date</span><div className="font-medium text-ink-900 mt-0.5">{formatDate(currentOrder.createdAt)}</div></div>
            <div className="text-right"><span className="text-xs font-medium text-ink-400">Status</span><div className="font-medium text-ink-900 mt-0.5">{currentOrder.status}</div></div>
          </div>

          <div className="border-t border-surface-100 pt-4">
            <h3 className="font-bold tracking-tight text-[15px] text-ink-900 mb-2.5">Items</h3>
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="flex justify-between items-baseline gap-3 text-sm">
                  <span className="text-ink-700 min-w-0">{it.itemName} <span className="text-ink-400 tabular-nums">× {it.quantity}</span> <span className="text-xs text-ink-400 tabular-nums">@{formatCurrency(it.price)}</span></span>
                  <span className="font-semibold text-ink-900 tabular-nums shrink-0">{formatCurrency(it.price * it.quantity)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-surface-100 mt-4 pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-500"><span>Subtotal</span><span className="font-medium text-ink-900 tabular-nums">{formatCurrency(bill.subtotal)}</span></div>
            <div className="flex justify-between text-ink-500"><span>GST {bill.gstPercent}%</span><span className="font-medium text-ink-900 tabular-nums">{formatCurrency(bill.gstAmount)}</span></div>
            <div className="flex justify-between text-ink-500"><span>Service charge {bill.serviceChargePercent}%</span><span className="font-medium text-ink-900 tabular-nums">{formatCurrency(bill.serviceChargeAmount)}</span></div>
            <div className="flex justify-between text-[15px] font-bold text-ink-900 border-t border-surface-200 pt-2.5 mt-2"><span>Total</span><span className="tabular-nums">{formatCurrency(bill.grandTotal)}</span></div>
          </div>

          <div
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-2xl border p-3.5 text-center ${
              currentOrder.paymentStatus === "PAID"
                ? "bg-green-50 border-green-200"
                : "bg-amber-50 border-amber-200"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500 flex items-center justify-center gap-2">
              Payment status
              {prefs.listen && (
                <ReadAloudButton
                  text={
                    currentOrder.paymentStatus === "PAID"
                      ? `Bill paid. Total ${Math.round(bill.grandTotal)} rupees.`
                      : `Payment pending. Total ${Math.round(bill.grandTotal)} rupees.`
                  }
                  label="bill payment status"
                />
              )}
            </p>
            {currentOrder.paymentStatus === "PAID" ? (
              <>
                <p className="mt-1 text-[15px] font-bold tracking-tight text-green-700">Paid</p>
                {currentOrder.paidAt != null && (
                  <p className="mt-0.5 text-xs text-green-700 tabular-nums">
                    Paid at {formatTime(currentOrder.paidAt)} • {formatDate(currentOrder.paidAt)}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-[15px] font-bold tracking-tight text-amber-700">Payment pending</p>
            )}
          </div>

          <p className="text-xs text-ink-400 text-center mt-4">Thank you for dining with us.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
          <Button onClick={handleDownload} variant="secondary" className="flex-1"><Download className="w-4 h-4" aria-hidden="true" /> Download</Button>
          <Button onClick={handleShare} className="flex-1"><Share2 className="w-4 h-4" aria-hidden="true" /> Share</Button>
        </div>

        <Button onClick={() => setShowSplit(!showSplit)} aria-expanded={showSplit} variant="secondary" className="w-full mt-2.5">
          <Split className="w-4 h-4" aria-hidden="true" /> {showSplit ? "Hide split" : "Split bill"}
        </Button>
        {showSplit && <BillSplit order={currentOrder} items={items} restaurant={restaurant ?? null} />}

        <div className="mt-4 text-center">
          <button onClick={() => navigate(`/order/${currentOrder.id}?token=${currentOrder.trackingToken}`)} className="text-[13px] font-semibold text-brand-700 hover:underline underline-offset-2 px-2 py-1.5">View order tracking</button>
        </div>
      </div>
    </main>
  );
}
