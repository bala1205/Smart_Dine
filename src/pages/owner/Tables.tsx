import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Printer, RefreshCw, QrCode, Eye } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useRestaurant } from "../../hooks/useRestaurant";
import useTables from "../../hooks/useTables";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
  addTable,
  updateTable,
  deleteTable,
  regenerateTableToken,
  setTableAccessAvailable,
} from "../../services/tableService";
import { markOrderPaid } from "../../services/orderService";
import { generateQRDataUrl, downloadQR, tableMenuUrl } from "../../utils/qr";
import { Input } from "../../components/common/Form";
import { Button } from "../../components/common/Button";
import { Modal, ConfirmDialog } from "../../components/common/Modal";
import { EmptyState } from "../../components/common/States";
import { useTableOccupancy } from "../../hooks/useTableOccupancy";
import { useRealtimeServiceRequests } from "../../hooks/useServiceRequests";
import { formatCurrency, formatTime } from "../../utils/formatting";
import { getOrderItems } from "../../services/orderService";
import type { Table } from "../../types/table";
import type { Order, OrderItem } from "../../types/order";

export default function OwnerTables() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const { restaurant } = useRestaurant(restaurantId);
  const { tables, loading } = useTables(restaurantId);
  const isWaiter = profile?.role === "WAITER";
  const isOwner = profile?.role === "OWNER";
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState("");
  const [capacity, setCapacity] = useState("");
  const [deleting, setDeleting] = useState<Table | null>(null);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrLoading, setQrLoading] = useState(false);

  const sorted = useMemo(
    () => (tables || []).slice().sort((a, b) => a.tableNumber - b.tableNumber),
    [tables]
  );

  const occupancyMap = useTableOccupancy(restaurantId, tables);
  const { requests: allRequests } = useRealtimeServiceRequests(restaurantId);
  const [detailsTable, setDetailsTable] = useState<Table | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [detailsItems, setDetailsItems] = useState<OrderItem[]>([]);
  const [detailsRequests, setDetailsRequests] = useState<typeof allRequests>([]);
  const [payConfirm, setPayConfirm] = useState<Order | null>(null);

  useEffect(() => {
    if (detailsTable) {
      const occ = occupancyMap.get(detailsTable.id);
      setDetailsOrder(occ?.currentOrder ?? null);
      if (occ?.currentOrder) {
        getOrderItems(restaurantId, occ.currentOrder.id).then(setDetailsItems).catch(() => setDetailsItems([]));
      } else {
        setDetailsItems([]);
      }
      setDetailsRequests(allRequests.filter((r) => r.tableId === detailsTable.id));
    }
  }, [detailsTable, occupancyMap, allRequests, restaurantId]);

  function openAdd() {
    setEditingId(null);
    setTableNumber("");
    setCapacity("");
    setModalOpen(true);
  }

  function openEdit(t: Table) {
    setEditingId(t.id);
    setTableNumber(String(t.tableNumber));
    setCapacity(String(t.capacity));
    setModalOpen(true);
  }

  async function save() {
    const num = parseInt(tableNumber, 10);
    const cap = parseInt(capacity, 10);
    if (!num || !cap || cap <= 0) {
      toast.error("Enter a valid table number and capacity");
      return;
    }
    try {
      if (editingId) {
        await updateTable(restaurantId, editingId, { tableNumber: num, capacity: cap });
        toast.success("Table updated");
      } else {
        await addTable(restaurantId, { tableNumber: num, capacity: cap });
        toast.success("Table added");
      }
      setModalOpen(false);
    } catch {
      toast.error("Failed to save table");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteTable(restaurantId, deleting.id);
      toast.success("Table deleted");
      setDeleting(null);
    } catch {
      toast.error("Failed to delete table");
    }
  }

  async function toggleActive(t: Table) {
    await updateTable(restaurantId, t.id, { isActive: !t.isActive });
  }

  async function toggleAccess(t: Table) {
    const current = (t as unknown as { isAccessAvailable?: boolean }).isAccessAvailable ?? true;
    try {
      await setTableAccessAvailable(restaurantId, t.id, !current);
      toast.success(`Table ${t.tableNumber} ${!current ? "enabled" : "disabled"} for customer access`);
    } catch {
      toast.error("Failed to update table access");
    }
  }

  async function handleMarkPaid(order: Order) {
    // DEBUG: Get current auth state
    const { auth } = await import("../../lib/firebase");
    const currentUser = auth.currentUser;

    // DEBUG: Read the restaurant document to verify ownerId
    const restaurantRef = doc(db, "restaurants", restaurantId);
    const restaurantSnap = await getDoc(restaurantRef);
    const restaurantData = restaurantSnap.exists() ? restaurantSnap.data() : null;

    // DEBUG: Read the order document directly from Firestore
    const orderRef = doc(db, "restaurants", restaurantId, "orders", order.id);
    const orderSnap = await getDoc(orderRef);
    const orderData = orderSnap.exists() ? orderSnap.data() : null;

    // DEBUG: Read the table document
    const tableRef = doc(db, "restaurants", restaurantId, "tables", order.tableId);
    const tableSnap = await getDoc(tableRef);
    const tableData = tableSnap.exists() ? tableSnap.data() : null;

    if (import.meta.env.DEV) console.log("[handleMarkPaid:RUNTIME_IDENTITY]", {
      // Auth state
      authCurrentUserUid: currentUser?.uid ?? "NOT_AUTHENTICATED",
      authCurrentUserEmail: currentUser?.email ?? "N/A",
      // useAuth profile
      profileUid: profile?.uid,
      profileRole: profile?.role,
      profileRestaurantId: profile?.restaurantId,
      // Tables component state
      tablesRestaurantId: restaurantId,
      // Order from UI state
      uiOrderId: order.id,
      uiOrderRestaurantId: order.restaurantId,
      uiOrderTableId: order.tableId,
      uiOrderStatus: order.status,
      uiOrderPaymentStatus: (order as unknown as { paymentStatus?: string }).paymentStatus,
      uiOrderTableNumber: order.tableNumber,
      // Firestore restaurant document
      firestoreRestaurantExists: restaurantSnap.exists(),
      firestoreRestaurantOwnerId: restaurantData?.ownerId,
      firestoreRestaurantName: restaurantData?.name,
      // Firestore order document
      firestoreOrderExists: orderSnap.exists(),
      firestoreOrderRestaurantId: orderData?.restaurantId,
      firestoreOrderTableId: orderData?.tableId,
      firestoreOrderStatus: orderData?.status,
      firestoreOrderPaymentStatus: orderData?.paymentStatus,
      firestoreOrderTotalAmount: orderData?.totalAmount,
      firestoreOrderGrandTotal: orderData?.grandTotal,
      // Firestore table document
      firestoreTableExists: tableSnap.exists(),
      firestoreTableId: tableData?.id,
      firestoreTableNumber: tableData?.tableNumber,
      firestoreTableRestaurantId: tableData?.restaurantId,
      firestoreTableIsActive: tableData?.isActive,
      firestoreTableIsAccessAvailable: tableData?.isAccessAvailable,
      // Key validations
      ownerIdMatchesAuth: restaurantData?.ownerId === currentUser?.uid,
      ownerIdMatchesProfile: restaurantData?.ownerId === profile?.uid,
      orderRestaurantMatchesTables: orderData?.restaurantId === restaurantId,
      tableRestaurantMatchesTables: tableData?.restaurantId === restaurantId,
      orderStatusIsServed: orderData?.status === "SERVED",
      orderPaymentStatusNotPaid: orderData?.paymentStatus !== "PAID",
    });

    try {
      await markOrderPaid(restaurantId, order.id);
      toast.success(`Payment confirmed for Table ${detailsTable?.tableNumber ?? order.tableNumber}`);
      setPayConfirm(null);
      setDetailsTable(null);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (import.meta.env.DEV) console.error("[handleMarkPaid:ERROR]", {
        code: err?.code,
        message: err?.message,
        restaurantId,
        orderId: order.id,
        status: order.status,
        paymentStatus: (order as unknown as { paymentStatus?: string }).paymentStatus,
      });
      const msg = (err?.message || "").toLowerCase();
      if ((err?.code || "").includes("permission") || msg.includes("permission")) {
        toast.error("Permission denied. Please check Firestore rules and owner access.");
      } else {
        toast.error("Failed to mark as paid");
      }
    }
  }

  async function openQR(t: Table) {
    setQrTable(t);
    setQrLoading(true);
    setQrDataUrl("");
    try {
      const url = await generateQRDataUrl(restaurantId, t);
      setQrDataUrl(url);
    } catch {
      toast.error("Failed to generate QR");
    } finally {
      setQrLoading(false);
    }
  }

  async function regen(t: Table) {
    try {
      await regenerateTableToken(restaurantId, t.id);
      toast.success("QR regenerated");
      setQrTable(null);
    } catch {
      toast.error("Failed to regenerate QR");
    }
  }

  function printQR() {
    if (!qrTable || !qrDataUrl || !restaurant) return;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    win.document.write(`
      <html><head><title>Print QR</title><style>
        body{font-family:sans-serif;text-align:center;padding:40px;color:#111}
        .brand{font-size:26px;font-weight:bold;letter-spacing:2px}
        .name{font-size:18px;margin-top:6px}
        .table{font-size:34px;font-weight:bold;margin:18px 0}
        img{width:260px;height:260px}
        .foot{margin-top:16px;font-size:14px}
      </style></head><body>
        <div class="brand">SMART DINE</div>
        <div class="name">${restaurant.name}</div>
        <div class="table">TABLE ${qrTable.tableNumber}</div>
        <img src="${qrDataUrl}" />
        <div class="foot">Scan to View Menu &amp; Order</div>
        <script>window.onload=function(){window.print()}</script>
      </body></html>
    `);
    win.document.close();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{isWaiter ? "Tables" : "Tables & QR"}</h1>
          <p className="text-gray-500 text-sm">{isWaiter ? "View table occupancy and service requests" : "Manage tables and generate QR codes"}</p>
        </div>
        {isOwner && (
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Table
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading tables...</div>
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No tables added"
          description={isOwner ? "Add your first table to start accepting QR orders." : "No tables available"}
          action={
            isOwner ? (
              <Button onClick={openAdd}>
                <Plus className="w-4 h-4" /> Add Table
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((t) => {
            const occ = occupancyMap.get(t.id);
            const status = !t.isActive ? "INACTIVE" : occ?.status || "AVAILABLE";
            const occOrder = occ?.currentOrder;
            return (
              <div key={t.id} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold text-gray-800">Table {t.tableNumber}</h3>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      status === "INACTIVE"
                        ? "bg-gray-100 text-gray-500"
                        : status === "AVAILABLE"
                        ? "bg-green-100 text-green-700"
                        : status === "OCCUPIED"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {status === "INACTIVE" ? "Inactive" : status === "AVAILABLE" ? "🟢 Available" : status === "OCCUPIED" ? `🔴 Occupied${occOrder ? ` • #${occOrder.id.slice(-4).toUpperCase()}` : ""}` : `🟡 Payment Pending${occOrder ? ` • #${occOrder.id.slice(-4).toUpperCase()}` : ""}`}
                  </span>
                </div>
                <p className="text-sm text-gray-500">Capacity: {t.capacity}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">Customer Access:</span>
                  {((t as unknown as { isAccessAvailable?: boolean }).isAccessAvailable ?? true) ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🟢 Available</span>
                  ) : (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">🔴 Not Available</span>
                  )}
                </div>
                {occOrder && (
                  <p className="text-xs text-gray-500 mt-1">
                    Order #{occOrder.id.slice(-4).toUpperCase()} • {occOrder.status} {occOrder.paymentStatus === "PAID" ? "• PAID" : occOrder.status === "SERVED" ? "• 🟡 Payment Pending" : ""} • {formatCurrency(occOrder.grandTotal ?? occOrder.totalAmount)} • {formatTime(occOrder.createdAt)}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => openQR(t)}>
                    <QrCode className="w-4 h-4" /> QR
                  </Button>
                  <Button variant="secondary" className="flex-1" onClick={() => setDetailsTable(t)}>
                    <Eye className="w-4 h-4" /> Details
                  </Button>
                </div>
                {occ && occ.status === "PAYMENT_PENDING" && isOwner && occOrder && (
                  <Button className="w-full mt-2" onClick={() => setPayConfirm(occOrder)}>
                    Mark as Paid
                  </Button>
                )}
                {isOwner && (
                  <button
                    onClick={() => toggleAccess(t)}
                    className={`w-full mt-2 py-1.5 rounded-lg text-xs font-medium border ${((t as unknown as { isAccessAvailable?: boolean }).isAccessAvailable ?? true) ? "bg-white border-gray-200 text-gray-600 hover:bg-gray-50" : "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"}`}
                  >
                    {((t as unknown as { isAccessAvailable?: boolean }).isAccessAvailable ?? true) ? "Disable Access" : "Enable Access"}
                  </button>
                )}
                {isOwner && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => openEdit(t)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                    >
                      <Pencil className="w-4 h-4" /> Edit
                    </button>
                    <button
                      onClick={() => toggleActive(t)}
                      className="flex-1 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                    >
                      {t.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => setDeleting(t)}
                      className="flex items-center justify-center py-2 rounded-lg text-sm text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Table" : "Add Table"}>
        <div className="space-y-4">
          <Input
            label="Table Number"
            type="number"
            placeholder="e.g. 5"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
          />
          <Input
            label="Capacity (seats)"
            type="number"
            placeholder="e.g. 4"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            A unique QR code will be generated for this table after saving.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editingId ? "Save Changes" : "Add Table"}</Button>
          </div>
        </div>
      </Modal>

      {/* QR modal */}
      <Modal open={!!qrTable} onClose={() => setQrTable(null)} title={qrTable ? `Table ${qrTable.tableNumber} QR` : ""}>
        <div className="flex flex-col items-center">
          {qrLoading ? (
            <div className="text-gray-500 py-10">Generating QR...</div>
          ) : (
            qrDataUrl && (
              <>
                <img src={qrDataUrl} alt="QR code" className="w-56 h-56" />
                <p className="text-xs text-gray-400 mt-2 break-all max-w-full">
                  {qrTable && tableMenuUrl(restaurantId, qrTable)}
                </p>
              </>
            )
          )}
          <div className="flex flex-wrap gap-3 mt-4 justify-center">
            {qrTable && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => restaurant && downloadQR(restaurantId, qrTable, restaurant.name)}
                >
                  <Download className="w-4 h-4" /> Download
                </Button>
                <Button variant="secondary" onClick={printQR}>
                  <Printer className="w-4 h-4" /> Print
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await regen(qrTable);
                  }}
                >
                  <RefreshCw className="w-4 h-4" /> Regenerate
                </Button>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* Table Details modal */}
      <Modal
        open={!!detailsTable}
        onClose={() => setDetailsTable(null)}
        title={detailsTable ? `Table ${detailsTable.tableNumber} Details` : ""}
        wide
      >
        {detailsTable &&
          (() => {
            const occ = occupancyMap.get(detailsTable.id);
            const status = !detailsTable.isActive ? "INACTIVE" : occ?.status || "AVAILABLE";
            const isAvailable = status === "AVAILABLE";
            const accessAvailable = (detailsTable as unknown as { isAccessAvailable?: boolean }).isAccessAvailable ?? true;
            const paymentStatus = (detailsOrder as unknown as { paymentStatus?: string })?.paymentStatus ?? (detailsOrder?.status === "SERVED" ? "PENDING" : undefined);
            return (
              <div className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Occupancy</span>
                  <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${status === "AVAILABLE" ? "bg-green-100 text-green-700" : status === "OCCUPIED" ? "bg-red-100 text-red-700" : status === "INACTIVE" ? "bg-gray-100 text-gray-500" : "bg-amber-100 text-amber-700"}`}>{status === "PAYMENT_PENDING" ? "🟡 Payment Pending" : status === "OCCUPIED" ? "🔴 Occupied" : status === "AVAILABLE" ? "🟢 Available" : status}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Customer Access</span>
                  <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${accessAvailable ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{accessAvailable ? "🟢 Available" : "🔴 Not Available"}</span>
                </div>
                {isOwner && (
                  <Button variant="secondary" className="w-full" onClick={() => toggleAccess(detailsTable)}>
                    {accessAvailable ? "Disable Access" : "Enable Access"}
                  </Button>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Capacity</span>
                  <span className="font-medium">{detailsTable.capacity}</span>
                </div>
                {detailsOrder ? (
                  <>
                    <div className="border-t border-gray-100 pt-3">
                      <div className="font-medium text-gray-800 mb-2">Current Order #{detailsOrder.id.slice(-4).toUpperCase()}</div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Status {detailsOrder.status}</span>
                        <span>{formatTime(detailsOrder.createdAt)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Total {formatCurrency(detailsOrder.grandTotal ?? detailsOrder.totalAmount)}</span>
                        <span>Table {detailsOrder.tableNumber}</span>
                      </div>
                      {detailsOrder.status === "SERVED" && (
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-gray-500">Payment</span>
                          <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${paymentStatus === "PAID" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{paymentStatus === "PAID" ? "PAID / CLEARED" : "🟡 Payment Pending"}</span>
                        </div>
                      )}
                      <div className="mt-2 space-y-1">
                        {detailsItems.map((it) => (
                          <div key={it.id} className="flex justify-between text-xs">
                            <span>{it.itemName} × {it.quantity}</span>
                            <span>{formatCurrency(it.price * it.quantity)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="secondary"
                          className="flex-1"
                          onClick={() => {
                            const orderId = detailsOrder.id;
                            setDetailsTable(null);
                            navigate(`/bill/${restaurantId}/${orderId}`);
                          }}
                        >
                          View Order
                        </Button>
                        {detailsOrder.status === "SERVED" && paymentStatus !== "PAID" && isOwner && (
                          <Button className="flex-1" onClick={() => setPayConfirm(detailsOrder)}>
                            Mark as Paid
                          </Button>
                        )}
                      </div>
                      {!isAvailable && (
                        <p className="text-xs text-amber-600 mt-2">Table cannot be made AVAILABLE while active order exists. Complete the order first.</p>
                      )}
                      {paymentStatus === "PAID" && <p className="text-xs text-green-600 mt-2">Payment confirmed. Table will be Available for next customer.</p>}
                    </div>
                  </>
                ) : (
                  <div className="bg-green-50 rounded-lg p-3 text-center text-sm text-green-700">
                    {isAvailable ? "Table is available - no active orders" : "No current order found"}
                  </div>
                )}
                <div className="border-t border-gray-100 pt-3">
                  <div className="font-medium text-gray-800 mb-2">Service Requests ({detailsRequests.length})</div>
                  {detailsRequests.length === 0 ? (
                    <p className="text-xs text-gray-400">No requests for this table</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {detailsRequests.map((r) => (
                        <div key={r.id} className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-2 py-1.5">
                          <span>{r.requestType.replace(/_/g, " ")} • {r.status}</span>
                          <span className="text-gray-400">{formatTime(r.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
      </Modal>

      {/* Payment Confirm */}
      <ConfirmDialog
        open={!!payConfirm}
        title="Confirm Payment"
        message={`Confirm payment received for Table ${payConfirm?.tableNumber ?? ""} Order #${payConfirm?.id.slice(-4).toUpperCase() ?? ""} • ${payConfirm ? formatCurrency(payConfirm.grandTotal ?? payConfirm.totalAmount) : ""}?`}
        confirmLabel="Confirm Payment"
        onConfirm={() => payConfirm && handleMarkPaid(payConfirm)}
        onCancel={() => setPayConfirm(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Delete Table"
        message={`Delete Table ${deleting?.tableNumber}? The QR code will stop working.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
