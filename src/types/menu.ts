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
  createdAt: number;
  updatedAt: number;
}
