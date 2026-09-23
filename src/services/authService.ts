import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { UserProfile, UserRole } from "../types/auth";

export async function loginUser(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logoutUser() {
  return signOut(auth);
}

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export function createUserProfile(profile: UserProfile) {
  const ref = doc(db, "users", profile.uid);
  return setDoc(ref, {
    uid: profile.uid,
    fullName: profile.fullName,
    email: profile.email,
    role: profile.role,
    restaurantId: profile.restaurantId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateUserRole(uid: string, role: UserRole, restaurantId: string) {
  const ref = doc(db, "users", uid);
  return setDoc(
    ref,
    {
      role,
      restaurantId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Maps a raw Firebase error (Auth or Firestore) to a safe, user-friendly message.
 * The full original error is still logged to the console by the caller for
 * development, so the real `code`/`message` is never hidden.
 */
export function getRegistrationErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code || "";
  switch (code) {
    case "auth/email-already-in-use":
      return "This email is already registered. Please log in instead.";
    case "auth/invalid-email":
      return "That email address is not valid.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is not enabled in your Firebase project.";
    case "auth/network-request-failed":
      return "Unable to connect to Firebase. Check your internet connection and try again.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/configuration-not-found":
      return "Firebase is not configured for this project/domain. Check the Firebase Console.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/internal-error":
      return "A temporary authentication error occurred. Please try again.";
    case "permission-denied":
      return "Permission denied while creating your restaurant. The Firestore security rules may not be deployed to your project yet.";
    case "failed-precondition":
      return "Unable to complete registration. A required Firebase service may not be ready yet.";
    default:
      return "Unable to create account. Please try again.";
  }
}
