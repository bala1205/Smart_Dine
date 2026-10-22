import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

let guestDb: Firestore | null = null;

/**
 * Unauthenticated Firestore handle for customer-facing reads.
 *
 * The guest table-selection flow may run in a browser that still has a staff
 * Firebase session (same browser, different tab). Order tracking-token reads
 * are only allowed for `request.auth == null`, so using the default `db` there
 * would return permission-denied. A secondary app guarantees a guest context
 * without weakening the security rules.
 */
export function getGuestDb(): Firestore {
  if (!guestDb) {
    const guestApp =
      getApps().find((candidate) => candidate.name === "smartdine-guest") ??
      initializeApp(app.options, "smartdine-guest");
    guestDb = getFirestore(guestApp);
  }
  return guestDb;
}
