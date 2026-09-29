/**
 * Restaurant food preparation-time reference for wait estimation.
 *
 * Each food maps to a {min, max} minute RANGE — never a single arbitrary
 * number. The wait engine adds ranges across items and multiplies by
 * quantity, keeping min/max until final display.
 *
 * This is estimation configuration, NOT menu data: prices, descriptions,
 * availability, categories, stock and IDs are never touched here. The real
 * Firestore menu item stays authoritative; this file only answers "how long
 * might this dish take to prepare" for Table Check wait estimates.
 *
 * Matching is normalized + alias-tolerant (see normalizeFoodName). Unknown
 * foods fall back to category defaults / restaurant default in the engine.
 */

export interface PrepRange {
  min: number;
  max: number;
}

/**
 * Normalizes a dish name for prep lookup:
 * - lowercase, "&" → "and", punctuation → spaces
 * - strips portion suffixes that don't change the dish: (2 pcs), (can), (ghee)
 * - KEEPS distinguishing suffixes: (half)/(full), veg/non-veg markers
 *
 * Examples: "Podi Idli (Ghee)" → "podi idli"; "Hot and Sour Chicken Soup" and
 * "Hot & Sour Chicken Soup" both → "hot and sour chicken soup".
 */
export function normalizeFoodName(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\(\s*(2\s*pcs|can|ghee)\s*\)/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Entry = [name: string, min: number, max: number];

const ENTRIES: Entry[] = [
  ["Samosa (2 pcs)", 5, 8],
  ["Idli Sambar (2 pcs)", 8, 12],
  ["Rava Idli", 8, 12],
  ["Podi Idli", 8, 12],
  ["Medu Vada (2 pcs)", 8, 12],
  ["Sambar Vada", 8, 12],
  ["Rasam Vada", 8, 12],
  ["Upma", 10, 15],
  ["Pongal Vada Combo", 12, 18],
  ["Masala Dosa", 12, 18],
  ["Plain Dosa", 10, 15],
  ["Ghee Roast Dosa", 12, 18],
  ["Podi Dosa", 12, 18],
  ["Mysore Masala Dosa", 15, 20],
  ["Rava Onion Dosa", 15, 20],
  ["Cheese Burst Dosa", 15, 22],
  ["Poori Masala (2 pcs)", 12, 18],
  ["Poori Chana", 12, 18],
  ["Wheat Poori (2 pcs)", 12, 18],
  ["Kothu Parotta (Veg)", 15, 20],
  ["Kothu Parotta (Chicken)", 18, 25],
  ["Ceylon Parotta", 12, 18],
  ["Malabar Parotta (2 pcs)", 12, 18],
  ["Chettinad Meal", 20, 30],
  ["South Indian Thali", 25, 35],
  ["Deluxe Veg Thali", 25, 35],
  ["Non-Veg Executive Thali", 25, 35],
  ["Mini Veg Meals", 15, 20],
  ["Mini Biriyani Combo", 15, 20],
  ["Mini Meals Rice Pack", 12, 18],
  ["Mini Tiffin", 15, 20],
  ["Lemon Rice", 10, 15],
  ["Tamarind Rice", 10, 15],
  ["Curd Rice", 8, 12],
  ["Veg Dum Biriyani", 15, 22],
  ["Egg Biriyani", 18, 25],
  ["Hyderabadi Chicken Dum Biriyani", 20, 30],
  ["Mutton Biriyani", 20, 30],
  ["Prawns Biriyani", 20, 30],
  ["Special Dindigul Thalappakatti Biriyani", 20, 30],
  ["Chicken Fried Rice", 15, 20],
  ["Egg Fried Rice", 12, 18],
  ["Veg Fried Rice", 12, 18],
  ["Mixed Fried Rice", 15, 20],
  ["Schezwan Veg Fried Rice", 12, 18],
  ["Fried Rice & Manchurian Combo", 18, 25],
  ["Chicken Hakka Noodles", 15, 20],
  ["Egg Noodles", 12, 18],
  ["Schezwan Chicken Noodles", 15, 22],
  ["Veg Chowmein", 12, 18],
  ["Veg Hakka Noodles", 12, 18],
  ["Red Sauce Pasta", 15, 20],
  ["White Sauce Pasta", 15, 20],
  ["Classic Cheese Burger", 12, 18],
  ["Chicken Zinger Burger", 12, 18],
  ["Spicy Paneer Burger", 12, 18],
  ["Veggie Burger", 10, 15],
  ["Burger & Fries Combo", 18, 25],
  ["Chicken Club Sandwich", 12, 18],
  ["Veg Grilled Sandwich", 10, 15],
  ["Chicken Kathi Roll", 10, 15],
  ["Paneer Tikka Roll", 10, 15],
  ["Chicken Tikka Pizza", 18, 25],
  ["Margherita Pizza", 15, 22],
  ["French Fries", 8, 12],
  ["Onion Pakoda", 8, 12],
  ["Crispy Corn", 8, 12],
  ["Veg Spring Rolls", 8, 12],
  ["Chicken 65", 10, 15],
  ["Paneer 65", 10, 15],
  ["Fish Finger", 10, 15],
  ["Chicken Seekh Kebab", 12, 18],
  ["Reshmi Kebab", 12, 18],
  ["Hariyali Kebab", 12, 18],
  ["Paneer Tikka", 12, 18],
  ["Tandoori Chicken (Half)", 20, 30],
  ["Tandoori Chicken (Full)", 30, 45],
  ["Grilled Fish Fillet", 15, 22],
  ["Vanjaram Fish Fry", 12, 18],
  ["Pomfret Tawa Fry", 15, 22],
  ["Crab Masala", 20, 30],
  ["Prawn Masala", 15, 22],
  ["Fish Meal", 20, 30],
  ["Garlic Chicken", 12, 18],
  ["Pepper Chicken Fry", 12, 18],
  ["Chicken Tikka Masala", 15, 22],
  ["Butter Chicken", 15, 22],
  ["Chettinad Chicken Curry", 15, 22],
  ["Mutton Boti Fry", 15, 22],
  ["Mutton Sukka", 15, 22],
  ["Mutton Rogan Josh", 15, 22],
  ["Chole Bhature", 15, 22],
  ["Dal Makhani + bread", 15, 20],
  ["Kadai Paneer + bread", 15, 20],
  ["Paneer Butter Masala + bread", 15, 20],
  ["Shahi Paneer + bread", 15, 20],
  ["Navratan Korma + bread", 15, 20],
  ["Mushroom Masala + bread", 12, 18],
  ["Mushroom Pepper Fry", 10, 15],
  ["Aloo Gobi", 10, 15],
  ["Aloo Palak", 10, 15],
  ["Mix Veg Curry", 10, 15],
  ["Chilli Paneer", 10, 15],
  ["Honey Chilli Potato", 8, 12],
  ["Gobi 65", 10, 15],
  ["Sweet Corn Veg Soup", 8, 12],
  ["Tomato Soup", 8, 12],
  ["Hot & Sour Chicken Soup", 8, 12],
  ["Lemon Coriander Soup", 8, 12],
  ["Green Salad", 5, 8],
  ["Chicken Caesar Salad", 8, 12],
  ["Butter Naan", 5, 8],
  ["Garlic Naan", 5, 8],
  ["Tandoori Roti", 4, 7],
  ["Phulka with Butter (2 pcs)", 7, 10],
  ["Soft Chapati (2 pcs)", 7, 10],
  ["Brownie with Ice Cream", 8, 12],
  ["Gulab Jamun (2 pcs)", 5, 8],
  ["Rasmalai (2 pcs)", 5, 8],
  ["Vanilla Scoop", 5, 8],
  ["Chocolate Fudge", 5, 8],
  ["Black Forest Pastry", 5, 8],
  ["Chocolate Truffle Slice", 5, 8],
  ["Cappuccino", 10, 15],
  ["South Indian Filter Coffee", 8, 12],
  ["Masala Chai", 8, 12],
  ["Lemon Tea", 8, 12],
  ["Chocolate Milkshake", 10, 15],
  ["Mango Milkshake", 10, 15],
  ["Oreo Milkshake", 10, 15],
  ["Fresh Lime Soda", 5, 8],
  ["Lemon-Lime Soda", 5, 8],
  ["Virgin Mojito", 5, 10],
  ["Blue Lagoon", 5, 10],
  ["Pineapple Juice", 5, 8],
  ["Watermelon Juice", 5, 8],
];

const LOOKUP = new Map<string, PrepRange>();
for (const [name, min, max] of ENTRIES) {
  LOOKUP.set(normalizeFoodName(name), { min, max });
}

/** Number of supplied food mappings (reported, not hardcoded elsewhere). */
export const FOOD_PREP_COUNT = ENTRIES.length;

/** Prep range for a menu/food name, or null when no safe match exists. */
export function lookupPrepRange(rawName: string): PrepRange | null {
  const key = normalizeFoodName(rawName);
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}
