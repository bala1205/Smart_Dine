import type { OrderStatus } from "../types/order";
import { lookupPrepRange } from "./foodPrepTimes";

/**
 * Grounded table wait-time estimation for SmartDine Table Check.
 *
 * Deterministic — NO AI, NO randomness. Every number derives from real
 * Firestore state (order status/timestamps, ordered items with quantities)
 * plus the food preparation-time reference (min/max ranges per dish).
 * Firestore/order state is authoritative; an optional AI layer may only
 * rephrase, never produce the numeric estimate.
 *
 * Preparation model (explicit business rule — ADDITIVE, not parallel):
 *   prepMin = Σ quantity × rangeMin,  prepMax = Σ quantity × rangeMax
 * Quantity multiplies time; multiple items add. Ranges stay intact until
 * display so customers see "Approx. 20–30 min" instead of false precision.
 *
 * Status model (preparation range is only PART of occupancy):
 * - PLACED     → full prep range + dining estimate
 * - PREPARING  → remaining prep (range − elapsed since preparingAt) + dining
 * - READY      → small serve buffer + dining estimate
 * - SERVED (unpaid) → prep is done: dining remaining only; UI headline is
 *                "Finishing payment" per spec
 * - CANCELLED / PAID / none → null (table reads available via release logic)
 *
 * Prep source priority per item: food reference range (by normalized name) →
 * real MenuItem.preparationTime (point) → category default (point) →
 * restaurant default (point). Non-reference sources are recorded in `basis`
 * and lower confidence.
 *
 * Dining stays a separate deterministic heuristic (point estimate, reported
 * as both diningMin/Max). Food prep times are NOT eating times.
 */

export type WaitConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface WaitTimeItem {
  /** Real MenuItem.preparationTime in minutes (0/missing = unknown). */
  preparationTime: number;
  /** Real category name (for category-default fallback + dining tweaks). */
  categoryName: string;
  quantity: number;
  /** Real menu/order item name (for food-reference range lookup). */
  name?: string;
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
  /** Rounded midpoint (compat); prefer remainingMin/Max for display. */
  remainingMinutes: number | null;
  remainingMinMinutes: number | null;
  remainingMaxMinutes: number | null;
  preparationMinMinutes: number;
  preparationMaxMinutes: number;
  diningMinMinutes: number;
  diningMaxMinutes: number;
  /** Customer-safe label key (resolved by formatWaitLabel). */
  label: "approx" | "payment" | "unavailable";
  confidence: WaitConfidence;
  /** Machine-readable derivation trail for tests/debugging. */
  basis: string;
}

/** Short serve/payment buffers and dining heuristic. */
export const SERVE_BUFFER_MIN = 5;
export const BASE_DINING_MIN = 25;
export const EXTRA_ITEMS_THRESHOLD = 4;
export const EXTRA_ITEMS_MIN = 5;
export const DESSERT_DRINK_MIN = 5;
export const MAX_DINING_MIN = 60;
/** Used when an item has no reference match, prep minutes, or category default. */
export const RESTAURANT_DEFAULT_PREP_MIN = 15;
export const MIN_REMAINING_MIN = 5;
export const MAX_REMAINING_MIN = 90;
export const ROUND_TO_MIN = 5;

/**
 * Category-based prep fallbacks (point values). Deliberately coarse —
 * only for foods missing from the reference AND without real prep minutes.
 */
