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
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from "firebase/auth";
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, db } from "../lib/firebase";
import type { StaffMember } from "../types/restaurant";

function staffCol(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "staff");
}

export async function getStaff(restaurantId: string): Promise<StaffMember[]> {
  const q = query(staffCol(restaurantId), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StaffMember, "id">) }));
}

/**
 * Secondary Firebase Auth instance — used only for creating staff without
 * switching the primary owner's session. Created lazily and reused.
 */
function getSecondaryAuth() {
  const secondaryName = "secondary-staff-creator";
  const existing = getApps().find((a) => a.name === secondaryName);
  if (existing) return getAuth(existing);
  const primary = getApp();
  const secondaryApp = initializeApp(primary.options, secondaryName);
  return getAuth(secondaryApp);
}

/**
 * Try the secure Cloud Function first (does not affect local auth).
 * Returns true if it handled the request (success or intentional error).
 * Throws only for intentional business errors (already-exists, permission, etc.)
 * that should not fall back.
 */
async function tryCreateViaFunction(input: {
  restaurantId: string;
  fullName: string;
  email: string;
  password: string;
  role: "KITCHEN" | "WAITER";
}): Promise<boolean> {
  try {
    const functions = getFunctions(app);
    const fn = httpsCallable(functions, "createStaff");
    await fn(input);
    return true;
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const code = (err?.code || "").toLowerCase();
    // Signals that function is not deployed / unreachable — fallback to secondary app
    const isNotDeployed =
      code.includes("not-found") ||
      code.includes("unavailable") ||
      code.includes("internal") ||
      code.includes("functions/not-found") ||
      code === "not-found" ||
      err?.message?.toLowerCase().includes("not found") ||
      err?.message?.toLowerCase().includes("does not exist");
    // If function exists but denied due to business logic, do not fallback — rethrow meaningful error
    if (
      code.includes("already-exists") ||
      code.includes("permission-denied") ||
      code.includes("unauthenticated") ||
      code.includes("invalid-argument")
    ) {
      throw e;
    }
    // For "not deployed" signals we indicate fallback is allowed
    if (isNotDeployed) return false;
    // For other transient errors (network, etc.) still try fallback to keep Spark working
    // but log for debugging
    if (
      code.includes("failed-precondition") ||
      code.includes("cancelled") ||
      code.includes("deadline-exceeded")
    ) {
      return false;
    }
    return false;
  }
}

async function createViaSecondaryApp(input: {
  restaurantId: string;
  fullName: string;
  email: string;
  password: string;
  role: "KITCHEN" | "WAITER";
}): Promise<void> {
  const secondaryAuth = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(
    secondaryAuth,
    input.email,
    input.password
  );
  // On some SDK versions the secondary user may briefly be set; ensure primary auth still owner.
  // No signOut on secondary needed — we just keep it.

  const uid = cred.user.uid;
  const staffRef = doc(staffCol(input.restaurantId));
  const userRef = doc(db, "users", uid);

  // These writes are authenticated as the **owner** (primary auth), not the new staff,
  // because `db` is tied to the primary app's auth. That matches firestore.rules
  // `isOwnerOf(restaurantId)` checks (request.auth.uid == ownerId).
  await setDoc(staffRef, {
    uid,
    fullName: input.fullName,
    email: input.email,
    role: input.role,
    isActive: true,
    createdAt: serverTimestamp(),
  });
  await setDoc(userRef, {
    uid,
    fullName: input.fullName,
    email: input.email,
    role: input.role,
    restaurantId: input.restaurantId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Best-effort sign out the secondary session to avoid leaking credentials in memory
  try {
    await signOut(secondaryAuth);
  } catch {
    // ignore
  }
}

export async function createKitchenStaff(input: {
  restaurantId: string;
  fullName: string;
  email: string;
  password: string;
}): Promise<void> {
  return createStaffWithRole({ ...input, role: "KITCHEN" });
}

export async function createWaiterStaff(input: {
  restaurantId: string;
  fullName: string;
  email: string;
  password: string;
}): Promise<void> {
  return createStaffWithRole({ ...input, role: "WAITER" });
}

export async function createStaffWithRole(input: {
  restaurantId: string;
  fullName: string;
  email: string;
  password: string;
  role: "KITCHEN" | "WAITER";
}): Promise<void> {
  // Preferred: secure Cloud Function (Admin SDK, owner stays signed in)
  const handledViaFunction = await tryCreateViaFunction(input);
  if (handledViaFunction) return;
  // Fallback: secondary-app (Spark plan, no functions) — still keeps owner signed in
  await createViaSecondaryApp(input);
}

export async function setStaffActive(
  restaurantId: string,
  staffId: string,
  isActive: boolean
) {
  return updateDoc(doc(staffCol(restaurantId), staffId), { isActive });
}
