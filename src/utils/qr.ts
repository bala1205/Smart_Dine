import QRCode from "qrcode";
import type { Table } from "../types/table";

function publicBase(): string {
  const envBase =
    (import.meta.env.VITE_PUBLIC_URL as string | undefined) || undefined;
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";
  return (envBase || origin).replace(/\/+$/, "");
}

export function tableMenuUrl(restaurantId: string, table: Table): string {
  const base = publicBase();
  const path = `/menu/${restaurantId}/${table.id}?token=${table.qrToken}`;
  return `${base}${path}`;
}

export async function generateQRDataUrl(
  restaurantId: string,
  table: Table
): Promise<string> {
  const url = tableMenuUrl(restaurantId, table);
  return QRCode.toDataURL(url, { width: 256, margin: 2, errorCorrectionLevel: "H" });
}

export async function downloadQR(
  restaurantId: string,
  table: Table,
  restaurantName: string
): Promise<void> {
  const dataUrl = await generateQRDataUrl(restaurantId, table);
  const link = document.createElement("a");
  link.href = dataUrl;
  const safeName = restaurantName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  link.download = `smart-dine-table-${table.tableNumber}-${safeName}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ---------- Table Check (restaurant-level entrance QR) ----------
// Stable, table-agnostic: /table-check/{restaurantId}. No tableId, no token,
// no secrets — it only opens the public welcome/availability flow. Existing
// per-table QR tokens are never touched by this path.

export function tableCheckUrl(restaurantId: string): string {
  return `${publicBase()}/table-check/${restaurantId}`;
}

export async function generateTableCheckQRDataUrl(
  restaurantId: string
): Promise<string> {
  return QRCode.toDataURL(tableCheckUrl(restaurantId), {
    width: 256,
    margin: 2,
    errorCorrectionLevel: "H",
  });
}

export async function downloadTableCheckQR(
  restaurantId: string,
  restaurantName: string
): Promise<void> {
  const dataUrl = await generateTableCheckQRDataUrl(restaurantId);
  const link = document.createElement("a");
  link.href = dataUrl;
  const safeName = (restaurantName || "restaurant").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  link.download = `smart-dine-table-check-${safeName}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
