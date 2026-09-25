export type ServiceRequestType =
  | "CALL_WAITER"
  | "REQUEST_WATER"
  | "REQUEST_BILL"
  | "NEED_ASSISTANCE";

export type ServiceRequestStatus =
  | "PENDING"
  | "ACKNOWLEDGED"
  | "COMPLETED"
  | "RESOLVED"
  | "CANCELLED";

export interface ServiceRequest {
  id: string;
  restaurantId: string;
  tableId: string;
  tableNumber: number;
  requestType: ServiceRequestType;
  /** alias for requestType per new spec (type) */
  type?: ServiceRequestType;
  status: ServiceRequestStatus;
  customerSessionId: string;
  orderId?: string;
  createdAt: number;
  updatedAt: number;
}

export const SERVICE_REQUEST_TYPES: Record<
  ServiceRequestType,
  { label: string; icon: string; short: string }
> = {
  CALL_WAITER: { label: "Call Waiter", icon: "🔔", short: "Call Waiter" },
  REQUEST_WATER: { label: "Request Water", icon: "💧", short: "Water" },
  REQUEST_BILL: { label: "Request Bill", icon: "💵", short: "Bill" },
  NEED_ASSISTANCE: { label: "Need Assistance", icon: "🆘", short: "Assistance" },
};

export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  PENDING: "Pending",
  ACKNOWLEDGED: "Acknowledged",
  COMPLETED: "Completed",
  RESOLVED: "Completed",
  CANCELLED: "Cancelled",
};

export const VALID_SERVICE_REQUEST_TRANSITIONS: Record<
  ServiceRequestStatus,
  ServiceRequestStatus[]
> = {
  PENDING: ["ACKNOWLEDGED", "CANCELLED", "RESOLVED", "COMPLETED"],
  ACKNOWLEDGED: ["RESOLVED", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  RESOLVED: [],
  CANCELLED: [],
};
