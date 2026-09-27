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
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="page-header !mb-0">
          <h1>Service requests</h1>
          <p aria-live="polite">
            {pendingCount > 0 ? `${pendingCount} pending request${pendingCount > 1 ? "s" : ""} need${pendingCount > 1 ? "" : "s"} attention` : "All caught up"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0" role="status">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
          <span className="text-xs font-semibold text-ink-500">Live</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter requests">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className="filter-pill"
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3" aria-label="Loading requests">
          <div className="skeleton-shimmer rounded-2xl h-20 w-full" />
          <div className="skeleton-shimmer rounded-2xl h-20 w-full" />
          <div className="skeleton-shimmer rounded-2xl h-20 w-full" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card">
          <EmptyState title={filter ? `No ${filter.toLowerCase()} requests` : "No requests"} description="Service requests from customers will appear here in real time." />
        </div>
      ) : (
        <div className="grid gap-3" role="log" aria-live="polite" aria-label="Service requests">
          {sorted.map((req) => {
            const meta = SERVICE_REQUEST_TYPES[req.requestType];
            const RequestIcon = meta.Icon;
            return (
              <div key={req.id} className="bg-white rounded-2xl shadow-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 border border-surface-200">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0" aria-hidden="true">
                    <RequestIcon className="w-5 h-5 text-brand-700" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] text-ink-900 flex items-center gap-2 flex-wrap">
                      <span>Table {String(req.tableNumber).padStart(2, "0")} • {meta.label}</span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border whitespace-nowrap ${
                          req.status === "PENDING"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : req.status === "ACKNOWLEDGED"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : req.status === "COMPLETED" || req.status === "RESOLVED"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-surface-50 text-ink-500 border-surface-200"
                        }`}
                      >
                        {SERVICE_REQUEST_STATUS_LABELS[req.status]}
                      </span>
                    </div>
                    <div className="text-xs text-ink-500 mt-1 tabular-nums">
                      {formatTime(req.createdAt)}{req.orderId ? ` • Order #${req.orderId.slice(-4).toUpperCase()}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto w-full sm:w-auto">
                  {req.status === "PENDING" && (
                    <>
                      <button
                        disabled={busyId === req.id}
                        aria-busy={busyId === req.id || undefined}
                        onClick={() => handle(req.id, "ACKNOWLEDGED")}
                        className="pressable px-3.5 py-2 min-h-[38px] rounded-xl bg-ink-900 text-white text-[13px] font-semibold hover:bg-ink-700 disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                      <button
                        disabled={busyId === req.id}
                        onClick={() => handle(req.id, "COMPLETED")}
                        className="pressable px-3.5 py-2 min-h-[38px] rounded-xl bg-green-600 text-white text-[13px] font-semibold hover:bg-green-700 disabled:opacity-50"
                      >
                        Complete
                      </button>
                      <button
                        disabled={busyId === req.id}
                        onClick={() => handle(req.id, "CANCELLED")}
                        className="pressable px-3.5 py-2 min-h-[38px] rounded-xl border border-surface-200 text-[13px] font-semibold text-ink-500 hover:bg-surface-50 disabled:opacity-50"
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
                        className="pressable px-3.5 py-2 min-h-[38px] rounded-xl bg-green-600 text-white text-[13px] font-semibold hover:bg-green-700 disabled:opacity-50"
                      >
                        Mark completed
                      </button>
                      <button
                        disabled={busyId === req.id}
                        onClick={() => handle(req.id, "CANCELLED")}
                        className="pressable px-3.5 py-2 min-h-[38px] rounded-xl border border-surface-200 text-[13px] font-semibold text-ink-500 hover:bg-surface-50 disabled:opacity-50"
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
