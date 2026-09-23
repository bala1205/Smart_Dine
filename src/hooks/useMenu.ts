import { useEffect, useState } from "react";
import { onSnapshot, query, orderBy, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { MenuCategory, MenuItem } from "../types/menu";

function catsRef(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "categories");
}

function itemsRef(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "menuItems");
}

export function useMenu(restaurantId?: string | null) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) {
      setCategories([]);
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Realtime subscription so the category dropdown (and any consumer of this
    // hook) always reflects the current Firestore data, including categories
    // created after this page first loaded.
    const catsUnsub = onSnapshot(
      query(catsRef(restaurantId), orderBy("displayOrder", "asc")),
      (snap) => {
        setCategories(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuCategory, "id">) }))
        );
      },
      () => setError("Unable to load menu")
    );

    const itemsUnsub = onSnapshot(
      query(itemsRef(restaurantId), orderBy("name", "asc")),
      (snap) => {
        setItems(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuItem, "id">) }))
        );
      },
      () => setError("Unable to load menu")
    );

    setLoading(false);

    return () => {
      catsUnsub();
      itemsUnsub();
    };
  }, [restaurantId]);

  return { categories, items, loading, error, setCategories, setItems };
}
