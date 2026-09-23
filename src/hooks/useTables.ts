import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Table } from "../types/table";

export default function useTables(restaurantId?: string | null) {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      query(
        collection(db, "restaurants", restaurantId, "tables"),
        orderBy("tableNumber", "asc")
      ),
      (snap) => {
        setTables(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Table, "id">) }))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [restaurantId]);

  return { tables, loading };
}
