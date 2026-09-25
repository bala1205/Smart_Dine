import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  categorySchema,
  menuItemSchema,
  tableSchema,
  staffSchema,
  restaurantSchema,
  fileValidation,
} from "./validation";

describe("registerSchema", () => {
  it("passes valid data", () => {
    const r = registerSchema.safeParse({
      fullName: "John Doe",
      email: "john@example.com",
      password: "secret123",
      confirmPassword: "secret123",
      restaurantName: "Spice Garden",
    });
    expect(r.success).toBe(true);
  });
  it("fails when passwords mismatch", () => {
    const r = registerSchema.safeParse({
      fullName: "John Doe",
      email: "john@example.com",
      password: "secret123",
      confirmPassword: "other",
      restaurantName: "Spice",
    });
    expect(r.success).toBe(false);
  });
  it("fails with weak password", () => {
    const r = registerSchema.safeParse({
      fullName: "Jo",
      email: "bad",
      password: "123",
      confirmPassword: "123",
      restaurantName: "",
    });
    expect(r.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("validates email", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "bad", password: "x" }).success).toBe(false);
  });
});

describe("categorySchema", () => {
  it("requires name", () => {
    expect(categorySchema.safeParse({ name: "" }).success).toBe(false);
    expect(categorySchema.safeParse({ name: "Biriyani" }).success).toBe(true);
  });
});

describe("menuItemSchema", () => {
  it("validates price positive", () => {
    expect(menuItemSchema.safeParse({ name: "Item", price: 0, categoryId: "c1" }).success).toBe(false);
    expect(menuItemSchema.safeParse({ name: "Item", price: 10, categoryId: "c1" }).success).toBe(true);
  });
  it("requires category", () => {
    expect(menuItemSchema.safeParse({ name: "Item", price: 10, categoryId: "" }).success).toBe(false);
  });
});

describe("tableSchema", () => {
  it("validates positive numbers", () => {
    expect(tableSchema.safeParse({ tableNumber: 1, capacity: 4 }).success).toBe(true);
    expect(tableSchema.safeParse({ tableNumber: 0, capacity: 4 }).success).toBe(false);
  });
});

describe("staffSchema", () => {
  it("requires 6+ password", () => {
    expect(staffSchema.safeParse({ fullName: "Staff", email: "s@a.com", password: "12345" }).success).toBe(false);
    expect(staffSchema.safeParse({ fullName: "Staff One", email: "s@a.com", password: "123456" }).success).toBe(true);
  });
});

describe("restaurantSchema", () => {
  it("validates GST 0-100", () => {
    expect(restaurantSchema.safeParse({ name: "My Restaurant", gstPercent: 5, serviceChargePercent: 5 }).success).toBe(true);
    expect(restaurantSchema.safeParse({ name: "My Restaurant", gstPercent: 200 }).success).toBe(false);
  });
});

describe("fileValidation", () => {
  it("rejects non-image", () => {
    const file = { type: "text/plain", size: 100 } as File;
    expect(fileValidation(file)).toContain("Only JPG");
  });
  it("rejects too large", () => {
    const file = { type: "image/png", size: 3 * 1024 * 1024 } as File;
    expect(fileValidation(file)).toContain("smaller than");
  });
  it("passes valid", () => {
    const file = { type: "image/jpeg", size: 100 * 1024 } as File;
    expect(fileValidation(file)).toBeNull();
  });
});
