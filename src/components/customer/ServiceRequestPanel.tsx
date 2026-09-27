import { useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { useCustomerServiceRequests } from "../../hooks/useServiceRequests";
import {
  SERVICE_REQUEST_TYPES,
  SERVICE_REQUEST_STATUS_LABELS,
} from "../../types/serviceRequest";
import type { ServiceRequestType } from "../../types/serviceRequest";

const REQUESTS: { type: ServiceRequestType; desc: string }[] = [
  { type: "CALL_WAITER", desc: "Call Waiter" },
  { type: "REQUEST_WATER", desc: "Request Water" },
  { type: "REQUEST_BILL", desc: "Request Bill" },
  { type: "NEED_ASSISTANCE", desc: "Need Assistance" },
];

const SUCCESS_MESSAGES: Record<ServiceRequestType, string> = {
  CALL_WAITER: "Waiter has been notified",
  REQUEST_WATER: "Water request sent",
  REQUEST_BILL: "Bill request sent",
  NEED_ASSISTANCE: "Assistance request sent",
};

export default function ServiceRequestPanel({
  restaurantId,
  tableId,
  tableNumber,
  orderId,
}: {
  restaurantId: string;
  tableId: string;
  tableNumber: number;
  orderId?: string;
}) {
  const { requests, create } = useCustomerServiceRequests(restaurantId, tableId);
  const [busy, setBusy] = useState<ServiceRequestType | null>(null);

  const pendingByType = new Map(requests.filter((r) => r.status === "PENDING").map((r) => [r.requestType, r]));

  async function handle(type: ServiceRequestType) {
    if (pendingByType.has(type)) {
      toast.info("You already have a pending request for this. Staff will respond shortly.");
      return;
    }
    setBusy(type);
    try {
      await create({ restaurantId, tableId, tableNumber, requestType: type, orderId });
      toast.success(`✓ ${SUCCESS_MESSAGES[type]} — Table ${tableNumber}`);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "Failed to send request. Please try again.";
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }

  const recent = requests.slice(0, 3);

  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-4 sm:p-5 mb-4" aria-live="polite">
      <h3 className="font-bold tracking-tight text-[15px] text-ink-900 mb-3 flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0" aria-hidden="true">
          <BellRing className="w-4 h-4 text-brand-700" />
        </span>
        Need service?
      </h3>
      <div className="grid grid-cols-2 gap-2.5">
        {REQUESTS.map((r) => {
          const meta = SERVICE_REQUEST_TYPES[r.type];
          const RequestIcon = meta.Icon;
          const isPending = pendingByType.has(r.type);
          const isBusy = busy === r.type;
          return (
            <button
              key={r.type}
              onClick={() => handle(r.type)}
              disabled={isBusy || isPending}
              aria-pressed={isPending}
              aria-busy={isBusy || undefined}
              className={`pressable p-3 min-h-[84px] rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 ${
                isPending
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-surface-50 border-surface-200 hover:bg-white hover:border-surface-300 text-ink-700"
              } disabled:cursor-not-allowed ${isBusy ? "opacity-70" : ""} ${isPending ? "opacity-90" : ""}`}
            >
              <RequestIcon className="w-5 h-5" aria-hidden="true" strokeWidth={1.75} />
              <span className="text-[13px] font-semibold leading-tight">{meta.label}</span>
              {isPending && <span className="text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Pending</span>}
              {isBusy && <span className="text-xs text-ink-400">Sending...</span>}
            </button>
          );
        })}
      </div>
      {recent.length > 0 && (
        <div className="mt-4 border-t border-surface-100 pt-3">
          <p className="text-xs font-semibold text-ink-500 mb-2">Recent requests</p>
          <div className="space-y-2">
            {recent.map((req) => {
              const RecentIcon = SERVICE_REQUEST_TYPES[req.requestType].Icon;
              return (
                <div key={req.id} className="flex items-center justify-between gap-2 text-sm bg-surface-50 border border-surface-100 rounded-xl px-3 py-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <RecentIcon className="w-4 h-4 text-ink-400 shrink-0" aria-hidden="true" />
                    <span className="font-medium text-ink-700 truncate">{SERVICE_REQUEST_TYPES[req.requestType].label}</span>
                  </span>
                  <span
                    className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold border ${
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
              );
            })}
          </div>
        </div>
      )}
      <p className="text-xs text-ink-400 mt-3 text-center">Staff will be notified instantly. Avoid duplicate taps.</p>
    </div>
  );
}
