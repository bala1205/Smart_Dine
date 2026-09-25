export interface Restaurant {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
  phone: string;
  address: string;
  ownerId: string;
  isActive: boolean;
  gstPercent: number;
  serviceChargePercent: number;
  createdAt: number;
  updatedAt: number;
}

export interface StaffMember {
  id: string;
  uid: string;
  fullName: string;
  email: string;
  role: "KITCHEN" | "WAITER";
  isActive: boolean;
  createdAt: number;
}
