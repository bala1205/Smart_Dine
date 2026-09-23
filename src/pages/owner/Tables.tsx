import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Printer, RefreshCw, QrCode } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useRestaurant } from "../../hooks/useRestaurant";
import useTables from "../../hooks/useTables";
import {
  addTable,
  updateTable,
  deleteTable,
  regenerateTableToken,
} from "../../services/tableService";
import { generateQRDataUrl, downloadQR, tableMenuUrl } from "../../utils/qr";
import { Input } from "../../components/common/Form";
import { Button } from "../../components/common/Button";
import { Modal, ConfirmDialog } from "../../components/common/Modal";
import { EmptyState } from "../../components/common/States";
import type { Table } from "../../types/table";

export default function OwnerTables() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const { restaurant } = useRestaurant(restaurantId);
  const { tables, loading } = useTables(restaurantId);
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
          <h1 className="text-2xl font-bold text-gray-800">Tables & QR</h1>
          <p className="text-gray-500 text-sm">Manage tables and generate QR codes</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Table
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading tables...</div>
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No tables added"
          description="Add your first table to start accepting QR orders."
          action={
            <Button onClick={openAdd}>
              <Plus className="w-4 h-4" /> Add Table
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((t) => (
            <div key={t.id} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-gray-800">Table {t.tableNumber}</h3>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {t.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-sm text-gray-500">Capacity: {t.capacity}</p>
              <div className="mt-3">
                <Button variant="secondary" className="w-full" onClick={() => openQR(t)}>
                  <QrCode className="w-4 h-4" /> Generate QR
                </Button>
              </div>
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
            </div>
          ))}
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
