import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  collection,
  where,
  getDocs,
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { db, auth } from "../lib/firebase";
import type { Restaurant } from "../types/restaurant";
import type { UserProfile } from "../types/auth";
import { createUserProfile } from "./authService";

export async function createRestaurantAndProfile(data: {
  fullName: string;
  email: string;
  password: string;
  restaurantName: string;
}): Promise<{ restaurantId: string; restaurantName: string }> {
  const userCred = await createUserWithEmailAndPassword(
    auth,
    data.email,
    data.password
  );
  const uid = userCred.user.uid;

  const restaurantId = doc(collection(db, "restaurants")).id;
  const restaurantRef = doc(db, "restaurants", restaurantId);

  const restaurant: Omit<Restaurant, "id"> = {
    name: data.restaurantName,
    description: "",
    logoUrl: "",
    phone: "",
    address: "",
    ownerId: uid,
    isActive: true,
    gstPercent: 0,
    serviceChargePercent: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  // Must create the restaurant BEFORE the user profile so the "owner exists"
  // rule can resolve the restaurant owner in subsequent writes.
  await setDoc(restaurantRef, {
    ...restaurant,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const profile: UserProfile = {
    uid,
    fullName: data.fullName,
    email: data.email,
    role: "OWNER",
    restaurantId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await createUserProfile(profile);

  return { restaurantId, restaurantName: data.restaurantName };
}

/**
 * Recovery for the orphaned-account scenario: the caller is an ALREADY
 * authenticated Firebase user (so no new Auth user is created) whose Firestore
 * `users/{uid}` profile and/or owner restaurant is missing (e.g. from an
 * earlier registration that failed after the Auth user was created).
 *
 * This only ever creates a restaurant/profile that does not already exist; it
 * never creates a duplicate. Order is preserved (restaurant before profile) so
 * the existing Firestore rules validate without any changes.
 */
export async function createOwnerSetup(data: {
  uid: string;
  email: string;
  fullName: string;
  restaurantName: string;
}): Promise<{
  restaurantId: string;
  restaurantCreated: boolean;
  profileCreated: boolean;
}> {
  const existing = await getDocs(
    query(
      collection(db, "restaurants"),
      where("ownerId", "==", data.uid)
    )
  );

  let restaurantId: string;
  let restaurantCreated = false;
  if (!existing.empty) {
    restaurantId = existing.docs[0].id;
  } else {
    restaurantId = doc(collection(db, "restaurants")).id;
    const restaurant: Omit<Restaurant, "id"> = {
      name: data.restaurantName,
      description: "",
      logoUrl: "",
      phone: "",
      address: "",
      ownerId: data.uid,
      isActive: true,
      gstPercent: 0,
      serviceChargePercent: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setDoc(doc(db, "restaurants", restaurantId), {
      ...restaurant,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    restaurantCreated = true;
  }

  const profileSnap = await getDoc(doc(db, "users", data.uid));
  let profileCreated = false;
  if (!profileSnap.exists()) {
    const profile: UserProfile = {
      uid: data.uid,
      fullName: data.fullName,
      email: data.email,
      role: "OWNER",
      restaurantId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await createUserProfile(profile);
    profileCreated = true;
  }

  return { restaurantId, restaurantCreated, profileCreated };
}

export async function getRestaurant(restaurantId: string): Promise<Restaurant | null> {  const snap = await getDoc(doc(db, "restaurants", restaurantId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Restaurant, "id">) };
}

export async function updateRestaurant(
  restaurantId: string,
  data: Partial<Restaurant>
) {
  const ref = doc(db, "restaurants", restaurantId);
  return updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}
