import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import type { StaffMember } from "../types/restaurant";

function staffCol(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "staff");
}

export async function getStaff(restaurantId: string): Promise<StaffMember[]> {
  const q = query(staffCol(restaurantId), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StaffMember, "id">) }));
}

export async function createKitchenStaff(input: {
  restaurantId: string;
  fullName: string;
  email: string;
  password: string;
}): Promise<void> {
  const cred = await createUserWithEmailAndPassword(auth, input.email, input.password);
  const uid = cred.user.uid;
  const staffRef = doc(staffCol(input.restaurantId));
  const userRef = doc(db, "users", uid);
  await setDoc(
    staffRef,
    {
      uid,
      fullName: input.fullName,
      email: input.email,
      role: "KITCHEN",
      isActive: true,
      createdAt: serverTimestamp(),
    }
  );
  await setDoc(
    userRef,
    {
      uid,
      fullName: input.fullName,
      email: input.email,
      role: "KITCHEN",
      restaurantId: input.restaurantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function setStaffActive(
  restaurantId: string,
  staffId: string,
  isActive: boolean
) {
  return updateDoc(doc(staffCol(restaurantId), staffId), { isActive });
}
