import type { OrderStatus } from "../types/order";

/**
 * Grounded table wait-time estimation for SmartDine Table Check.
 *
 * Deterministic — NO AI, NO randomness. Every number derives from real
 * Firestore state (order status/timestamps, ordered items with quantities,
 * real `MenuItem.preparationTime`). Firestore/order state is authoritative;
 * an optional AI layer may only rephrase, never produce the numeric estimate.
 *
 * Model (transparent heuristic, operational estimation only — no claims about
 * how fast people eat):
 *
 *   remaining = prepRemaining(status) + diningRemaining
 *
 * - PLACED     → full prep estimate + full dining estimate
 * - PREPARING  → remaining prep (prepEstimate − elapsed since preparingAt)
 *                + full dining estimate
 * - READY      → serve buffer + full dining estimate
 * - SERVED (unpaid) → dining remaining (diningEstimate − elapsed since
 *                servedAt); UI shows "Finishing payment" per spec
 * - CANCELLED / PAID / none → null (table is / will be available)
 *
 * Prep estimate: max(real item preparationTime) + small per-item overhead
 * (kitchen parallelizes, so max — not sum). Missing/zero prepTime falls back
 * to category defaults, then a single restaurant-level default. Fallback use
 * is recorded in `basis` and lowers confidence.
 *
 * Dining estimate: base + adjustments for party-size proxies (item count,
 * desserts/drinks). All values are named constants below.
 */

export type WaitConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface WaitTimeItem {
  /** Real MenuItem.preparationTime in minutes (0/missing = unknown). */
  preparationTime: number;
  /** Real category name (for category-default fallback + dining tweaks). */
  categoryName: string;
  quantity: number;
}

export interface WaitTimeInput {
  status: OrderStatus;
  paymentStatus?: string;
  createdAt: number;
  updatedAt: number;
  preparingAt?: number;
  readyAt?: number;
  servedAt?: number;
  items: WaitTimeItem[];
}

export interface WaitEstimate {
  /** Rounded minutes, or null when the table should read available. */
  remainingMinutes: number | null;
  /** Customer-safe label key (resolved by formatWaitLabel). */
  label: "approx" | "payment" | "unavailable";
  confidence: WaitConfidence;
  /** Machine-readable derivation trail for tests/debugging. */
  basis: string;
}

/** Short reservation/serve/payment buffers and dining heuristic. */
export const SERVE_BUFFER_MIN = 5;
export const BASE_DINING_MIN = 25;
export const EXTRA_ITEMS_THRESHOLD = 4;
export const EXTRA_ITEMS_MIN = 5;
export const DESSERT_DRINK_MIN = 5;
export const MAX_DINING_MIN = 60;
export const PER_EXTRA_ITEM_PREP_MIN = 2;
export const MAX_PREP_MIN = 60;
/** Used when an item has no real preparationTime and no category default. */
export const RESTAURANT_DEFAULT_PREP_MIN = 15;
export const MIN_REMAINING_MIN = 5;
export const MAX_REMAINING_MIN = 90;
export const ROUND_TO_MIN = 5;

/**
 * Category-based prep fallbacks. Deliberately coarse (categories, never
 * per-dish times for the whole menu). Keys match case-insensitively against
 * the real category name; first match wins.
 */
export const CATEGORY_PREP_DEFAULTS: Array<{ match: string[]; minutes: number }> = [
  { match: ["biriyani", "biryani"], minutes: 25 },
  { match: ["tandoori", "grill", "kebab"], minutes: 25 },
  { match: ["pizza", "pasta"], minutes: 20 },
  { match: ["seafood", "fish", "prawn", "crab"], minutes: 20 },
  { match: ["chinese", "noodle", "fried rice", "hakka", "manchurian"], minutes: 15 },
  { match: ["burger", "sandwich", "roll", "wrap"], minutes: 12 },
  { match: ["dosa", "idli", "vada", "breakfast", "upma", "poori"], minutes: 10 },
  { match: ["parotta", "chapati", "naan", "bread"], minutes: 10 },
  { match: ["soup", "salad", "rasam"], minutes: 10 },
  { match: ["dessert", "cake", "ice cream", "pastry", "brownie", "halwa", "payasam", "jamun"], minutes: 8 },
  { match: ["juice", "coffee", "tea", "drink", "shake", "mojito", "soda", "mocktail", "lassi"], minutes: 5 },
];

export function categoryPrepDefault(categoryName: string): number | null {
  const hay = (categoryName || "").toLowerCase();
  for (const entry of CATEGORY_PREP_DEFAULTS) {
    if (entry.match.some((k) => hay.includes(k))) return entry.minutes;
  }
  return null;
}

function effectivePrepMinutes(item: WaitTimeItem): { minutes: number; real: boolean } {
  const real = Number(item.preparationTime);
  if (Number.isFinite(real) && real > 0) return { minutes: real, real: true };
  const cat = categoryPrepDefault(item.categoryName);
  if (cat != null) return { minutes: cat, real: false };
  return { minutes: RESTAURANT_DEFAULT_PREP_MIN, real: false };
}

