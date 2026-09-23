import { useEffect, useState } from "react";
import { getRestaurant } from "../services/restaurantService";
import type { Restaurant } from "../types/restaurant";

export function useRestaurant(restaurantId?: string | null) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    getRestaurant(restaurantId)
      .then((r) => {
        if (!active) return;
        setRestaurant(r);
      })
      .catch(() => {
        if (active) setError("Unable to load restaurant");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [restaurantId]);

  return { restaurant, loading, error, setRestaurant };
}
