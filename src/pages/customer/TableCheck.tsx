import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Armchair, Clock, RefreshCw, Users, Info, ArrowRight, CheckCircle2, ReceiptText } from "lucide-react";
import { useRestaurant } from "../../hooks/useRestaurant";
import { useTableCheck } from "../../hooks/useTableCheck";
import { useOrderHistory } from "../../hooks/useOrderHistory";
import { getOrCreateSessionId } from "../../utils/session";
import { isLiveOrderStatus } from "../../utils/orderHistory";
import { getOrderItems } from "../../services/orderService";
import {
  reserveTableAtomic,
  TableReservationError,
} from "../../services/tableCheckService";
import { formatWaitLabel } from "../../services/tableWaitTimeService";
import { formatCurrency, formatTime } from "../../utils/formatting";
import { PageLoader } from "../../components/common/Spinner";
import { AccessibleStatus } from "../../components/customer/AccessibleStatus";
import type { OrderItem } from "../../types/order";
import type { Table } from "../../types/table";

/**
 * Customer Table Check — professional English UI.
 * (Tamil/Tanglish support lives on in the menu/AI chat; this flow is
 * English-first per product requirements.)
 */
const LANG = "en" as const;

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

export default function CustomerTableCheck() {
  const { restaurantId = "" } = useParams();
  const navigate = useNavigate();
  const { restaurant, loading: rLoading } = useRestaurant(restaurantId);
  const { models, counts, loading: tLoading, refresh, sessionId } = useTableCheck(restaurantId);
  const { orders: historyOrders, loading: hLoading } = useOrderHistory(restaurantId);
  const [browsing, setBrowsing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [confirmTable, setConfirmTable] = useState<Table | null>(null);
  const [reserving, setReserving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateTableNumber, setDuplicateTableNumber] = useState<number | null>(null);
  const [ownItems, setOwnItems] = useState<OrderItem[]>([]);
  const [liveMessage, setLiveMessage] = useState("Table check");

  // Own context: live reservation by this session, or a live order holding
  // the table through this session's occupancy claim (same customerSessionId).
  const ownModel = useMemo(() => {
    const sid = sessionId || getOrCreateSessionId();
    return (
      models.find((m) => m.ownReservation && m.status === "RESERVED") ??
      models.find(
        (m) =>
          m.table.occupiedBy === sid &&
          (m.status === "OCCUPIED" || m.status === "PAYMENT_PENDING")
      ) ??
      null
    );
  }, [models, sessionId]);

  const ownOrder = ownModel?.order ?? null;

  useEffect(() => {
    if (!restaurantId || !ownOrder) {
      setOwnItems([]);
      return;
    }
    let cancelled = false;
    getOrderItems(restaurantId, ownOrder.id)
      .then((items) => {
        if (!cancelled) setOwnItems(items);
      })
      .catch(() => {
        if (!cancelled) setOwnItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, ownOrder?.id]);

  const available = useMemo(() => models.filter((m) => m.status === "AVAILABLE" && m.table.isActive && m.table.isAccessAvailable !== false), [models]);
  const reserved = useMemo(() => models.filter((m) => m.status === "RESERVED" && !m.ownReservation), [models]);
  const occupied = useMemo(() => models.filter((m) => m.status === "OCCUPIED"), [models]);
  const payment = useMemo(() => models.filter((m) => m.status === "PAYMENT_PENDING"), [models]);

  // Previous orders: this browser's history, excluding the live current order.
  const previousOrders = useMemo(
    () => historyOrders.filter(({ order }) => order.id !== ownOrder?.id),
    [historyOrders, ownOrder?.id]
  );

  function continueToMenu(table: Table) {
    navigate(`/menu/${restaurantId}/${table.id}?token=${table.qrToken}`);
  }

  function viewOrder(orderId: string, trackingToken: string) {
    navigate(`/order/${orderId}?token=${trackingToken}`);
  }

  async function confirmSelect() {
    if (!confirmTable || reserving) return;
    // Duplicate protection: one active table per customer session.
    if (ownModel && ownModel.table.id !== confirmTable.id) {
      setDuplicateTableNumber(ownModel.table.tableNumber);
      setConfirmTable(null);
      setLiveMessage("Your table is already reserved.");
      return;
    }
    setReserving(true);
    setError(null);
    try {
      const sid = sessionId || getOrCreateSessionId();
      await reserveTableAtomic(restaurantId, confirmTable, sid);
      const token = confirmTable.qrToken;
      setLiveMessage(`Your selected table: Table ${confirmTable.tableNumber}`);
      navigate(`/menu/${restaurantId}/${confirmTable.id}?token=${token}`);
    } catch (e) {
      const err = e as TableReservationError;
      if (err?.code === "TABLE_RESERVED" || err?.code === "TABLE_OCCUPIED") {
        setError("Sorry, this table was just taken. Please choose another available table.");
        setLiveMessage("Sorry, this table was just taken.");
      } else {
        setError("Could not reserve this table. Please try another.");
        setLiveMessage("Could not reserve this table.");
      }
      setConfirmTable(null);
      refresh();
    } finally {
      setReserving(false);
    }
  }

  if (!restaurantId || rLoading || tLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <PageLoader label="Loading restaurant..." />
      </div>
    );
  }

  if (!restaurant || !restaurant.isActive) {
    return (
      <main className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <h1 className="text-xl font-bold tracking-tight text-ink-900">SmartDine</h1>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">
            This restaurant is currently not accepting customers.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main aria-label={`Table check for ${restaurant.name}`} className="min-h-screen bg-surface-50 pb-16">
      <AccessibleStatus message={liveMessage} />
      <header className="bg-ink-900 text-white">
        <div className="max-w-lg mx-auto px-4 py-8 text-center">
          <p className="text-xs font-bold tracking-[0.2em] text-white/60">SMARTDINE</p>
          <h1 className="text-2xl font-bold tracking-tight mt-2">
            Welcome to {restaurant.name}
          </h1>
          {restaurant.description && (
            <p className="text-white/65 text-[13px] mt-2 leading-relaxed line-clamp-2">{restaurant.description}</p>
          )}
          <p className="text-white/80 text-sm mt-3">Select an available table and start your order.</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 -mt-0 pt-4 space-y-3">
        {!browsing ? (
          <section aria-label="Table check actions" className="bg-white rounded-2xl border border-surface-200 shadow-card p-5 space-y-3">
            <button
              type="button"
              onClick={() => {
                setBrowsing(true);
                setLiveMessage("Table Selection");
              }}
              className="pressable w-full py-3.5 min-h-[52px] rounded-2xl bg-ink-900 text-white font-semibold text-[15px] flex items-center justify-center gap-2"
            >
              <Armchair className="w-5 h-5" aria-hidden="true" />
              View Available Tables
            </button>
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              aria-expanded={showInfo}
              className="pressable w-full py-3 min-h-[48px] rounded-2xl bg-white border border-surface-200 text-ink-700 font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Info className="w-4 h-4" aria-hidden="true" />
              Restaurant Info
            </button>
            {showInfo && (
              <div className="text-sm text-ink-600 leading-relaxed border-t border-surface-100 pt-3 space-y-1.5">
                {restaurant.address && <p><span className="font-semibold text-ink-900">Address: </span>{restaurant.address}</p>}
                {restaurant.phone && <p><span className="font-semibold text-ink-900">Phone: </span>{restaurant.phone}</p>}
              </div>
            )}
          </section>
        ) : (
          <>
            {ownModel && (
              <section aria-labelledby="tc-your-table" className="bg-green-50 rounded-2xl border border-green-200 shadow-card p-4">
                <h2 id="tc-your-table" className="text-xs font-bold tracking-wide uppercase text-green-700">Your Table</h2>
                <p className="text-lg font-bold text-green-900 mt-1 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                  Table {ownModel.table.tableNumber}
                </p>
                <p className="text-sm text-green-700 mt-0.5">Reserved for you</p>
                {ownOrder && (
                  <div className="mt-3 border-t border-green-200 pt-3">
                    <p className="text-xs font-bold tracking-wide uppercase text-green-700">Current Order</p>
                    {ownItems.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {ownItems.map((it) => (
                          <li key={it.id} className="flex justify-between text-sm gap-2">
                            <span className="text-green-900 min-w-0">{it.itemName} <span className="tabular-nums">× {it.quantity}</span></span>
                            <span className="font-semibold tabular-nums shrink-0">{formatCurrency(it.price * it.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-sm text-green-800 mt-1.5">
                      Status: {orderStateLabel(ownOrder.status, ownOrder.paymentStatus)}
                      {ownModel.wait && ownModel.wait.label === "approx" && ownModel.wait.remainingMinMinutes != null
                        ? ` • Estimated wait: ${ownModel.wait.remainingMinMinutes === ownModel.wait.remainingMaxMinutes ? `${ownModel.wait.remainingMinMinutes}` : `${ownModel.wait.remainingMinMinutes}–${ownModel.wait.remainingMaxMinutes}`} min`
                        : ""}
                      {ownModel.wait && ownModel.wait.label === "payment" ? " • Finishing payment" : ""}
                    </p>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => continueToMenu(ownModel.table)}
                    className="pressable flex-1 py-3 min-h-[48px] rounded-2xl bg-green-700 text-white font-semibold text-sm flex items-center justify-center gap-2"
                  >
                    Continue to Order
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                  {ownOrder && (
                    <button
                      type="button"
                      onClick={() => viewOrder(ownOrder.id, ownOrder.trackingToken)}
                      className="pressable flex-1 py-3 min-h-[48px] rounded-2xl bg-white border border-green-300 text-green-800 font-semibold text-sm"
                    >
                      View Current Order
                    </button>
                  )}
                </div>
              </section>
            )}

            <section aria-labelledby="tc-choose-title" className="bg-white rounded-2xl border border-surface-200 shadow-card p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 id="tc-choose-title" className="text-[17px] font-bold tracking-tight text-ink-900">Table Selection</h2>
                  <p className="text-xs text-ink-500 mt-0.5" role="status">
                    Live availability — updates automatically. {counts.available} Available • {counts.occupied} Occupied
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    refresh();
                    setLiveMessage("Availability refreshed");
                  }}
                  aria-label="Refresh availability"
                  className="pressable shrink-0 w-11 h-11 rounded-2xl bg-surface-50 border border-surface-200 flex items-center justify-center text-ink-700"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <p className="text-sm text-ink-600 mt-2">Select an available table and start your order.</p>

              {duplicateTableNumber != null && (
                <div role="alert" className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <p className="text-sm font-semibold text-amber-800">Your table is already reserved.</p>
                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const m = models.find((x) => x.table.tableNumber === duplicateTableNumber);
                        if (m) continueToMenu(m.table);
                      }}
                      className="pressable flex-1 py-2.5 min-h-[44px] rounded-xl bg-ink-900 text-white text-sm font-semibold"
                    >
                      Continue to Table {duplicateTableNumber}
                    </button>
                    {ownOrder && (
                      <button
                        type="button"
                        onClick={() => viewOrder(ownOrder.id, ownOrder.trackingToken)}
                        className="pressable flex-1 py-2.5 min-h-[44px] rounded-xl bg-white border border-surface-200 text-ink-700 text-sm font-semibold"
                      >
                        View Current Order
                      </button>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className="mt-3 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  {error}
                </p>
              )}

              {models.length === 0 && (
                <p className="mt-4 text-sm text-ink-500">No tables available right now. Please check again shortly.</p>
              )}

              {available.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-bold tracking-wide uppercase text-green-700">Available Now ({available.length})</h3>
                  <ul className="mt-2 space-y-2.5">
                    {available.map((m) => (
                      <li key={m.table.id} className="flex items-center justify-between gap-3 bg-green-50/60 border border-green-200 rounded-2xl px-4 py-3">
                        <span className="min-w-0">
                          <span className="block font-bold text-ink-900">Table {m.table.tableNumber}</span>
                          <span className="block text-xs text-ink-500 mt-0.5">
                            <Users className="w-3 h-3 inline mr-1" aria-hidden="true" />
                            Seats: {m.table.capacity} • Available
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmTable(m.table);
                            setError(null);
                          }}
                          aria-label={`Select Table ${m.table.tableNumber}`}
                          className="pressable shrink-0 px-4 py-2.5 min-h-[44px] rounded-xl bg-ink-900 text-white text-sm font-semibold"
                        >
                          Select Table
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {reserved.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-bold tracking-wide uppercase text-ink-500">Reserved ({reserved.length})</h3>
                  <ul className="mt-2 space-y-2.5">
                    {reserved.map((m) => (
                      <li key={m.table.id} className="bg-surface-50 border border-surface-200 rounded-2xl px-4 py-3">
                        <span className="block font-bold text-ink-900">Table {m.table.tableNumber}</span>
                        <span className="block text-xs text-ink-500 mt-1">Reserved • Selection in progress</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {occupied.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-bold tracking-wide uppercase text-ink-500">Occupied ({occupied.length})</h3>
                  <ul className="mt-2 space-y-2.5" aria-live="polite">
                    {occupied.map((m) => (
                      <li key={m.table.id} className="bg-surface-50 border border-surface-200 rounded-2xl px-4 py-3">
                        <span className="block font-bold text-ink-900">Table {m.table.tableNumber}</span>
                        <span className="flex items-center gap-1.5 text-xs text-ink-500 mt-1">
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                          Occupied
                          {m.wait && (m.wait.label === "approx" || m.wait.label === "payment")
                            ? ` • ${formatWaitLabel(m.wait, LANG)}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {payment.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-bold tracking-wide uppercase text-amber-700">Payment Pending ({payment.length})</h3>
                  <ul className="mt-2 space-y-2.5">
                    {payment.map((m) => (
                      <li key={m.table.id} className="bg-amber-50/60 border border-amber-200 rounded-2xl px-4 py-3">
                        <span className="block font-bold text-ink-900">Table {m.table.tableNumber}</span>
                        <span className="block text-xs text-amber-700 mt-1 font-medium">Finishing payment</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section aria-labelledby="tc-prev-title" className="bg-white rounded-2xl border border-surface-200 shadow-card p-5">
              <h2 id="tc-prev-title" className="text-[17px] font-bold tracking-tight text-ink-900 flex items-center gap-2">
                <ReceiptText className="w-4 h-4 text-ink-400" aria-hidden="true" />
                Previous Orders
              </h2>
              {hLoading ? (
                <p className="text-sm text-ink-500 mt-2">Loading orders…</p>
              ) : previousOrders.length === 0 ? (
                <p className="text-sm text-ink-500 mt-2">No previous orders yet.</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {previousOrders.map(({ order, items }) => {
                    const live = isLiveOrderStatus(order.status, order.paymentStatus);
                    return (
                      <li key={order.id} className="border border-surface-200 rounded-2xl px-4 py-3">
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
                            onClick={() => viewOrder(order.id, order.trackingToken)}
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
            </section>

            <button
              type="button"
              onClick={() => setBrowsing(false)}
              className="pressable text-sm font-semibold text-ink-500 hover:text-ink-900 px-2 py-2 min-h-[44px]"
            >
              ← Back
            </button>
          </>
        )}
      </div>

      {confirmTable && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="tc-confirm-title">
          <div className="absolute inset-0 bg-ink-900/45" onClick={() => !reserving && setConfirmTable(null)} aria-hidden="true" />
          <div className="relative w-full max-w-sm bg-white rounded-3xl border border-surface-200 shadow-medium p-6">
            <h2 id="tc-confirm-title" className="text-lg font-bold tracking-tight text-ink-900">
              Table {confirmTable.tableNumber}
            </h2>
            <p className="text-sm text-green-700 font-semibold mt-1">Available now • Seats: {confirmTable.capacity}</p>
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setConfirmTable(null)}
                disabled={reserving}
                className="pressable flex-1 py-3 min-h-[48px] rounded-2xl bg-white border border-surface-200 text-ink-700 font-semibold text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSelect}
                disabled={reserving}
                className="pressable flex-1 py-3 min-h-[48px] rounded-2xl bg-ink-900 text-white font-semibold text-sm disabled:opacity-50"
              >
                {reserving ? "…" : "Select Table"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
