export function getOrCreateSessionId(): string {
  const key = "smartdine_customer_session";
  let id = sessionStorage.getItem(key);
  if (!id) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function getRestaurantContext(): {
  restaurantId: string | null;
  tableId: string | null;
  qrToken: string | null;
} {
  const rid = sessionStorage.getItem("smartdine_restaurant_id");
  const tid = sessionStorage.getItem("smartdine_table_id");
  const token = sessionStorage.getItem("smartdine_qr_token");
  return { restaurantId: rid, tableId: tid, qrToken: token };
}

export function setRestaurantContext(restaurantId: string, tableId: string, qrToken?: string) {
  sessionStorage.setItem("smartdine_restaurant_id", restaurantId);
  sessionStorage.setItem("smartdine_table_id", tableId);
  if (qrToken) {
    sessionStorage.setItem("smartdine_qr_token", qrToken);
  }
}

export function clearRestaurantContext() {
  sessionStorage.removeItem("smartdine_restaurant_id");
  sessionStorage.removeItem("smartdine_table_id");
  sessionStorage.removeItem("smartdine_qr_token");
}
