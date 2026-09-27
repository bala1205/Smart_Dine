import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useRealtimeServiceRequests } from "../../hooks/useServiceRequests";
import {
  SERVICE_REQUEST_TYPES,
  SERVICE_REQUEST_STATUS_LABELS,
} from "../../types/serviceRequest";
import type {
  ServiceRequest,
  ServiceRequestStatus,
  ServiceRequestType,
} from "../../types/serviceRequest";
import { formatRelativeTime, formatTime } from "../../utils/formatting";
import { EmptyState, ErrorState } from "../../components/common/States";

type StatusFilter = "ACTIVE" | "ALL" | ServiceRequestStatus | "RESOLVED_GROUP";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "Active", value: "ACTIVE" },
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Acknowledged", value: "ACKNOWLEDGED" },
  { label: "Resolved", value: "RESOLVED_GROUP" },
  { label: "Cancelled", value: "CANCELLED" },
];

const TYPE_FILTERS: { label: string; value: ServiceRequestType | null }[] = [
  { label: "All requests", value: null },
  { label: "Call Waiter", value: "CALL_WAITER" },
  { label: "Water", value: "REQUEST_WATER" },
  { label: "Bill", value: "REQUEST_BILL" },
  { label: "Assistance", value: "NEED_ASSISTANCE" },
];

function isResolved(status: ServiceRequestStatus): boolean {
  return status === "RESOLVED" || status === "COMPLETED";
}

function matchesStatus(req: ServiceRequest, filter: StatusFilter): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "ACTIVE":
      return req.status === "PENDING" || req.status === "ACKNOWLEDGED";
    case "RESOLVED_GROUP":
      return isResolved(req.status);
    default:
      return req.status === filter;
  }
}

const REQUEST_BADGE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  ACKNOWLEDGED: "bg-blue-50 text-blue-700 border-blue-200",
  COMPLETED: "bg-green-50 text-green-700 border-green-200",
  RESOLVED: "bg-green-50 text-green-700 border-green-200",
  CANCELLED: "bg-surface-50 text-ink-500 border-surface-200",
};

const REQUEST_DOT: Record<string, string> = {
  PENDING: "bg-amber-500",
  ACKNOWLEDGED: "bg-blue-500",
  COMPLETED: "bg-green-500",
  RESOLVED: "bg-green-500",
  CANCELLED: "bg-ink-400",
};

export default function OwnerServiceRequests() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? null;
  const { requests, loading, error, retry, changeStatus } =
    useRealtimeServiceRequests(restaurantId);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [typeFilter, setTypeFilter] = useState<ServiceRequestType | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "PENDING").length,
    [requests]
  );

  const visible = useMemo(() => {
    return requests
      .filter((r) => matchesStatus(r, statusFilter))
      .filter((r) => (typeFilter ? r.requestType === typeFilter : true))
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [requests, statusFilter, typeFilter]);

  async function handleAction(id: string, next: ServiceRequestStatus, label: string) {
    setBusyId(id);
    try {
      await changeStatus(id, next);
      toast.success(`Request ${label.toLowerCase()}`);
    } catch {
      toast.error("Failed to update request. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (!restaurantId) {
    return (
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card">
        <EmptyState
          icon={BellRing}
          title="No restaurant assigned"
          description="Service requests will appear here once your account is linked to a restaurant."
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="page-header !mb-0">
          <h1>Service requests</h1>
          <p aria-live="polite">
            {pendingCount > 0
              ? `${pendingCount} pending request${pendingCount > 1 ? "s" : ""} need${pendingCount > 1 ? "" : "s"} attention`
              : "All tables are currently clear"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0" role="status">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
          <span className="text-xs font-semibold text-ink-500">Live</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-2.5" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setStatusFilter(f.value)}
            aria-pressed={statusFilter === f.value}
            className="filter-pill"
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter by request type">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setTypeFilter(f.value)}
            aria-pressed={typeFilter === f.value}
            className="filter-pill"
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3" aria-label="Loading service requests">
          <div className="skeleton-shimmer rounded-2xl h-28 w-full" />
          <div className="skeleton-shimmer rounded-2xl h-28 w-full" />
          <div className="skeleton-shimmer rounded-2xl h-28 w-full" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card">
          <ErrorState message={error} onRetry={retry} />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card">
          <EmptyState
            icon={BellRing}
            title={
              statusFilter === "ACTIVE" || statusFilter === "ALL"
                ? "No active service requests"
                : `No ${STATUS_FILTERS.find((f) => f.value === statusFilter)?.label.toLowerCase()} requests`
            }
            description="All tables are currently clear. New requests from customers will appear here instantly."
          />
        </div>
      ) : (
        <div className="grid gap-3" role="log" aria-live="polite" aria-label="Service requests">
          {visible.map((req) => {
            const meta = SERVICE_REQUEST_TYPES[req.requestType];
            const RequestIcon = meta.Icon;
            const busy = busyId === req.id;
            const actionable = req.status === "PENDING" || req.status === "ACKNOWLEDGED";
            return (
              <article
                key={req.id}
                className="bg-white rounded-2xl border border-surface-200 shadow-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3.5"
              >
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div
                    className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <RequestIcon className="w-6 h-6 text-brand-700" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-bold tracking-tight text-[15px] text-ink-900">
                        {meta.label}
                      </h2>
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full font-semibold border whitespace-nowrap ${REQUEST_BADGE[req.status] ?? REQUEST_BADGE.CANCELLED}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${REQUEST_DOT[req.status] ?? REQUEST_DOT.CANCELLED} ${req.status === "PENDING" ? "animate-pulse" : ""}`}
                          aria-hidden="true"
                        />
                        {SERVICE_REQUEST_STATUS_LABELS[req.status]}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-ink-700 mt-1">
                      Table {req.tableNumber}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5 tabular-nums">
                      {formatRelativeTime(req.createdAt)} • {formatTime(req.createdAt)}
                    </p>
                  </div>
                </div>
                {actionable && (
                  <div className="flex sm:flex-col lg:flex-row gap-2 sm:ml-auto w-full sm:w-auto shrink-0">
                    {req.status === "PENDING" && (
                      <button
                        disabled={busy}
                        aria-busy={busy || undefined}
                        onClick={() => handleAction(req.id, "ACKNOWLEDGED", "Acknowledged")}
                        className="pressable flex-1 sm:flex-none px-4 py-2.5 min-h-[42px] rounded-xl bg-ink-900 text-white text-[13px] font-semibold hover:bg-ink-700 disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      disabled={busy}
                      aria-busy={busy || undefined}
                      onClick={() => handleAction(req.id, "RESOLVED", "Resolved")}
                      className="pressable flex-1 sm:flex-none px-4 py-2.5 min-h-[42px] rounded-xl bg-green-600 text-white text-[13px] font-semibold hover:bg-green-700 disabled:opacity-50"
                    >
                      Resolve
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => handleAction(req.id, "CANCELLED", "Cancelled")}
                      className="pressable flex-1 sm:flex-none px-4 py-2.5 min-h-[42px] rounded-xl border border-surface-200 text-[13px] font-semibold text-ink-500 hover:bg-surface-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
