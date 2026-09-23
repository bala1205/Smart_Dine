import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { app } from "../lib/firebase";

let storageInstance: ReturnType<typeof getStorage> | null = null;
let checked = false;

export function isStorageAvailable(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET);
}

function getLazyStorage() {
  if (!isStorageAvailable()) return null;
  if (checked) return storageInstance;
  checked = true;
  try {
    storageInstance = getStorage(app);
  } catch {
    storageInstance = null;
  }
  return storageInstance;
}

export function uploadFile(
  path: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const storage = getLazyStorage();

  if (!storage) {
    return Promise.reject(
      new Error(
        "Firebase Storage is not enabled for this project (Spark plan). Image upload is skipped; the item/settings will be saved without an image."
      )
    );
  }

  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) {
          const percent = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          onProgress(percent);
        }
      },
      (error) => reject(error),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });
}

export function restaurantLogoPath(restaurantId: string, fileName: string): string {
  const ext = fileName.split(".").pop() || "png";
  return `restaurants/${restaurantId}/logo/logo-${Date.now()}.${ext}`;
}

export function menuImagePath(restaurantId: string, fileName: string): string {
  const ext = fileName.split(".").pop() || "png";
  return `restaurants/${restaurantId}/menu/menu-${Date.now()}.${ext}`;
}
