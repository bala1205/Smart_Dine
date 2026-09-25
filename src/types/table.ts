export interface Table {
  id: string;
  tableNumber: number;
  capacity: number;
  qrToken: string;
  isActive: boolean;
  isAccessAvailable?: boolean;
  createdAt: number;
  updatedAt: number;
}
