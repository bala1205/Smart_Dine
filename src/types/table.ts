export interface Table {
  id: string;
  tableNumber: number;
  capacity: number;
  qrToken: string;
  isActive: boolean;
  isAccessAvailable?: boolean;
  /** Single-session occupancy claim: browser session currently holding the table. Absent = no claim. */
  occupiedBy?: string;
  /** Most recent order that established the claim. Absent = no claim. */
  currentOrderId?: string;
  createdAt: number;
  updatedAt: number;
}
