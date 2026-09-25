import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { subscribeToOrders, getOrderItems } from "../../services/orderService";
import { formatCurrency, formatDate, formatDateOnly } from "../../utils/formatting";
import { escapeHtml, sanitizeUrl } from "../../utils/sanitize";
import { computeAnalytics, computeMostOrderedDishes, computePeakHours, getDateRangeBounds } from "../../hooks/useAnalytics";
import type { Order, OrderItem } from "../../types/order";
import { Button } from "../../components/common/Button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useRestaurant } from "../../hooks/useRestaurant";

async function batchedGetOrderItems(
  restaurantId: string,
  orders: Order[],
  concurrency = 10
): Promise<Map<string, OrderItem[]>> {
  const map = new Map<string, OrderItem[]>();
  for (let i = 0; i < orders.length; i += concurrency) {
    const chunk = orders.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map((o) => getOrderItems(restaurantId, o.id).then((its) => ({ id: o.id, items: its })))
    );
    results.forEach(({ id, items }) => map.set(id, items));
  }
  return map;
}

type ReportPeriod = "daily" | "weekly" | "monthly" | "custom";

function getPeriodBounds(period: ReportPeriod, fromDate?: string, toDate?: string) {
  if (period === "custom" && fromDate && toDate) {
    return getDateRangeBounds("custom", new Date(fromDate), new Date(toDate));
  }
  const now = new Date();
  if (period === "daily") return getDateRangeBounds("today");
  if (period === "weekly") return getDateRangeBounds("thisWeek");
  return getDateRangeBounds("thisMonth");
}

