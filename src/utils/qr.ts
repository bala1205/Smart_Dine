import QRCode from "qrcode";
import type { Table } from "../types/table";

export function tableMenuUrl(restaurantId: string, table: Table): string {
  const base = (import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/+$/, "");
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
