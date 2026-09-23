export type UserRole = "OWNER" | "KITCHEN";

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  restaurantId: string;
  createdAt: number;
  updatedAt: number;
}
