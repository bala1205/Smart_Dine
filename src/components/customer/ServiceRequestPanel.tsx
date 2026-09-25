import { useState } from "react";
import { toast } from "sonner";
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
      toast.success(`${SERVICE_REQUEST_TYPES[type].label} sent! Staff has been notified.`);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "Failed to send request";
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }

  const recent = requests.slice(0, 3);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <span>🔔</span> Need Service?
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {REQUESTS.map((r) => {
          const meta = SERVICE_REQUEST_TYPES[r.type];
          const isPending = pendingByType.has(r.type);
          const isBusy = busy === r.type;
          return (
            <button
              key={r.type}
              onClick={() => handle(r.type)}
              disabled={isBusy}
              className={`p-3 rounded-xl border text-center transition-colors flex flex-col items-center gap-1 ${
                isPending
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-gray-50 border-gray-200 hover:bg-brand-50 hover:border-brand-200 text-gray-700"
              } disabled:opacity-60`}
            >
              <span className="text-2xl">{meta.icon}</span>
              <span className="text-sm font-medium">{meta.label}</span>
              {isPending && <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">Pending</span>}
              {isBusy && <span className="text-xs text-gray-400">Sending...</span>}
            </button>
          );
        })}
      </div>
      {recent.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Recent Requests</p>
          <div className="space-y-2">
            {recent.map((req) => (
              <div key={req.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                <span className="flex items-center gap-2">
                  <span>{SERVICE_REQUEST_TYPES[req.requestType].icon}</span>
                  <span className="font-medium">{SERVICE_REQUEST_TYPES[req.requestType].label}</span>
                </span>
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
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3 text-center">Staff will be notified instantly. Avoid duplicate taps.</p>
    </div>
  );
}