export const CATEGORY_PREP_DEFAULTS: Array<{ match: string[]; minutes: number }> = [
  { match: ["biriyani", "biryani"], minutes: 25 },
  { match: ["tandoori", "grill", "kebab"], minutes: 25 },
  { match: ["pizza", "pasta"], minutes: 20 },
  { match: ["seafood", "fish", "prawn", "crab"], minutes: 20 },
  { match: ["chinese", "noodle", "fried rice", "hakka", "manchurian"], minutes: 15 },
  { match: ["burger", "sandwich", "roll", "wrap"], minutes: 12 },
  { match: ["dosa", "idli", "vada", "breakfast", "upma", "poori"], minutes: 10 },
  { match: ["parotta", "chapati", "naan", "bread", "roti"], minutes: 10 },
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

type ItemSource = "food-range" | "menu-minutes" | "category" | "default";

function prepRangeForItem(item: WaitTimeItem): { min: number; max: number; source: ItemSource } {
  if (item.name) {
    const ref = lookupPrepRange(item.name);
    if (ref) return { min: ref.min, max: ref.max, source: "food-range" };
  }
  const real = Number(item.preparationTime);
  if (Number.isFinite(real) && real > 0) {
    return { min: real, max: real, source: "menu-minutes" };
  }
  const cat = categoryPrepDefault(item.categoryName);
  if (cat != null) return { min: cat, max: cat, source: "category" };
  return { min: RESTAURANT_DEFAULT_PREP_MIN, max: RESTAURANT_DEFAULT_PREP_MIN, source: "default" };
}

export interface PrepRangeEstimate {
  min: number;
  max: number;
  /** True when every item used a reference range or real prep minutes. */
  allKnown: boolean;
}

/**
 * Additive preparation range for an order: Σ quantity × [min, max].
 * Pure — exact spec examples: 2×Egg Biriyani = 36–50; +Samosa = 41–58.
 */
export function preparationRangeForOrder(items: WaitTimeItem[]): PrepRangeEstimate {
  if (items.length === 0) {
    return { min: RESTAURANT_DEFAULT_PREP_MIN, max: RESTAURANT_DEFAULT_PREP_MIN, allKnown: false };
  }
  let min = 0;
  let max = 0;
  let allKnown = true;
  for (const item of items) {
    const qty = Math.max(0, Math.floor(Number(item.quantity)) || 0);
    const r = prepRangeForItem(item);
    min += qty * r.min;
    max += qty * r.max;
    if (r.source !== "food-range" && r.source !== "menu-minutes") allKnown = false;
  }
  return { min, max, allKnown };
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

  const prep = preparationRangeForOrder(input.items);
  const dining = diningEstimateMinutes(input.items);
  const elapsedSince = (ts?: number) =>
    typeof ts === "number" && Number.isFinite(ts) && ts > 0 && ts <= now ? now - ts : 0;
  const mins = (ms: number) => ms / 60000;
  const confidence: WaitConfidence = prep.allKnown ? "MEDIUM" : "LOW";

  switch (input.status) {
    case "PLACED": {
      const lo = prep.min + dining;
      const hi = prep.max + dining;
      const rMin = roundWait(lo);
      const rMax = roundWait(hi);
      return {
        remainingMinutes: roundWait((lo + hi) / 2),
        remainingMinMinutes: rMin,
        remainingMaxMinutes: rMax,
        preparationMinMinutes: prep.min,
        preparationMaxMinutes: prep.max,
        diningMinMinutes: dining,
        diningMaxMinutes: dining,
        label: "approx",
        confidence,
        basis: prep.allKnown ? "placed-full" : "placed-full-fallback-prep",
      };
    }
    case "PREPARING": {
      const anchor = input.preparingAt && input.preparingAt > 0 ? input.preparingAt : input.createdAt;
      const elapsed = mins(elapsedSince(anchor));
      const lo = Math.max(0, prep.min - elapsed) + dining;
      const hi = Math.max(0, prep.max - elapsed) + dining;
      const rMin = roundWait(lo);
      const rMax = roundWait(hi);
      return {
        remainingMinutes: roundWait((lo + hi) / 2),
        remainingMinMinutes: rMin,
        remainingMaxMinutes: rMax,
        preparationMinMinutes: Math.max(0, prep.min - elapsed),
        preparationMaxMinutes: Math.max(0, prep.max - elapsed),
        diningMinMinutes: dining,
        diningMaxMinutes: dining,
        label: "approx",
        confidence,
        basis: "preparing-partial",
      };
    }
    case "READY": {
      const lo = SERVE_BUFFER_MIN + dining;
      const rMin = roundWait(lo);
      return {
        remainingMinutes: rMin,
        remainingMinMinutes: rMin,
        remainingMaxMinutes: rMin,
        preparationMinMinutes: 0,
        preparationMaxMinutes: 0,
        diningMinMinutes: dining,
        diningMaxMinutes: dining,
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
          remainingMinMinutes: null,
          remainingMaxMinutes: null,
          preparationMinMinutes: 0,
          preparationMaxMinutes: 0,
          diningMinMinutes: dining,
          diningMaxMinutes: dining,
          label: "payment",
          confidence: "LOW",
          basis: "payment-pending",
        };
      }
      const r = roundWait(diningRemaining);
      return {
        remainingMinutes: r,
        remainingMinMinutes: r,
        remainingMaxMinutes: r,
        preparationMinMinutes: 0,
        preparationMaxMinutes: 0,
        diningMinMinutes: dining,
        diningMaxMinutes: dining,
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
  if (
    est.label === "unavailable" ||
    est.remainingMinMinutes == null ||
    est.remainingMaxMinutes == null
  ) {
    if (lang === "ta") return "ஆக்கிரமிக்கப்பட்டுள்ளது — காத்திருப்பு நேரம் தெரியவில்லை";
    if (lang === "tanglish") return "Occupied — wait time theriyala";
    return "Occupied — wait time unavailable";
  }
  const lo = est.remainingMinMinutes;
  const hi = est.remainingMaxMinutes;
  if (lo === hi) {
    if (lang === "ta") return `தோராயமாக ${lo} நிமிடங்கள்`;
    if (lang === "tanglish") return `Approx. ${lo} min remaining`;
    return `Approx. ${lo} min remaining`;
  }
  if (lang === "ta") return `தோராயமாக ${lo}–${hi} நிமிடங்கள்`;
  if (lang === "tanglish") return `Approx. ${lo}–${hi} min remaining`;
  return `Approx. ${lo}–${hi} min remaining`;
}
