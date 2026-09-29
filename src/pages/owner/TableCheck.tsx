import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Printer, Copy, QrCode, RefreshCw, Users } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useRestaurant } from "../../hooks/useRestaurant";
import { useTableCheck } from "../../hooks/useTableCheck";
import { tableCheckUrl, generateTableCheckQRDataUrl, downloadTableCheckQR } from "../../utils/qr";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/States";
import { formatCurrency, formatTime } from "../../utils/formatting";
import { formatWaitLabel } from "../../services/tableWaitTimeService";

function formatCountdown(ms: number | null): string {
  if (ms == null) return "";
  const mins = Math.max(0, Math.ceil(ms / 60000));
  return `~${mins} min`;
}

export default function OwnerTableCheck() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const { restaurant } = useRestaurant(restaurantId);
  const { models, counts, loading, refresh } = useTableCheck(restaurantId);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const url = restaurantId ? tableCheckUrl(restaurantId) : "";

  useEffect(() => {
    if (!restaurantId) return;
    setQrLoading(true);
    generateTableCheckQRDataUrl(restaurantId)
      .then(setQrDataUrl)
      .catch(() => toast.error("Failed to generate QR"))
      .finally(() => setQrLoading(false));
  }, [restaurantId]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Customer link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  function printQR() {
    if (!qrDataUrl || !restaurant) return;
    const win = window.open("", "_blank", "width=400,height=640");
    if (!win) return;
    win.document.write(`
      <html><head><title>Print Table Check QR</title><style>
        body{font-family:sans-serif;text-align:center;padding:40px;color:#111}
        .brand{font-size:26px;font-weight:bold;letter-spacing:2px}
        .name{font-size:18px;margin-top:6px}
        .table{font-size:22px;font-weight:bold;margin:18px 0}
        img{width:260px;height:260px}
        .foot{margin-top:16px;font-size:14px}
      </style></head><body>
        <div class="brand">SMART DINE</div>
        <div class="name">${restaurant.name}</div>
        <div class="table">SCAN TO CHECK TABLES</div>
        <img src="${qrDataUrl}" />
        <div class="foot">Scan to check available tables &amp; start ordering</div>
        <script>window.onload=function(){window.print()}</script>
      </body></html>
    `);
    win.document.close();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Table Check</h1>
          <p className="text-gray-500 text-sm">
            Restaurant: <span className="font-semibold text-gray-700">{restaurant?.name ?? "…"}</span>
          </p>
        </div>
        <Button variant="secondary" onClick={refresh} aria-label="Refresh table status">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6" role="status" aria-label="Table status summary">
        {[
          { label: "Available", value: counts.available, tone: "bg-green-50 text-green-700 border-green-200" },
          { label: "Occupied", value: counts.occupied, tone: "bg-red-50 text-red-700 border-red-200" },
          { label: "Payment Pending", value: counts.paymentPending, tone: "bg-amber-50 text-amber-700 border-amber-200" },
          { label: "Reserved", value: counts.reserved, tone: "bg-blue-50 text-blue-700 border-blue-200" },
          { label: "Total", value: counts.total, tone: "bg-white text-gray-700 border-gray-200" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border px-4 py-3 text-center ${s.tone}`}>
            <div className="text-2xl font-bold tabular-nums">{s.value}</div>
            <div className="text-xs font-semibold mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <section aria-labelledby="tc-qr-title" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 id="tc-qr-title" className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <QrCode className="w-5 h-5" aria-hidden="true" /> Customer Table Check QR
        </h2>
        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
          Place this QR near the restaurant entrance/reception. Customers can scan it to check
          available tables and select a table before opening the menu.
        </p>
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-5">
          <div className="shrink-0">
            {qrLoading ? (
              <div className="w-56 h-56 flex items-center justify-center text-gray-400 text-sm">Generating QR…</div>
            ) : (
              qrDataUrl && <img src={qrDataUrl} alt={`Table check QR for ${restaurant?.name ?? "restaurant"}`} className="w-56 h-56" />
            )}
          </div>
          <div className="min-w-0 flex-1 w-full">
            <p className="text-xs text-gray-400 break-all bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">{url}</p>
            <div className="flex flex-wrap gap-2.5 mt-3">
              <Button
                variant="secondary"
                onClick={() => restaurant && downloadTableCheckQR(restaurantId, restaurant.name)}
                aria-label="Download table check QR"
              >
                <Download className="w-4 h-4" /> Download
              </Button>
              <Button variant="secondary" onClick={printQR} aria-label="Print table check QR">
                <Printer className="w-4 h-4" /> Print
              </Button>
              <Button variant="secondary" onClick={copyLink} aria-label="Copy customer table check link">
                <Copy className="w-4 h-4" /> Copy Link
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="tc-live-title">
        <h2 id="tc-live-title" className="text-lg font-bold text-gray-800 mb-3">Live Tables</h2>
        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading tables…</div>
        ) : models.length === 0 ? (
          <EmptyState title="No tables yet" description="Add tables from the Tables page to enable Table Check." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((m) => (
              <div key={m.table.id} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold text-gray-800">Table {m.table.tableNumber}</h3>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      m.status === "AVAILABLE"
                        ? "bg-green-100 text-green-700"
                        : m.status === "OCCUPIED"
                          ? "bg-red-100 text-red-700"
                          : m.status === "PAYMENT_PENDING"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {m.status === "AVAILABLE" ? "Available" : m.status === "OCCUPIED" ? "Occupied" : m.status === "PAYMENT_PENDING" ? "Payment pending" : "Reserved"}
                  </span>
                </div>
                <p className="text-sm text-gray-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" aria-hidden="true" /> Capacity: {m.table.capacity}
                </p>
                {m.order && (
                  <p className="text-xs text-gray-500 mt-1.5 tabular-nums">
                    Order #{m.order.id.slice(-4).toUpperCase()} • {m.order.status}
                    {m.order.paymentStatus === "PAID" ? " • Paid" : m.order.status === "SERVED" ? " • Payment pending" : ""} •{" "}
                    {formatCurrency(m.order.grandTotal ?? m.order.totalAmount)} • {formatTime(m.order.createdAt)}
                  </p>
                )}
                {m.wait && (m.status === "OCCUPIED" || m.status === "PAYMENT_PENDING") && (
                  <p className="text-xs text-gray-600 mt-1.5">
                    Estimated remaining: {m.wait.label === "approx" && m.wait.remainingMinutes != null
                      ? `~${m.wait.remainingMinutes} min`
                      : formatWaitLabel(m.wait, "en")}
                    <span className="text-gray-400"> ({m.wait.confidence.toLowerCase()} confidence)</span>
                  </p>
                )}
                {m.status === "RESERVED" && (
                  <p className="text-xs text-blue-700 mt-1.5 font-medium">
                    {m.ownReservation ? "Reserved by this session" : "Reserved — selection in progress"}
                    {m.reservationExpiresInMs != null ? ` • expires in ${formatCountdown(m.reservationExpiresInMs)}` : ""}
                  </p>
                )}
                {m.status === "AVAILABLE" && (
                  <p className="text-xs text-green-700 mt-1.5">Ready for walk-in selection</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
