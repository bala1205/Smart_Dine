import { useState, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useRealtimeServiceRequests } from "../../hooks/useServiceRequests";
import {
  SERVICE_REQUEST_TYPES,
  SERVICE_REQUEST_STATUS_LABELS,
} from "../../types/serviceRequest";
import type { ServiceRequestStatus } from "../../types/serviceRequest";
import { formatTime } from "../../utils/formatting";
import { EmptyState } from "../../components/common/States";
import { toast } from "sonner";

const FILTERS: { label: string; value: ServiceRequestStatus | null }[] = [
  { label: "Pending", value: "PENDING" },
  { label: "Acknowledged", value: "ACKNOWLEDGED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "All", value: null },
];

export default function WaiterDashboard() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const [filter, setFilter] = useState<ServiceRequestStatus | null>("PENDING");
  const { requests, loading, changeStatus } = useRealtimeServiceRequests(restaurantId, filter);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = useMemo(() => [...requests].sort((a, b) => b.createdAt - a.createdAt), [requests]);
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  async function handle(id: string, next: ServiceRequestStatus) {
    setBusyId(id);
    try {
      await changeStatus(id, next);
      toast.success(`Request ${SERVICE_REQUEST_STATUS_LABELS[next]}`);
    } catch {
      toast.error("Failed to update request");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Waiter Requests</h1>
          <p className="text-gray-500 text-sm">
            {pendingCount > 0 ? `${pendingCount} pending request${pendingCount > 1 ? "s" : ""} needs attention` : "All caught up"}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-gray-500">Realtime</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.value ? "bg-brand-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading requests...</div>
      ) : sorted.length === 0 ? (
        <EmptyState title={filter ? `No ${filter.toLowerCase()} requests` : "No requests"} description="Service requests from customers will appear here in real time." />
      ) : (
        <div className="grid gap-3">
          {sorted.map((req) => {
            const meta = SERVICE_REQUEST_TYPES[req.requestType];
            return (
              <div key={req.id} className="bg-white rounded-xl shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3 border border-gray-100">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center text-2xl flex-shrink-0">{meta.icon}</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-800 flex items-center gap-2">
                      Table {String(req.tableNumber).padStart(2, "0")} — {meta.label}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          req.status === "PENDING"
                            ? "bg-amber-100 text-amber-700"
                            : req.status === "ACKNOWLEDGED"
                            ? "bg-blue-100 text-blue-700"
                            : req.status === "COMPLETED" || req.status === "RESOLVED"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {SERVICE_REQUEST_STATUS_LABELS[req.status]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatTime(req.createdAt)} • Session {req.customerSessionId.slice(0, 6)} {req.orderId ? `• Order #${req.orderId.slice(-4).toUpperCase()}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 sm:ml-auto">
                  {req.status === "PENDING" && (
                    <>
                      <button
                        disabled={busyId === req.id}
                        onClick={() => handle(req.id, "ACKNOWLEDGED")}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                      <button
                        disabled={busyId === req.id}
                        onClick={() => handle(req.id, "COMPLETED")}
                        className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        Complete
                      </button>
                      <button
                        disabled={busyId === req.id}
                        onClick={() => handle(req.id, "CANCELLED")}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {req.status === "ACKNOWLEDGED" && (
                    <>
                      <button
                        disabled={busyId === req.id}
                        onClick={() => handle(req.id, "COMPLETED")}
                        className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        Mark Completed
                      </button>
                      <button
                        disabled={busyId === req.id}
                        onClick={() => handle(req.id, "CANCELLED")}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
