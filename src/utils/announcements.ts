import type { MenuItem } from "../types/menu";
import type { OrderIntent } from "../types/aiOrder";
import { formatCurrency } from "./formatting";

/**
 * Single source of truth for customer-facing spoken/written status strings.
 * Visual UI and screen-reader announcements share these builders so both
 * always carry the same facts from the SAME Firestore menu document — never
 * AI-guessed names, prices, or availability. Pure — unit tested.
 */

function rupees(price: number): string {
  const n = Number.isFinite(price) ? Math.round(price) : 0;
  return `${n} rupees`;
}

function itemPrice(item: MenuItem): number {
  return Number.isFinite(item.price) ? item.price : 0;
}

export function menuItemAvailability(item: MenuItem): {
  available: boolean;
  stockRemaining: number | null;
} {
  const enabled = item.trackStock === true || item.stockEnabled === true;
  const qty = Number(item.stockQuantity);
  const stockRemaining = enabled && Number.isFinite(qty) ? qty : null;
  const available = item.isAvailable === true && (stockRemaining == null || stockRemaining > 0);
  return { available, stockRemaining };
}

/** "Hyderabadi Chicken Dum Biriyani. 280 rupees. Available." */
export function formatMenuItemAnnouncement(item: MenuItem): string {
  const { available, stockRemaining } = menuItemAvailability(item);
  if (!available) return `${item.name}. ${rupees(itemPrice(item))}. Currently unavailable.`;
  if (stockRemaining != null) {
    return `${item.name}. ${rupees(itemPrice(item))}. Available. ${stockRemaining} remaining.`;
  }
  return `${item.name}. ${rupees(itemPrice(item))}. Available.`;
}

/** "7 menu items found for biriyani." / "No menu items found for …" */
export function formatSearchAnnouncement(count: number, query: string): string {
  const q = query.trim();
  if (!q) return "";
  if (count <= 0) return `No menu items found for ${q}.`;
  return `${count} menu item${count === 1 ? "" : "s"} found for ${q}.`;
}

/** Voice LISTENING / UNDERSTANDING states. */
export function formatVoiceStateAnnouncement(
  state: "LISTENING" | "UNDERSTANDING" | "PROCESSING"
): string {
  if (state === "LISTENING") return "Listening. Please tell me what you would like to order.";
  if (state === "UNDERSTANDING") return "Understanding your order.";
  return "Processing your speech.";
}

function intentLine(
  it: OrderIntent["items"][number],
  menu: MenuItem[]
): { name: string; qty: number; each: number; total: number } | null {
  const m = menu.find((x) => x.id === it.menuItemId);
  if (!m) return null;
  const each = itemPrice(m);
  return { name: m.name, qty: it.quantity, each, total: each * it.quantity };
}

/**
 * "I found Hyderabadi Chicken Dum Biriyani. Quantity 2. Price 280 rupees
 * each. Your total is 560 rupees. Note: medium spicy, no onion. Would you
 * like me to add it to your cart?"
 */
export function formatVoiceMatchAnnouncement(
  intent: OrderIntent,
  menu: MenuItem[]
): string {
  const lines = intent.items
    .map((it) => intentLine(it, menu))
    .filter((l): l is NonNullable<typeof l> => l != null);
  if (lines.length === 0) return formatNoMatchAnnouncement();
  const total = lines.reduce((s, l) => s + l.total, 0);
  const parts = lines.map(
    (l) =>
      `I found ${l.name}. Quantity ${l.qty}. Price ${rupees(l.each)} each. Your total is ${rupees(total)}.`
  );
  const notes = intent.notes?.trim();
  if (notes) parts.push(`Note: ${notes}.`);
  parts.push(
    lines.length === 1
      ? "Would you like me to add it to your cart?"
      : "Would you like me to add them to your cart?"
  );
  return parts.join(" ");
}

/** "Please confirm: add 2 Hyderabadi … to your cart for 560 rupees." */
export function formatConfirmationAnnouncement(
  intent: OrderIntent,
  menu: MenuItem[]
): string {
  const lines = intent.items
    .map((it) => intentLine(it, menu))
    .filter((l): l is NonNullable<typeof l> => l != null);
  if (lines.length === 0) return formatNoMatchAnnouncement();
  const total = lines.reduce((s, l) => s + l.total, 0);
  const what =
    lines.length === 1
      ? `add ${lines[0].qty} ${lines[0].name}`
      : `add ${lines.length} items (${lines.map((l) => `${l.qty} ${l.name}`).join(", ")})`;
  return `Please confirm: ${what} to your cart for ${rupees(total)}.`;
}

/** "Added 2 Hyderabadi … to your cart. Your cart total is 560 rupees." */
export function formatAddedAnnouncement(
  added: Array<{ name: string; quantity: number }>,
  cartTotal: number
): string {
  if (added.length === 0) return "Nothing was added to your cart.";
  const what =
    added.length === 1
      ? `${added[0].quantity} ${added[0].name}`
      : `${added.length} items`;
  return `Added ${what} to your cart. Your cart total is ${rupees(cartTotal)}.`;
}

/** "I found multiple biriyani options: 1. A, 2. B. Please choose one." */
export function formatAmbiguousAnnouncement(
  query: string,
  options: Array<{ name: string }>
): string {
  if (options.length === 0) return formatNoMatchAnnouncement();
  const list = options
    .slice(0, 5)
    .map((o, i) => `${i + 1}. ${o.name}`)
    .join(", ");
  const forWhat = query.trim() ? ` for ${query.trim()}` : "";
  return `I found multiple options${forWhat}: ${list}. Please choose one.`;
}

export function formatNoMatchAnnouncement(): string {
  return "I couldn't find that item in this restaurant's menu. You can try saying the menu item name again or browse the menu.";
}

export function formatUnavailableAnnouncement(name: string): string {
  return `${name} is currently unavailable. Please choose another item.`;
}

/** Visual preview line mirrors the announcement facts (price from menu). */
export function formatPreviewLine(name: string, quantity: number, priceEach: number): string {
  return `${name} × ${quantity} — ${formatCurrency(priceEach * quantity)}`;
}

/** Enriched Add-button name: item + price + availability from the menu doc. */
export function formatAddToCartLabel(item: MenuItem): string {
  const { available, stockRemaining } = menuItemAvailability(item);
  const price = rupees(itemPrice(item));
  if (!available) return `${item.name}, ${price}, currently unavailable`;
  if (stockRemaining != null) {
    return `Add ${item.name} to cart, ${price}, ${stockRemaining} remaining`;
  }
  return `Add ${item.name} to cart, ${price}`;
}
