import { describe, it, expect } from "vitest";
import { answerChat, isVegSafe, extractPriceCap, type ChatMenuContext } from "./chatAssistant";
import type { MenuItem, MenuCategory } from "../types/menu";

function m(id: string, name: string, price: number, categoryId: string, isAvailable = true): MenuItem {
  return {
    id, name, description: "", price, categoryId, imageUrl: "",
    preparationTime: 10, isAvailable, trackStock: false,
    stockQuantity: 10, lowStockThreshold: 2, createdAt: 0, updatedAt: 0,
  };
}

const CATS: MenuCategory[] = [
  { id: "bir", name: "Biriyani", displayOrder: 1, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "dos", name: "Dosas", displayOrder: 2, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "jui", name: "Juices", displayOrder: 3, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "veg", name: "Veg Curries", displayOrder: 4, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "chi", name: "Chicken", displayOrder: 5, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "nvc", name: "Non-Veg Curries", displayOrder: 6, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "sea", name: "Seafood", displayOrder: 7, isActive: true, createdAt: 0, updatedAt: 0 },
  { id: "des", name: "Desserts", displayOrder: 8, isActive: true, createdAt: 0, updatedAt: 0 },
];

const MENU = [
  m("h", "Hyderabadi Chicken Dum Biriyani", 280, "bir"),
  m("mb", "Mutton Biriyani", 340, "bir"),
  m("eb", "Egg Biriyani", 210, "bir"),
  m("md", "Masala Dosa", 110, "dos"),
  m("pd", "Plain Dosa", 80, "dos"),
  m("fj", "Fresh Lime Soda", 70, "jui"),
  m("ag", "Aloo Gobi", 170, "veg"),
  m("c65", "Chicken 65", 250, "chi"),
  m("bc", "Butter Chicken", 290, "nvc"),
  m("fc", "Fish Curry", 320, "sea"),
  m("gj", "Gulab Jamun", 90, "des"),
  m("off", "Old Fish Fry", 999, "sea", false),
];

function ctx(overrides: Partial<ChatMenuContext> = {}): ChatMenuContext {
  return {
    restaurantName: "meto's",
    description: "test",
    address: "123 Main St",
    phone: "99999",
    isActive: true,
    categories: CATS,
    cart: [],
    cartTotal: 0,
    language: "en",
    ...overrides,
  };
}

describe("extractPriceCap", () => {
  it("under ₹300 / 200 ku keela / tamil", () => {
    expect(extractPriceCap("under ₹300")).toBe(300);
    expect(extractPriceCap("200 ku keela food kaatu")).toBe(200);
    expect(extractPriceCap("₹200 க்குள் உணவு")).toBe(200);
    expect(extractPriceCap("hello")).toBeNull();
  });
});

describe("isVegSafe — never infer", () => {
  it("veg/paneer explicit wins, meat always loses", () => {
    expect(isVegSafe(m("a", "Aloo Gobi", 1, "veg"), "Veg Curries")).toBe(true);
    expect(isVegSafe(m("b", "Paneer 65", 1, "x"), "Starters")).toBe(true);
    expect(isVegSafe(m("c", "Chicken 65", 1, "x"), "Starters")).toBe(false);
    expect(isVegSafe(m("d", "Egg Biriyani", 1, "x"), "Biriyani")).toBe(false);
    expect(isVegSafe(m("e", "Veg Chicken Soup", 1, "x"), "Soups")).toBe(false);
    expect(isVegSafe(m("f", "Mushroom Masala", 1, "x"), "Curries")).toBe(false);
    expect(isVegSafe(m("g", "Chicken Biriyani", 1, "x"), "Non-Vegetarian Meals")).toBe(false);
  });
});