function prepEstimateMinutes(items: WaitTimeItem[]): { minutes: number; allReal: boolean } {
  if (items.length === 0) {
    return { minutes: RESTAURANT_DEFAULT_PREP_MIN, allReal: false };
  }
  const eff = items.map(effectivePrepMinutes);
  const max = Math.max(...eff.map((e) => e.minutes));
  const total =
    max + PER_EXTRA_ITEM_PREP_MIN * Math.max(0, eff.length - 1);
  return {
    minutes: Math.min(MAX_PREP_MIN, total),
    allReal: eff.every((e) => e.real),
  };
}

function diningEstimateMinutes(items: WaitTimeItem[]): number {
  let total = BASE_DINING_MIN;
  const distinct = items.length;
  const qty = items.reduce((n, it) => n + Math.max(0, Math.floor(it.quantity) || 0), 0);
  if (distinct >= EXTRA_ITEMS_THRESHOLD || qty >= EXTRA_ITEMS_THRESHOLD + 1) {
    total += EXTRA_ITEMS_MIN;
  }
  const hay = items.map((it) => (it.categoryName || "").toLowerCase()).join(" ");
  if (/dessert|cake|ice cream|pastry|brownie|sweet|juice|coffee|tea|drink|shake|mojito|soda|mocktail/.test(hay)) {
    total += DESSERT_DRINK_MIN;
  }
  return Math.min(MAX_DINING_MIN, total);
}

function roundWait(minutes: number): number {
  const rounded = Math.round(minutes / ROUND_TO_MIN) * ROUND_TO_MIN;
  return Math.min(MAX_REMAINING_MIN, Math.max(MIN_REMAINING_MIN, rounded));
}

/**
 * Estimates remaining table occupancy for a LIVE order. Returns null when the
 * order is terminal (CANCELLED) or paid — the table should read available via
 * existing release logic. Pure — unit tested with fixed timestamps.
 */
export function estimateTableWait(
  input: WaitTimeInput,
  now: number = Date.now()
): WaitEstimate | null {
  if (input.status === "CANCELLED") return null;
  if (input.paymentStatus === "PAID") return null;

  const prep = prepEstimateMinutes(input.items);
  const dining = diningEstimateMinutes(input.items);
  const elapsedSince = (ts?: number) =>
    typeof ts === "number" && Number.isFinite(ts) && ts > 0 && ts <= now ? now - ts : 0;
  const mins = (ms: number) => ms / 60000;

  switch (input.status) {
    case "PLACED": {
      const remaining = prep.minutes + dining;
      return {
        remainingMinutes: roundWait(remaining),
        label: "approx",
        confidence: prep.allReal ? "MEDIUM" : "LOW",
        basis: prep.allReal ? "placed-full" : "placed-full-fallback-prep",
      };
    }
    case "PREPARING": {
      const anchor = input.preparingAt && input.preparingAt > 0 ? input.preparingAt : input.createdAt;
      const prepRemaining = Math.max(0, prep.minutes - mins(elapsedSince(anchor)));
      const remaining = prepRemaining + dining;
      return {
        remainingMinutes: roundWait(remaining),
        label: "approx",
        confidence: prep.allReal ? "MEDIUM" : "LOW",
        basis: "preparing-partial",
      };
    }
    case "READY": {
      const remaining = SERVE_BUFFER_MIN + dining;
      return {
        remainingMinutes: roundWait(remaining),
        label: "approx",
        confidence: "MEDIUM",
        basis: "ready-buffer",
      };
    }
    case "SERVED": {
      // SERVED + unpaid = PAYMENT_PENDING family: never show a large
      // food-duration estimate as the headline; UI shows "Finishing payment".
      const diningRemaining = dining - mins(elapsedSince(input.servedAt ?? input.updatedAt));
      if (diningRemaining <= 0) {
        return {
          remainingMinutes: null,
          label: "payment",
          confidence: "LOW",
          basis: "payment-pending",
        };
      }
      return {
        remainingMinutes: roundWait(diningRemaining),
        label: "payment",
        confidence: "LOW",
        basis: "payment-pending",
      };
    }
    default:
      return null;
  }
}

/** Customer-facing wait label in the active UI language. */
export function formatWaitLabel(
  est: WaitEstimate,
  lang: "en" | "tanglish" | "ta"
): string {
  if (est.label === "payment") {
    if (lang === "ta") return "பணம் செலுத்தும் நிலையில்";
    if (lang === "tanglish") return "Payment mudikuraanga";
    return "Finishing payment";
  }
  if (est.label === "unavailable" || est.remainingMinutes == null) {
    if (lang === "ta") return "ஆக்கிரமிக்கப்பட்டுள்ளது — காத்திருப்பு நேரம் தெரியவில்லை";
    if (lang === "tanglish") return "Occupied — wait time theriyala";
    return "Occupied — wait time unavailable";
  }
  const n = est.remainingMinutes;
  if (lang === "ta") return `தோராயமாக ${n} நிமிடங்கள்`;
  if (lang === "tanglish") return `Approx. ${n} min remaining`;
  return `Approx. ${n} min remaining`;
}
