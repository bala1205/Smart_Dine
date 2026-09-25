import { z } from "zod";

export const registerSchema = z
  .object({
    fullName: z.string().min(2, "Full name is required"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
    restaurantName: z.string().min(2, "Restaurant name is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export const categorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
});

export const menuItemSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  description: z.string().optional().default(""),
  price: z.coerce.number().positive("Price must be greater than 0"),
  categoryId: z.string().min(1, "Category is required"),
  preparationTime: z.coerce.number().min(0, "Preparation time cannot be negative").default(0),
  trackStock: z.boolean().optional().default(false),
  stockEnabled: z.boolean().optional(),
  stockQuantity: z.coerce.number().min(0).optional().default(0),
  lowStockThreshold: z.coerce.number().min(0).optional().default(5),
});

export const tableSchema = z.object({
  tableNumber: z.coerce.number().positive("Table number must be greater than 0"),
  capacity: z.coerce.number().positive("Capacity must be greater than 0"),
});

export const staffSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const restaurantSchema = z.object({
  name: z.string().min(2, "Restaurant name is required"),
  description: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  gstPercent: z.coerce.number().min(0).max(100).default(0),
  serviceChargePercent: z.coerce.number().min(0).max(100).default(0),
});

export function fileValidation(file: File, maxMB = 2): string | null {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    return "Only JPG, PNG, WEBP or GIF images are allowed";
  }
  if (file.size > maxMB * 1024 * 1024) {
    return `Image must be smaller than ${maxMB}MB`;
  }
  return null;
}