export default function OwnerReports() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const { restaurant } = useRestaurant(restaurantId);
  const shopName = restaurant?.name || "SMART DINE RESTAURANT";
  const [orders, setOrders] = useState<Order[]>([]);
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customApplied, setCustomApplied] = useState<{ from: string; to: string } | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    const unsub = subscribeToOrders(restaurantId, (list) => {
      setOrders(list);
      setLoading(false);
    });
    return () => unsub();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId || orders.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const map = await batchedGetOrderItems(restaurantId, orders, 10);
      if (!cancelled) setItems(Array.from(map.values()).flat());
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, orders]);

  const filtered = useMemo(() => {
    const { start, end } =
      period === "custom" && customApplied
        ? getPeriodBounds("custom", customApplied.from, customApplied.to)
        : getPeriodBounds(period);
    return orders.filter((o) => {
      const t = o.createdAt ?? 0;
      return t >= start && t <= end;
    });
  }, [orders, period, customApplied]);

  const [periodItems, setPeriodItems] = useState<OrderItem[]>([]);
  useEffect(() => {
    if (!restaurantId || filtered.length === 0) {
      setPeriodItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const map = await batchedGetOrderItems(restaurantId, filtered, 10);
      if (!cancelled) setPeriodItems(Array.from(map.values()).flat());
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, filtered]);

  const analytics = useMemo(() => computeAnalytics(filtered), [filtered]);
  const dishStats = useMemo(() => computeMostOrderedDishes(periodItems), [periodItems]);
  const peak = useMemo(() => computePeakHours(filtered), [filtered]);

  async function downloadCSV() {
    // Ensure we have per-order items for detailed rows (batched to avoid N+1 thundering herd)
    const orderItemsMap =
      filtered.length > 0 ? await batchedGetOrderItems(restaurantId, filtered, 10) : new Map<string, OrderItem[]>();
    const fromLabel = period === "custom" && customApplied ? new Date(customApplied.from).toLocaleDateString("en-IN") : "";
    const toLabel = period === "custom" && customApplied ? new Date(customApplied.to).toLocaleDateString("en-IN") : "";
    const periodLabel = period === "custom" && customApplied ? `${fromLabel} – ${toLabel}` : period;
    // Sales by table
    const salesByTable = new Map<number, { orders: number; sales: number }>();
    filtered.forEach((o) => {
      const cur = salesByTable.get(o.tableNumber) || { orders: 0, sales: 0 };
      cur.orders += 1;
      cur.sales += o.grandTotal ?? o.totalAmount;
      salesByTable.set(o.tableNumber, cur);
    });
    const rows: string[][] = [
      ["Shop Name", shopName],
      ["Report Type", period],
      ["Report Period", periodLabel],
      ...(period === "custom" && customApplied ? [["From Date", fromLabel], ["To Date", toLabel]] : []),
      ["Generated", new Date().toLocaleString()],
      [],
      ["Order ID", "Table Number", "Order Date/Time", "Order Status", "Items", "Subtotal", "GST", "Service Charge", "Grand Total"],
      ...filtered.map((o) => {
        const its = orderItemsMap.get(o.id) || [];
        const itemsStr = its.map((it) => `${it.itemName} x${it.quantity}`).join("; ") || "-";
        const subtotal = o.totalAmount;
        const gst = o.gstAmount ?? 0;
        const sc = o.serviceChargeAmount ?? 0;
        const grand = o.grandTotal ?? o.totalAmount;
        return [
          o.id,
          String(o.tableNumber),
          formatDate(o.createdAt),
          o.status,
          itemsStr,
          String(subtotal),
          String(gst),
          String(sc),
          String(grand),
        ];
      }),
      [],
      ["Summary"],
      ["Total Orders", String(analytics.totalOrders)],
      ["Total Sales", String(analytics.totalSales)],
      ["Average Order Value", String(analytics.avgOrderValue)],
      ["Items Sold", String(periodItems.reduce((a, b) => a + b.quantity, 0))],
      ["Cancelled Orders", String(analytics.cancelledOrders)],
      ["GST Collected", String(analytics.totalGst)],
      ["Service Charge Collected", String(analytics.totalServiceCharge)],
      [],
      ["Top Dishes"],
      ["Rank", "Dish", "Qty Sold", "Revenue"],
      ...dishStats.map((d, i) => [String(i + 1), d.itemName, String(d.quantity), String(d.revenue)]),
      [],
      ["Peak Hours"],
      ["Hour", "Orders"],
      ...peak.filter((p) => p.count > 0).map((p) => [p.label, String(p.count)]),
      [],
      ["Sales by Table"],
      ["Table", "Orders", "Sales"],
      ...Array.from(salesByTable.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([table, v]) => [String(table), String(v.orders), String(v.sales)]),
    ];
    const csvRaw = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const csv = "\uFEFF" + csvRaw;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smart-dine-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }

  async function downloadPDF() {
    const orderItemsMap =
      filtered.length > 0 ? await batchedGetOrderItems(restaurantId, filtered, 10) : new Map<string, OrderItem[]>();
    const fromLabel = period === "custom" && customApplied ? new Date(customApplied.from).toLocaleDateString("en-IN") : "";
    const toLabel = period === "custom" && customApplied ? new Date(customApplied.to).toLocaleDateString("en-IN") : "";
    const periodLabel = period === "custom" && customApplied ? `${fromLabel} – ${toLabel}` : period === "daily" ? new Date().toLocaleDateString("en-IN") : period;
    const salesByTable = new Map<number, { orders: number; sales: number }>();
    filtered.forEach((o) => {
      const cur = salesByTable.get(o.tableNumber) || { orders: 0, sales: 0 };
      cur.orders += 1;
      cur.sales += o.grandTotal ?? o.totalAmount;
      salesByTable.set(o.tableNumber, cur);
    });
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) {
      toast.error("Please allow popups to download PDF");
      return;
    }
    const safeLogo = sanitizeUrl(restaurant?.logoUrl || "");
    const logoHtml = safeLogo ? `<img src="${escapeHtml(safeLogo)}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px"/>` : "";
    const safeShop = escapeHtml(shopName.toUpperCase());
    const safePeriod = escapeHtml(period);
    const safePeriodLabel = escapeHtml(periodLabel);
    const html = `
      <html><head><title>Report ${safePeriod}</title>
      <style>body{font-family:Inter,sans-serif;padding:24px;color:#111;max-width:800px;margin:0 auto}h1{font-size:22px;margin:0}h2{font-size:14px;color:#6b7280;margin:4px 0 12px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:8px;border:1px solid #e5e7eb;text-align:left;font-size:11px}th{background:#f9fafb}.muted{color:#6b7280;font-size:12px}.shop{font-size:24px;font-weight:800;letter-spacing:0.5px}.header{border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:12px;display:flex;align-items:center;gap:12px}</style>
      </head><body>
        <div class="header">${logoHtml}<div><div class="shop">${safeShop}</div><div style="font-size:14px;font-weight:600;color:#374151">Sales Report</div><div class="muted">Report Period: ${safePeriodLabel}</div><div class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</div></div></div>
        <table><tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Total Orders</td><td>${escapeHtml(String(analytics.totalOrders))}</td></tr>
        <tr><td>Total Sales</td><td>${escapeHtml(formatCurrency(analytics.totalSales))}</td></tr>
        <tr><td>Average Order Value</td><td>${escapeHtml(formatCurrency(analytics.avgOrderValue))}</td></tr>
        <tr><td>Items Sold</td><td>${escapeHtml(String(periodItems.reduce((a, b) => a + b.quantity, 0)))}</td></tr>
        <tr><td>Cancelled Orders</td><td>${escapeHtml(String(analytics.cancelledOrders))}</td></tr>
        <tr><td>GST Collected</td><td>${escapeHtml(formatCurrency(analytics.totalGst))}</td></tr>
        <tr><td>Service Charge Collected</td><td>${escapeHtml(formatCurrency(analytics.totalServiceCharge))}</td></tr>
        </table>
        <h3>Orders Detail</h3>
        <table><tr><th>Order ID</th><th>Table</th><th>Date/Time</th><th>Status</th><th>Items</th><th>Subtotal</th><th>GST</th><th>Service</th><th>Grand Total</th></tr>
        ${filtered
          .map((o) => {
            const its = orderItemsMap.get(o.id) || [];
            const itemsStr = its.map((it) => `${escapeHtml(it.itemName)} x${it.quantity}`).join(", ") || "-";
            return `<tr><td>#${escapeHtml(o.id.slice(-4).toUpperCase())}</td><td>${escapeHtml(String(o.tableNumber))}</td><td>${escapeHtml(formatDate(o.createdAt))}</td><td>${escapeHtml(o.status)}</td><td>${itemsStr}</td><td>${escapeHtml(formatCurrency(o.totalAmount))}</td><td>${escapeHtml(formatCurrency(o.gstAmount ?? 0))}</td><td>${escapeHtml(formatCurrency(o.serviceChargeAmount ?? 0))}</td><td>${escapeHtml(formatCurrency(o.grandTotal ?? o.totalAmount))}</td></tr>`;
          })
          .join("")}
        </table>
        <h3>Most Ordered Dishes</h3>
        <table><tr><th>#</th><th>Dish</th><th>Qty</th><th>Revenue</th></tr>
        ${dishStats.map((d, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(d.itemName)}</td><td>${escapeHtml(String(d.quantity))}</td><td>${escapeHtml(formatCurrency(d.revenue))}</td></tr>`).join("")}
        </table>
        <h3>Peak Hours</h3>
        <table><tr><th>Hour</th><th>Orders</th></tr>
        ${peak.filter((p) => p.count > 0).map((p) => `<tr><td>${escapeHtml(p.label)}</td><td>${escapeHtml(String(p.count))}</td></tr>`).join("")}
        </table>
        <h3>Sales by Table</h3>
        <table><tr><th>Table</th><th>Orders</th><th>Sales</th></tr>
        ${Array.from(salesByTable.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([t, v]) => `<tr><td>${escapeHtml(String(t))}</td><td>${escapeHtml(String(v.orders))}</td><td>${escapeHtml(formatCurrency(v.sales))}</td></tr>`)
          .join("")}
        </table>
        <p class="muted" style="text-align:center;margin-top:24px">Thank you for using Smart Dine</p>
        <script>window.onload=function(){window.print()}</script>
      </body></html>
    `;
    win.document.write(html);
    win.document.close();
  }

  if (loading) return <div className="text-center text-gray-500 py-16">Loading reports...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{shopName.toUpperCase()}</h1>
          <p className="text-sm font-medium text-brand-600">Sales Report</p>
          <p className="text-xs text-gray-500">
            {period === "custom" && customApplied
              ? `Report Period: ${new Date(customApplied.from).toLocaleDateString("en-IN")} – ${new Date(customApplied.to).toLocaleDateString("en-IN")}`
              : period === "daily"
              ? `Report Period: ${new Date().toLocaleDateString("en-IN")}`
              : `Period: ${period}`}
            {' • '}Real sales data from Firestore
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={downloadCSV}><Download className="w-4 h-4" /> CSV</Button>
          <Button variant="secondary" onClick={downloadPDF}><Download className="w-4 h-4" /> PDF</Button>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {(["daily", "weekly", "monthly", "custom"] as ReportPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                if (p !== "custom") setCustomApplied(null);
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium border ${period === p ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200"}`}
            >
              {p === "daily" ? "Daily" : p === "weekly" ? "Weekly" : p === "monthly" ? "Monthly" : "Custom Date"}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <Button
              onClick={() => {
                if (!fromDate || !toDate) {
                  toast.error("Please select both From and To dates");
                  return;
                }
                if (new Date(fromDate) > new Date(toDate)) {
                  toast.error("From Date must be before To Date");
                  return;
                }
                setCustomApplied({ from: fromDate, to: toDate });
                toast.success("Custom report generated");
              }}
            >
              Apply / Generate Report
            </Button>
            {customApplied && (
              <span className="text-xs text-gray-500">Showing {customApplied.from} – {customApplied.to}</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4"><div className="text-xs text-gray-500">Total Sales</div><div className="text-lg font-bold">{formatCurrency(analytics.totalSales)}</div></div>
        <div className="bg-white rounded-xl shadow-sm p-4"><div className="text-xs text-gray-500">Orders</div><div className="text-lg font-bold">{analytics.totalOrders}</div></div>
        <div className="bg-white rounded-xl shadow-sm p-4"><div className="text-xs text-gray-500">Avg Order</div><div className="text-lg font-bold">{formatCurrency(analytics.avgOrderValue)}</div></div>
        <div className="bg-white rounded-xl shadow-sm p-4"><div className="text-xs text-gray-500">Items Sold</div><div className="text-lg font-bold">{periodItems.reduce((a, b) => a + b.quantity, 0)}</div></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        <h3 className="font-semibold text-gray-800 mb-3">Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><div className="text-gray-500">Completed</div><div className="font-bold text-green-600">{analytics.completedOrders}</div></div>
          <div><div className="text-gray-500">Pending</div><div className="font-bold text-amber-600">{analytics.pendingOrders}</div></div>
          <div><div className="text-gray-500">Cancelled</div><div className="font-bold text-red-600">{analytics.cancelledOrders}</div></div>
          <div><div className="text-gray-500">GST Collected</div><div className="font-bold">{formatCurrency(analytics.totalGst)}</div></div>
          <div><div className="text-gray-500">Service Charge</div><div className="font-bold">{formatCurrency(analytics.totalServiceCharge)}</div></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Most Ordered Dishes</h3>
          {dishStats.length === 0 ? <p className="text-sm text-gray-400">No data</p> : (
            <div className="space-y-2">
              {dishStats.map((d, i) => (
                <div key={d.menuItemId} className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <span className="flex-1 truncate">{d.itemName}</span>
                  <span className="text-gray-500">{d.quantity} sold</span>
                  <span className="font-semibold">{formatCurrency(d.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Peak Hours</h3>
          <div className="space-y-1.5">
            {peak.filter((p) => p.count > 0).length === 0 ? <p className="text-sm text-gray-400">No orders</p> : (
              peak.filter((p) => p.count > 0).map((p) => (
                <div key={p.hour} className="flex items-center gap-2">
                  <span className="w-16 text-xs text-gray-500">{p.label}</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${(p.count / Math.max(1, ...peak.map((x) => x.count))) * 100}%` }} /></div>
                  <span className="w-8 text-xs text-right">{p.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
