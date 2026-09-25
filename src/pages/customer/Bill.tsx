import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useRestaurant } from "../../hooks/useRestaurant";
import { formatCurrency, formatDate } from "../../utils/formatting";
import { escapeHtml } from "../../utils/sanitize";
import { calculateBill } from "../../utils/billing";
import { PageLoader } from "../../components/common/Spinner";
import { Button } from "../../components/common/Button";
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
    <div className="bg-white rounded-xl shadow-sm p-4 mt-4">
      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <Split className="w-4 h-4" /> Split Bill
      </h3>
      <div className="flex gap-2 mb-3">
        <button onClick={() => setMode("equal")} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${mode === "equal" ? "bg-brand-50 border-brand-300 text-brand-700" : "bg-white border-gray-200"}`}>
          Split Equally
        </button>
        <button onClick={() => setMode("items")} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${mode === "items" ? "bg-brand-50 border-brand-300 text-brand-700" : "bg-white border-gray-200"}`}>
          Split by Items
        </button>
      </div>

      {mode === "equal" ? (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm text-gray-600">People</label>
            <input type="number" min={2} max={20} value={people} onChange={(e) => setPeople(Math.max(2, Number(e.target.value) || 2))} className="w-20 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: people }).map((_, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="font-medium text-gray-700">Person {i + 1}</div>
                <div className="text-gray-600">Subtotal {formatCurrency(equalShare.subtotal)}</div>
                <div className="text-gray-600">GST {formatCurrency(equalShare.gst)}</div>
                <div className="text-gray-600">Service {formatCurrency(equalShare.sc)}</div>
                <div className="font-bold text-gray-900">Pay {formatCurrency(equalShare.total)}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Total split checks: {formatCurrency(equalShare.total * people)} vs Bill {formatCurrency(bill.grandTotal)} (rounding may differ by few paise)</p>
        </div>
      ) : (
        <div>
          <p className="text-xs text-gray-500 mb-2">Select items for Customer A, rest goes to Customer B</p>
          <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
            {items.map((it, idx) => (
              <label key={it.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={selected[idx]} onChange={(e) => setSelected((s) => s.map((v, i) => (i === idx ? e.target.checked : v)))} className="rounded" />
                <span className="flex-1 text-sm text-gray-700">{it.itemName} × {it.quantity}</span>
                <span className="text-sm font-medium">{formatCurrency(it.price * it.quantity)}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="font-medium text-sm text-blue-800">Customer A</div>
              <div className="text-xs text-gray-600">Subtotal {formatCurrency(itemSplit.a.subtotal)}</div>
              <div className="text-xs text-gray-600">GST {formatCurrency(itemSplit.a.gstAmount)}</div>
              <div className="text-xs text-gray-600">Service {formatCurrency(itemSplit.a.serviceChargeAmount)}</div>
              <div className="font-bold text-blue-900">{formatCurrency(itemSplit.a.grandTotal)}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="font-medium text-sm text-green-800">Customer B</div>
              <div className="text-xs text-gray-600">Subtotal {formatCurrency(itemSplit.b.subtotal)}</div>
              <div className="text-xs text-gray-600">GST {formatCurrency(itemSplit.b.gstAmount)}</div>
              <div className="text-xs text-gray-600">Service {formatCurrency(itemSplit.b.serviceChargeAmount)}</div>
              <div className="font-bold text-green-900">{formatCurrency(itemSplit.b.grandTotal)}</div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Combined: {formatCurrency(itemSplit.a.grandTotal + itemSplit.b.grandTotal)} / Bill {formatCurrency(bill.grandTotal)}</p>
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

  useEffect(() => {
    if (!restaurantId || !orderId) return;
    setLoading(true);
    Promise.all([
      getDoc(doc(db, "restaurants", restaurantId, "orders", orderId)),
      getDocs(collection(db, "restaurants", restaurantId, "orders", orderId, "items")),
    ])
      .then(([oSnap, iSnap]) => {
        if (oSnap.exists()) setOrder({ id: oSnap.id, ...(oSnap.data() as Omit<Order, "id">) } as Order);
        else setOrder(null);
        setItems(iSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderItem, "id">) })));
      })
      .catch(() => {
        setOrder(null);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [restaurantId, orderId]);

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><PageLoader label="Loading bill..." /></div>;
  if (!order) return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4"><div className="text-center"><p className="text-gray-600">Order not found</p><button onClick={() => navigate(-1)} className="mt-3 text-brand-600">Go back</button></div></div>;

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
        <strong>Status:</strong> ${escapeHtml(currentOrder.status)}</p>
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
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div id="bill-content" className="bg-white rounded-xl shadow-sm p-6">
          <div className="text-center border-b border-gray-100 pb-4 mb-4">
            {restaurant?.logoUrl ? <img src={restaurant.logoUrl} alt={restaurant?.name} className="w-14 h-14 rounded-full object-cover mx-auto mb-2" /> : <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center text-xl font-bold text-brand-600 mx-auto mb-2">{restaurant?.name?.charAt(0) || "S"}</div>}
            <h1 className="text-xl font-bold text-gray-800">{restaurant?.name || "Smart Dine"}</h1>
            {restaurant?.address && <p className="text-xs text-gray-500 mt-1">{restaurant.address}</p>}
            {restaurant?.phone && <p className="text-xs text-gray-500">{restaurant.phone}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div><span className="text-gray-500">Table</span><div className="font-semibold text-gray-800">Table {currentOrder.tableNumber}</div></div>
            <div className="text-right"><span className="text-gray-500">Order</span><div className="font-mono font-bold text-gray-800">#{currentOrder.id.slice(-4).toUpperCase()}</div></div>
            <div><span className="text-gray-500">Date</span><div className="font-medium text-gray-800">{formatDate(currentOrder.createdAt)}</div></div>
            <div className="text-right"><span className="text-gray-500">Status</span><div className="font-medium text-gray-800">{currentOrder.status}</div></div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="font-semibold text-gray-800 mb-2">Items</h3>
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="flex justify-between text-sm">
                  <span className="text-gray-700">{it.itemName} <span className="text-gray-400">× {it.quantity}</span> <span className="text-xs text-gray-400">@{formatCurrency(it.price)}</span></span>
                  <span className="font-medium text-gray-800">{formatCurrency(it.price * it.quantity)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 mt-4 pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span className="font-medium text-gray-800">{formatCurrency(bill.subtotal)}</span></div>
            <div className="flex justify-between text-gray-600"><span>GST {bill.gstPercent}%</span><span className="font-medium text-gray-800">{formatCurrency(bill.gstAmount)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Service Charge {bill.serviceChargePercent}%</span><span className="font-medium text-gray-800">{formatCurrency(bill.serviceChargeAmount)}</span></div>
            <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-2 mt-2"><span>TOTAL</span><span>{formatCurrency(bill.grandTotal)}</span></div>
          </div>

          <p className="text-xs text-gray-400 text-center mt-4">Thank you for dining with us!</p>
        </div>

        <div className="flex gap-3 mt-4">
          <Button onClick={handleDownload} variant="secondary" className="flex-1"><Download className="w-4 h-4" /> Download Bill</Button>
          <Button onClick={handleShare} className="flex-1"><Share2 className="w-4 h-4" /> Share Bill</Button>
        </div>

        <Button onClick={() => setShowSplit(!showSplit)} variant="secondary" className="w-full mt-3">
          <Split className="w-4 h-4" /> {showSplit ? "Hide Split Bill" : "Split Bill"}
        </Button>
        {showSplit && <BillSplit order={currentOrder} items={items} restaurant={restaurant ?? null} />}

        <div className="mt-4 text-center">
          <button onClick={() => navigate(`/order/${currentOrder.id}?token=${currentOrder.trackingToken}`)} className="text-sm text-brand-600 hover:underline">View Order Tracking</button>
        </div>
      </div>
    </div>
  );
}
