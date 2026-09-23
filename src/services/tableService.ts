import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Table } from "../types/table";

function tableCol(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "tables");
}

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getTables(restaurantId: string): Promise<Table[]> {
  const q = query(tableCol(restaurantId), orderBy("tableNumber", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Table, "id">) }));
}

export async function getTable(
  restaurantId: string,
  tableId: string
): Promise<Table | null> {
  const snap = await getDoc(doc(tableCol(restaurantId), tableId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Table, "id">) };
}

export async function addTable(
  restaurantId: string,
  data: { tableNumber: number; capacity: number }
) {
  const ref = doc(tableCol(restaurantId));
  const qrToken = generateToken();
  return setDoc(ref, {
    tableNumber: data.tableNumber,
    capacity: data.capacity,
    qrToken,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateTable(
  restaurantId: string,
  tableId: string,
  data: Partial<Table>
) {
  return updateDoc(doc(tableCol(restaurantId), tableId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function regenerateTableToken(restaurantId: string, tableId: string) {
  const qrToken = generateToken();
  return updateTable(restaurantId, tableId, { qrToken });
}

export async function deleteTable(restaurantId: string, tableId: string) {
  return deleteDoc(doc(tableCol(restaurantId), tableId));
}
