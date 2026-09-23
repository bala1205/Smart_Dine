export type OrderStatus =
  | "PLACED"
  | "PREPARING"
  | "READY"
  | "SERVED"
  | "CANCELLED";

export interface OrderItem {
  id: string;
  menuItemId: string;
  itemName: string;
  price: number;
  quantity: number;
  specialInstruction: string;
  createdAt: number;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId: string;
  tableNumber: number;
  customerSessionId: string;
  status: OrderStatus;
  totalAmount: number;
  specialInstructions: string;
  trackingToken: string;
  qrToken?: string;
  createdAt: number;
  updatedAt: number;
  preparingAt?: number;
  readyAt?: number;
  servedAt?: number;
}

export const ORDER_STATUSES: OrderStatus[] = [
  "PLACED",
  "PREPARING",
  "READY",
  "SERVED",
  "CANCELLED",
];

export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED"],
  SERVED: [],
  CANCELLED: [],
};
