export interface MenuCategory {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  imageUrl: string;
  preparationTime: number;
  isAvailable: boolean;
  trackStock: boolean;
  /** alias for trackStock per new spec */
  stockEnabled?: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  createdAt: number;
  updatedAt: number;
}
