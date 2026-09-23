import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { MenuCategory, MenuItem } from "../types/menu";

function catCol(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "categories");
}

function itemCol(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "menuItems");
}

export async function getCategories(restaurantId: string): Promise<MenuCategory[]> {
  const q = query(catCol(restaurantId), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuCategory, "id">) }));
}

export async function addCategory(restaurantId: string, name: string, displayOrder: number) {
  const ref = doc(catCol(restaurantId));
  return setDoc(ref, {
    name,
    displayOrder,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCategory(
  restaurantId: string,
  categoryId: string,
  data: Partial<MenuCategory>
) {
  return updateDoc(doc(catCol(restaurantId), categoryId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCategory(restaurantId: string, categoryId: string) {
  return deleteDoc(doc(catCol(restaurantId), categoryId));
}

export async function getMenuItems(restaurantId: string): Promise<MenuItem[]> {
  const q = query(itemCol(restaurantId), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuItem, "id">) }));
}

export async function getMenuItemsByCategory(
  restaurantId: string,
  categoryId: string
): Promise<MenuItem[]> {
  const q = query(itemCol(restaurantId), where("categoryId", "==", categoryId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuItem, "id">) }));
}

export async function addMenuItem(
  restaurantId: string,
  data: Omit<MenuItem, "id" | "createdAt" | "updatedAt">
) {
  const ref = doc(itemCol(restaurantId));
  return setDoc(ref, {
    ...data,
    isAvailable: data.isAvailable ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateMenuItem(
  restaurantId: string,
  menuItemId: string,
  data: Partial<MenuItem>
) {
  return updateDoc(doc(itemCol(restaurantId), menuItemId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMenuItem(restaurantId: string, menuItemId: string) {
  return deleteDoc(doc(itemCol(restaurantId), menuItemId));
}

export async function getMenuItem(
  restaurantId: string,
  menuItemId: string
): Promise<MenuItem | null> {
  const snap = await getDoc(doc(itemCol(restaurantId), menuItemId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<MenuItem, "id">) };
}