describe("answerChat English", () => {
  it("biriyani listing from real menu", () => {
    const r = answerChat("What biriyani do you have?", MENU, ctx());
    expect(r.text).toContain("Hyderabadi Chicken Dum Biriyani");
    expect(r.suggestions!.length).toBeGreaterThan(1);
    expect(r.scopeIds!.length).toBeGreaterThan(1);
  });
  it("price + availability from real docs", () => {
    expect(answerChat("How much is Mutton Biriyani?", MENU, ctx()).text).toContain("340");
    expect(answerChat("Is Hyderabadi Chicken Dum Biriyani available?", MENU, ctx()).text).toMatch(/yes/i);
    expect(answerChat("Is Old Fish Fry available?", MENU, ctx()).text).toMatch(/unavailable/i);
  });
  it("cheapest dosa computed", () => {
    const r = answerChat("Which dosa is cheapest?", MENU, ctx());
    expect(r.text).toContain("Plain Dosa");
  });
  it("order intent carries real intent, no auto-add", () => {
    const r = answerChat("Give me two chicken biriyani.", MENU, ctx());
    expect(r.intent!.items[0].menuItemId).toBe("h");
    expect(r.intent!.items[0].quantity).toBe(2);
    expect(r.text).toContain("Hyderabadi Chicken Dum Biriyani");
  });
  it("ambiguous never auto-adds", () => {
    const r = answerChat("biriyani", MENU, ctx());
    expect(r.intent).toBeUndefined();
    expect(r.ambiguous![0].options.length).toBeGreaterThan(1);
  });
  it("invalid matches nothing", () => {
    const r = answerChat("xyzq volcano zzz", MENU, ctx());
    expect(r.noMatch).toBe(true);
    expect(r.intent).toBeUndefined();
  });
  it("opening hours never hallucinated", () => {
    const r = answerChat("What time does this restaurant open?", MENU, ctx());
    expect(r.text).not.toMatch(/9 AM|10 AM|11/);
    expect(r.text).toMatch(/aren't available/i);
  });
  it("address/phone from real fields", () => {
    expect(answerChat("Where is the restaurant?", MENU, ctx()).text).toContain("123 Main St");
    expect(answerChat("Phone number?", MENU, ctx()).text).toContain("99999");
    expect(answerChat("restaurant peru ena?", MENU, ctx({ language: "tanglish" })).text).toContain("meto's");
  });
  it("cart questions use CartContext", () => {
    expect(answerChat("What's in my cart?", MENU, ctx()).text).toMatch(/empty/i);
    const withCart = ctx({
      cart: [{ menuItemId: "h", name: "Hyderabadi Chicken Dum Biriyani", price: 280, quantity: 2 }],
      cartTotal: 560,
    });
    const r = answerChat("cart la ena iruku?", MENU, withCart);
    expect(r.text).toContain("Hyderabadi Chicken Dum Biriyani");
    expect(r.text).toContain("560");
  });
  it("under-200 recommendation grounded in menu", () => {
    const r = answerChat("I want something under ₹200.", MENU, ctx());
    expect(r.suggestions!.length).toBeGreaterThan(0);
    for (const s of r.suggestions!) expect(s.price).toBeLessThanOrEqual(200);
  });
  it("veg listing contains no meat", () => {
    const r = answerChat("veg items mattum kaatu", MENU, ctx());
    expect(r.suggestions!.length).toBeGreaterThan(0);
    for (const s of r.suggestions!) {
      expect(s.name).not.toMatch(/chicken|mutton|fish|egg/i);
    }
  });
  it("follow-up cheapest reuses listing context", () => {
    const first = answerChat("What biriyani do you have?", MENU, ctx());
    const follow = answerChat("Which is cheapest?", MENU, ctx({ lastIds: first.scopeIds, lastLabel: "biriyani" }));
    expect(follow.text).toContain("Egg Biriyani");
  });
  it("follow-up under-300 filters previous context", () => {
    const first = answerChat("What biriyani do you have?", MENU, ctx());
    const follow = answerChat("Under 300", MENU, ctx({ lastIds: first.scopeIds, lastLabel: "biriyani" }));
    expect(follow.suggestions!.length).toBeGreaterThan(0);
    for (const s of follow.suggestions!) expect(s.price).toBeLessThanOrEqual(300);
  });
});

describe("answerChat Tanglish", () => {
  const tctx = () => ctx({ language: "tanglish" });
  it("enna biriyani iruku", () => {
    const r = answerChat("enna biriyani iruku", MENU, tctx());
    expect(r.text).toContain("Hyderabadi Chicken Dum Biriyani");
  });
  it("mutton biriyani evlo", () => {
    expect(answerChat("mutton biriyani evlo", MENU, tctx()).text).toContain("340");
  });
  it("rendu chicken biriyani kudu orders ×2", () => {
    const r = answerChat("rendu chicken biriyani kudu", MENU, tctx());
    expect(r.intent!.items[0].quantity).toBe(2);
  });
  it("anna rendu parotta stays safe (no such item here)", () => {
    const r = answerChat("anna rendu parotta", MENU, tctx());
    expect(r.intent).toBeUndefined();
  });
  it("hours missing in tanglish", () => {
    expect(answerChat("restaurant open time enna?", MENU, tctx()).text).toMatch(/available illa/);
  });
});

describe("recommendations and Tamil veg", () => {
  it("bare Drinks recommends across real drink categories", () => {
    const r = answerChat("Drinks", MENU, ctx());
    expect(r.suggestions!.length).toBeGreaterThan(0);
    expect(r.suggestions!.map((s) => s.name)).toContain("Fresh Lime Soda");
    for (const s of r.suggestions!) {
      expect(s.menuItemId).toBeTruthy();
      expect(s.price).toBeGreaterThan(0);
    }
  });
  it("Tamil veg request stays meat-free", () => {
    const r = answerChat("வெஜ் ஐட்டம் மட்டும் காட்டு", MENU, ctx({ language: "ta" }));
    expect(r.suggestions!.length).toBeGreaterThan(0);
    for (const s of r.suggestions!) {
      expect(s.name).not.toMatch(/chicken|mutton|fish|egg/i);
    }
  });
  it("sixty-five words match Chicken 65", () => {
    const r = answerChat("oru chicken sixty five", MENU, ctx());
    expect(r.intent!.items[0].menuItemId).toBe("c65");
  });
});

describe("restaurant knowledge — real fields only", () => {
  const rctx = () => ctx({ gstPercent: 5, serviceChargePercent: 2 });
  it("name/summary/count from real data", () => {
    expect(answerChat("What is this restaurant called?", MENU, rctx()).text).toContain("meto's");
    expect(answerChat("Tell me about this restaurant.", MENU, rctx()).text).toContain("meto's");
    const c = answerChat("How many food items do you have?", MENU, rctx());
    expect(c.text).toContain("12");
  });
  it("GST/service/payment from real settings", () => {
    expect(answerChat("Do you have GST?", MENU, rctx()).text).toContain("5%");
    expect(answerChat("Is there a service charge?", MENU, rctx()).text).toContain("2%");
    expect(answerChat("What payment information is available?", MENU, rctx()).text).toContain("5%");
    expect(answerChat("GST iruka?", MENU, { ...rctx(), language: "tanglish" }).text).toContain("5%");
    expect(answerChat("Service charge உள்ளதா?", MENU, { ...rctx(), language: "ta" }).text).toContain("2%");
  });
  it("menu summary derives live numbers", () => {
    const r = answerChat("Tell me about the menu.", MENU, rctx());
    expect(r.text).toContain("12 items");
    expect(r.text).toContain("11 available");
  });
  it("hours never hallucinated, in all languages", () => {
    for (const [q, lang] of [["What time does this restaurant open?", "en"], ["restaurant open time enna?", "tanglish"], ["கடை எப்போ திறக்கும்?", "ta"]] as const) {
      const r = answerChat(q, MENU, ctx({ language: lang }));
      expect(r.text).not.toMatch(/9 AM|10 AM|8 PM/);
    }
  });
  it("unsupported metadata (parking/wifi) never invented", () => {
    const r = answerChat("Do you have parking and wifi?", MENU, rctx());
    expect(r.text).not.toMatch(/parking available|wifi available|yes.*parking/i);
  });
});

describe("food detail/range/count knowledge", () => {
  it("detail answer uses the real doc", () => {
    const r = answerChat("Tell me about Hyderabadi Chicken Dum Biriyani.", MENU, ctx());
    expect(r.text).toContain("Hyderabadi Chicken Dum Biriyani");
    expect(r.text).toContain("280");
    expect(r.text).toContain("Biriyani");
    expect(r.suggestions![0].menuItemId).toBe("h");
  });
  it("category-of item", () => {
    expect(answerChat("Butter Chicken entha category?", MENU, ctx()).text).toContain("Non-Veg Curries");
  });
  it("price range 100-200 filters by real prices", () => {
    const r = answerChat("Show me food between ₹100 and ₹200.", MENU, ctx());
    expect(r.suggestions!.length).toBeGreaterThan(0);
    for (const s of r.suggestions!) {
      expect(s.price).toBeGreaterThanOrEqual(100);
      expect(s.price).toBeLessThanOrEqual(200);
    }
  });
  it("most expensive computed from available items, not hardcoded", () => {
    const r = answerChat("What is the most expensive food?", MENU, ctx());
    expect(r.text).toContain("Mutton Biriyani");
    expect(r.text).toContain("340");
  });
  it("biriyani count", () => {
    const r = answerChat("How many biriyani items do you have?", MENU, ctx());
    expect(r.text).toContain("3");
  });
  it("invalid food detail invents nothing", () => {
    const r = answerChat("Tell me about volcano pizza xyzq", MENU, ctx());
    expect(r.text).not.toContain("volcano");
    expect(r.intent).toBeUndefined();
    expect(r.suggestions || []).toEqual([]);
  });
  it("tanglish + tamil detail/range", () => {
    expect(answerChat("mutton biriyani evlo?", MENU, ctx({ language: "tanglish" })).text).toContain("340");
    expect(answerChat("200 ku keela ena iruku?", MENU, ctx({ language: "tanglish" })).suggestions!.length).toBeGreaterThan(0);
    expect(answerChat("₹100 முதல் ₹200 வரை உணவு காட்டு", MENU, ctx({ language: "ta" })).suggestions!.length).toBeGreaterThan(0);
    expect(answerChat("அதிக விலை உணவு எது?", MENU, ctx({ language: "ta" })).text).toContain("Mutton Biriyani");
  });
});

describe("it-followup + question-vs-order safety", () => {
  it("'is it available' resolves single-item context", () => {
    const first = answerChat("Tell me about Mutton Biriyani", MENU, ctx());
    const follow = answerChat("is it available?", MENU, ctx({ lastIds: first.scopeIds }));
    expect(follow.text).toMatch(/yes/i);
    expect(follow.text).toContain("Mutton Biriyani");
  });
  it("price question never mutates cart path", () => {
    const r = answerChat("How much is Mutton Biriyani?", MENU, ctx());
    expect(r.intent).toBeUndefined();
    expect(r.text).toContain("340");
  });
  it("order still requires preview", () => {
    const r = answerChat("Give me two Mutton Biriyani.", MENU, ctx());
    expect(r.intent!.items[0].menuItemId).toBe("mb");
    expect(r.intent!.items[0].quantity).toBe(2);
  });
});

describe("answerChat Tamil", () => {
  const tctx = () => ctx({ language: "ta" });
  it("என்ன பிரியாணி இருக்கு?", () => {
    const r = answerChat("என்ன பிரியாணி இருக்கு?", MENU, tctx());
    expect(r.text).toContain("Hyderabadi Chicken Dum Biriyani");
  });
  it("மட்டன் பிரியாணி எவ்வளவு?", () => {
    expect(answerChat("மட்டன் பிரியாணி எவ்வளவு?", MENU, tctx()).text).toContain("340");
  });
  it("இரண்டு சிக்கன் பிரியாணி வேண்டும் orders ×2", () => {
    const r = answerChat("இரண்டு சிக்கன் பிரியாணி வேண்டும்", MENU, tctx());
    expect(r.intent!.items[0].menuItemId).toBe("h");
    expect(r.intent!.items[0].quantity).toBe(2);
  });
  it("hours missing in tamil", () => {
    expect(answerChat("கடை எப்போ திறக்கும்?", MENU, tctx()).text).toContain("கிடைக்கவில்லை");
  });
});

describe("restaurant open status + missing data (3 languages)", () => {
  it("bare open status uses real isActive, never hours", () => {
    expect(answerChat("Is the restaurant open?", MENU, ctx()).text).toMatch(/open/i);
    expect(answerChat("restaurant open ah?", MENU, ctx({ language: "tanglish" })).text).toMatch(/open/i);
    expect(answerChat("உணவகம் திறந்திருக்கிறதா?", MENU, ctx({ language: "ta" })).text).toContain("meto's");
    const closed = answerChat("Is the restaurant open?", MENU, ctx({ isActive: false }));
    expect(closed.text).toMatch(/closed/i);
  });
  it("time questions never hallucinate hours", () => {
    expect(answerChat("What time does this restaurant open?", MENU, ctx()).text).toMatch(/aren't available/i);
    expect(answerChat("restaurant open time enna?", MENU, ctx({ language: "tanglish" })).text).toMatch(/available illa/);
    expect(answerChat("கடை எப்போ திறக்கும்?", MENU, ctx({ language: "ta" })).text).toContain("கிடைக்கவில்லை");
  });
  it("phone missing never invents a number", () => {
    const noPhone = ctx({ phone: "" });
    for (const [q, lang] of [["What is the phone number?", "en"], ["phone number ena?", "tanglish"], ["தொலைபேசி எண் என்ன?", "ta"]] as const) {
      const r = answerChat(q, MENU, ctx({ ...noPhone, language: lang }));
      expect(r.text).not.toMatch(/99999|98765|\+91/);
      expect(r.intent).toBeUndefined();
    }
  });
  it("unsupported metadata never invented", () => {
    for (const q of ["Do you have parking?", "Is wifi available?", "Do you deliver?", "Any offers today?", "What ingredients are in biriyani?", "How many calories?"]) {
      const r = answerChat(q, MENU, ctx());
      expect(r.text).not.toMatch(/yes.*(parking|wifi|deliver|offer)/i);
      expect(r.text).not.toMatch(/parking available|wifi available|free delivery/i);
      expect(r.intent).toBeUndefined();
    }
  });
  it("called-word is a name question, not a phone hijack", () => {
    expect(answerChat("What is this restaurant called?", MENU, ctx()).text).toContain("meto's");
  });
  it("restaurant summary includes live menu + categories", () => {
    const r = answerChat("Tell me about this restaurant.", MENU, ctx());
    expect(r.text).toContain("meto's");
    expect(r.text).toContain("12 items");
    expect(r.text).toContain("Biriyani");
  });
});

describe("complete food knowledge (3 languages)", () => {
  it("cheapest overall + most expensive overall", () => {
    expect(answerChat("What is the cheapest item?", MENU, ctx()).text).toContain("Fresh Lime Soda");
    expect(answerChat("cheapest food ena?", MENU, ctx({ language: "tanglish" })).text).toContain("Fresh Lime Soda");
    expect(answerChat("மிகக் குறைந்த விலை உணவு எது?", MENU, ctx({ language: "ta" })).text).toContain("Fresh Lime Soda");
    expect(answerChat("What is the most expensive item?", MENU, ctx()).text).toContain("Mutton Biriyani");
  });
  it("cheapest biriyani + cheapest dosa scoped", () => {
    expect(answerChat("cheapest biriyani?", MENU, ctx()).text).toContain("Egg Biriyani");
    expect(answerChat("cheap dosa ena?", MENU, ctx({ language: "tanglish" })).text).toContain("Plain Dosa");
    expect(answerChat("குறைந்த விலை தோசை எது?", MENU, ctx({ language: "ta" })).text).toContain("Plain Dosa");
  });
  it("under-200 and 100-200 ranges use real prices", () => {
    const u = answerChat("What foods are under ₹200?", MENU, ctx());
    expect(u.suggestions!.length).toBeGreaterThan(0);
    for (const s of u.suggestions!) expect(s.price).toBeLessThanOrEqual(200);
    const rg = answerChat("Show me food between ₹100 and ₹200.", MENU, ctx());
    for (const s of rg.suggestions!) {
      expect(s.price).toBeGreaterThanOrEqual(100);
      expect(s.price).toBeLessThanOrEqual(200);
    }
    expect(answerChat("200 ku keela ena iruku?", MENU, ctx({ language: "tanglish" })).suggestions!.length).toBeGreaterThan(0);
    expect(answerChat("₹200 க்குள் என்ன உணவு உள்ளது?", MENU, ctx({ language: "ta" })).suggestions!.length).toBeGreaterThan(0);
  });
  it("category discovery: desserts, drinks, chicken, seafood", () => {
    expect(answerChat("What desserts do you have?", MENU, ctx()).text).toContain("Gulab Jamun");
    expect(answerChat("What drinks do you have?", MENU, ctx()).text).toContain("Fresh Lime Soda");
    expect(answerChat("Show me seafood.", MENU, ctx()).text).toContain("Fish Curry");
    expect(answerChat("chicken items ena iruku?", MENU, ctx({ language: "tanglish" })).text).toContain("Chicken 65");
    expect(answerChat("டெசர்ட் என்ன இருக்கிறது?", MENU, ctx({ language: "ta" })).text).toContain("Gulab Jamun");
    expect(answerChat("seafood kaatu", MENU, ctx({ language: "tanglish" })).text).toContain("Fish Curry");
  });
  it("categories answer is dynamic, never hardcoded", () => {
    const r = answerChat("What categories do you have?", MENU, ctx());
    expect(r.text).toContain("Biriyani");
    expect(r.text).toContain("Seafood");
    expect(r.text).toContain("Desserts");
  });
  it("Tamil price question never becomes an order", () => {
    const r = answerChat("மட்டன் பிரியாணி எவ்வளவு?", MENU, ctx({ language: "ta" }));
    expect(r.text).toContain("340");
    expect(r.intent).toBeUndefined();
  });
});

describe("follow-up + ordering safety", () => {
  it("show chicken → under 250 filters previous scope", () => {
    const first = answerChat("Show chicken dishes", MENU, ctx());
    expect(first.scopeIds!.length).toBeGreaterThan(0);
    const follow = answerChat("under 250", MENU, ctx({ lastIds: first.scopeIds, lastLabel: "chicken" }));
    expect(follow.suggestions!.length).toBeGreaterThan(0);
    for (const s of follow.suggestions!) expect(s.price).toBeLessThanOrEqual(250);
  });
  it("mutton details → is it available resolves", () => {
    const first = answerChat("Tell me about Mutton Biriyani", MENU, ctx());
    const follow = answerChat("is it available?", MENU, ctx({ lastIds: first.scopeIds }));
    expect(follow.text).toContain("Mutton Biriyani");
  });
  it("volcano pizza invents nothing, mutates nothing", () => {
    const r = answerChat("Tell me about volcano pizza xyzq", MENU, ctx());
    expect(r.text).not.toContain("volcano");
    expect(r.intent).toBeUndefined();
    expect(r.suggestions || []).toEqual([]);
  });
});
