import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, Plus, Minus, ShoppingBag, X, UtensilsCrossed, TriangleAlert, PauseCircle, QrCode, SearchX, Lock } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useRestaurant } from "../../hooks/useRestaurant";
import { useMenu } from "../../hooks/useMenu";
import { getTable } from "../../services/tableService";
import { useCart } from "../../context/CartContext";
import { formatCurrency } from "../../utils/formatting";
import { formatAddToCartLabel, formatSearchAnnouncement } from "../../utils/announcements";
import { getOrCreateSessionId, setRestaurantContext } from "../../utils/session";
import type { Table } from "../../types/table";
import { PageLoader } from "../../components/common/Spinner";
import { ErrorState, EmptyState } from "../../components/common/States";
import ServiceRequestPanel from "../../components/customer/ServiceRequestPanel";
import { VoiceOrder } from "../../components/customer/VoiceOrder";
import { NaturalLanguageOrder } from "../../components/customer/NaturalLanguageOrder";
import { AdaptivePrefsStrip } from "../../components/customer/AdaptivePrefsStrip";
import { ListenAnnouncer } from "../../components/customer/ListenAnnouncer";
import { ReadAloudButton } from "../../components/customer/ReadAloudButton";
import { useAdaptivePrefs } from "../../context/AdaptivePrefsContext";

export default function CustomerMenu() {
  const { restaurantId = "", tableId = "" } = useParams();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [table, setTable] = useState<Table | null>(null);
  const [invalid, setInvalid] = useState<false | "loading" | "table" | "restaurant" | "access" | "occupied">("loading");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [query, setQuery] = useState("");

  const { restaurant, loading: rLoading } = useRestaurant(restaurantId);
  const { categories, items, loading: mLoading } = useMenu(restaurantId);

  useEffect(() => {
    if (import.meta.env.DEV) console.log("[QR_SESSION] menu loaded", {
      restaurantId,
      tableId,
      hasQrToken: !!token,
    });
    setRestaurantContext(restaurantId, tableId, token);
    if (import.meta.env.DEV) console.log("[QR_SESSION] session saved", {
      restaurantId,
      tableId,
      hasQrToken: !!token,
    });
    if (!restaurantId || !tableId) {
      setInvalid("table");
      return;
    }
    getTable(restaurantId, tableId)
      .then(async (t) => {
        if (!t || !t.isActive || t.qrToken !== token) {
          setInvalid("table");
        } else if ((t as unknown as { isAccessAvailable?: boolean }).isAccessAvailable === false) {
          setInvalid("access");
        } else if (await isClaimedByAnotherSession(restaurantId, t)) {
          setTable(t);
          setInvalid("occupied");
        } else {
          setTable(t);
          setInvalid(false);
        }
      })
      .catch(() => setInvalid("table"));
  }, [restaurantId, tableId, token]);

  const { add, count, total, setOpen, lines, setQuantity } = useCart();
  const { prefs, setPrefs } = useAdaptivePrefs();
  // Polite, debounced search-result announcement for screen readers.
  const [searchStatus, setSearchStatus] = useState("");

  function scrollToId(id: string) {
    if (typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function focusSearchInput() {
    if (typeof document === "undefined") return;
    window.setTimeout(() => {
      document.getElementById("sd-search-input")?.focus({ preventScroll: true });
    }, 450);
  }

  function handleSpeak() {
    setPrefs({ voiceHints: true });
    scrollToId("sd-voice");
    // This runs inside the customer's explicit Speak click: activate the
    // voice interface — focus the mic control and ask VoiceOrder to start
    // listening. The browser may still require a permission grant; denials
    // and unsupported browsers show guidance instead of faking success.
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        document.getElementById("sd-voice-mic")?.focus({ preventScroll: true });
      }, 450);
      window.dispatchEvent(new CustomEvent("sd:start-voice"));
    }
  }

  const activeItems = useMemo(() => {
    let list = items;
    if (activeCat !== "all") list = list.filter((i) => i.categoryId === activeCat);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const catMap = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
      list = list.filter((i) => {
        return (
          i.name.toLowerCase().includes(q) ||
          (catMap.get(i.categoryId) || "").includes(q)
        );
      });
    }
    return list;
  }, [items, categories, activeCat, query]);

  // Announce settled search results once (debounced) — never per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchStatus(formatSearchAnnouncement(activeItems.length, query));
    }, 600);
    return () => window.clearTimeout(t);
  }, [activeItems.length, query]);

  if (invalid === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <PageLoader label="Loading restaurant..." />
      </div>
    );
  }

  if (invalid === "access") {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <TriangleAlert className="w-7 h-7 text-amber-600" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900">Table currently unavailable</h1>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">Please contact the restaurant staff for assistance.</p>
        </div>
      </div>
    );
  }

  if (invalid === "occupied") {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <Lock className="w-7 h-7 text-amber-600" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900">
            Table {table?.tableNumber ?? ""} is currently occupied
          </h1>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">
            This table already has an active order. Please wait until the current
            order is completed and payment is confirmed.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="pressable mt-5 px-4 py-2.5 min-h-[42px] bg-ink-900 text-white rounded-xl text-sm font-semibold hover:bg-ink-700"
          >
            Check again
          </button>
        </div>
      </div>
    );
  }

  if (invalid === "table" || !restaurantId) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <div className="w-14 h-14 rounded-2xl bg-surface-50 border border-surface-200 flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <QrCode className="w-7 h-7 text-ink-400" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900">Table not available</h1>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">
            This QR code is invalid or inactive. Please contact restaurant staff.
          </p>
        </div>
      </div>
    );
  }

  if (!restaurant || rLoading || mLoading) {
    return (
      <div className="min-h-screen bg-surface-50">
        <PageLoader label="Loading menu..." />
      </div>
    );
  }

  if (!restaurant.isActive) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <div className="w-14 h-14 rounded-2xl bg-surface-50 border border-surface-200 flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <PauseCircle className="w-7 h-7 text-ink-400" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900">Restaurant closed</h1>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">This restaurant is currently not accepting orders.</p>
        </div>
      </div>
    );
  }

  const visibleCategories = categories.filter((c) => c.isActive);

  return (
    <main aria-label={`${restaurant?.name || "Restaurant"} menu`} className="min-h-screen bg-surface-50 pb-28">
      <header className="bg-ink-900 text-white">
        <div className="max-w-lg mx-auto px-4 py-6">
          <div className="flex items-center gap-3.5">
            {restaurant.logoUrl ? (
              <img
                src={restaurant.logoUrl}
                alt={`${restaurant.name} logo`}
                className="w-14 h-14 rounded-2xl object-cover bg-white shadow-sm border border-white/20"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-xl font-bold border border-white/15" aria-hidden="true">
                {restaurant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">{restaurant.name}</h1>
              <p className="text-white/65 text-[13px] mt-0.5 line-clamp-1">{restaurant.description || "Fresh flavors, fast service"}</p>
              {table && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white text-ink-900 rounded-full px-2.5 py-1 mt-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" aria-hidden="true" />
                  Table {table.tableNumber}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <AdaptivePrefsStrip
        onSpeak={handleSpeak}
        onBrowse={() => {
          setPrefs({ voiceHints: false });
          scrollToId("sd-search");
          focusSearchInput();
        }}
      />

      <ListenAnnouncer
        restaurantName={restaurant?.name || ""}
        tableNumber={table?.tableNumber ?? null}
        itemCount={items.length}
        categoryCount={visibleCategories.length}
        categoryNames={visibleCategories.map((c) => c.name)}
        cartCount={count}
        cartTotal={total}
      />

      <div id="sd-search" role="search" aria-label="Search the menu" className="max-w-lg mx-auto px-4 sticky top-0 z-20 bg-surface-50/95 backdrop-blur supports-[backdrop-filter]:bg-surface-50/85 py-3 scroll-mt-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" aria-hidden="true" />
          <input
            id="sd-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes, categories..."
            aria-label="Search menu"
            aria-describedby="sd-search-status"
            type="search"
            className="w-full pl-10 pr-10 py-3 min-h-[46px] rounded-2xl border border-surface-200 bg-white text-sm text-ink-900 placeholder:text-ink-400 shadow-card focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
          <div id="sd-search-status" role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {searchStatus}
          </div>
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="pressable absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-surface-50 hover:bg-surface-100 flex items-center justify-center text-ink-400 hover:text-ink-700"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4">
        <nav aria-label="Menu categories" className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-none">
          <button
            onClick={() => setActiveCat("all")}
            aria-pressed={activeCat === "all"}
            aria-label={`All menu items, ${items.length} items`}
            className={`pressable whitespace-nowrap px-4 py-2 min-h-[36px] rounded-full text-[13px] font-semibold border ${
              activeCat === "all" ? "bg-ink-900 text-white border-ink-900 shadow-sm" : "bg-white text-ink-600 border-surface-200 hover:border-surface-300"
            }`}
          >
            All
          </button>
          {visibleCategories.map((c) => {
            const catCount = items.filter((i) => i.categoryId === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                aria-pressed={activeCat === c.id}
                aria-label={`${c.name}, ${catCount} item${catCount === 1 ? "" : "s"}`}
                className={`pressable whitespace-nowrap px-4 py-2 min-h-[36px] rounded-full text-[13px] font-semibold border ${
                  activeCat === c.id ? "bg-ink-900 text-white border-ink-900 shadow-sm" : "bg-white text-ink-600 border-surface-200 hover:border-surface-300"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </nav>
      </div>

      {table && (
        <section aria-label="Service requests" className="max-w-lg mx-auto px-4 py-2">
          <ServiceRequestPanel
            restaurantId={restaurantId}
            tableId={tableId}
            tableNumber={table.tableNumber}
          />
        </section>
      )}

      {/* AI-assisted ordering — voice + natural language, mobile-first, accessible */}
      <section aria-label="Voice and text ordering" id="sd-voice" className="max-w-lg mx-auto px-4 py-3 space-y-4 scroll-mt-2">
        <div className="sr-only" aria-live="polite">
          SmartDine AI ordering available: voice and text
        </div>
        <VoiceOrder restaurantId={restaurantId} menu={items} />
        <NaturalLanguageOrder restaurantId={restaurantId} menu={items} />
      </section>

      <section aria-label={activeCat === "all" ? `All menu items, ${activeItems.length} shown` : `Menu items, ${activeItems.length} shown`} className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {activeItems.length === 0 && (
          <div className="bg-white rounded-2xl border border-surface-200 shadow-card">
            <EmptyState
              icon={query ? SearchX : UtensilsCrossed}
              title={query ? "No results found" : "No menu items"}
              description={query ? `No dishes match "${query.trim()}". Try a different search.` : "Items will appear here once the restaurant adds them."}
            />
          </div>
        )}
        {activeItems.map((item) => {
          const enabled = (item as unknown as { trackStock?: boolean; stockEnabled?: boolean }).trackStock || (item as unknown as { stockEnabled?: boolean }).stockEnabled;
          const qty = Number((item as unknown as { stockQuantity?: number }).stockQuantity);
          const threshold = Number((item as unknown as { lowStockThreshold?: number }).lowStockThreshold ?? 5);
          const isOut = enabled && qty <= 0;
          const lowStock = enabled && qty > 0 && qty <= threshold;
          const available = item.isAvailable && !isOut;
          return (
            <article key={item.id} className="bg-white rounded-2xl border border-surface-200 p-4 flex gap-3.5 shadow-card hover-lift">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                  className="w-20 h-20 rounded-xl object-cover shrink-0 border border-surface-100 bg-surface-50"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-surface-50 border border-surface-200 flex items-center justify-center shrink-0" aria-hidden="true">
                  <UtensilsCrossed className="w-7 h-7 text-ink-400" strokeWidth={1.5} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold tracking-tight text-[15px] text-ink-900 flex items-center gap-2 flex-wrap">
                  <span className="truncate">{item.name}</span>
                  {isOut && <span className="text-[11px] font-bold tracking-wide bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full shrink-0">Out of stock</span>}
                  {!isOut && lowStock && <span className="text-[11px] font-bold tracking-wide bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">Low stock</span>}
                </h3>
                {item.description && (
                  <p className="text-[13px] text-ink-500 line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                )}
                <div className="flex items-center justify-between gap-2 mt-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-ink-900 text-[15px] tabular-nums">{formatCurrency(item.price)}</span>
                    {prefs.listen && (
                      <ReadAloudButton
                        text={`${item.name}, ${Number.isFinite(item.price) ? Math.round(item.price) : item.price} rupees${available ? "" : ", not available"}`}
                        label={`${item.name} price`}
                      />
                    )}
                  </span>
                  {available ? (
                    (() => {
                      const line = lines.find((l) => l.menuItemId === item.id);
                      if (line && line.quantity > 0) {
                        return (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setQuantity(item.id, line.quantity - 1)}
                              className="pressable w-9 h-9 rounded-xl bg-surface-50 border border-surface-200 hover:border-surface-300 hover:bg-surface-100 flex items-center justify-center text-ink-700"
                              aria-label={`Remove one ${item.name}`}
                            >
                              <Minus className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <span className="w-6 text-center text-sm font-bold tabular-nums text-ink-900" aria-live="polite">{line.quantity}</span>
                            <button
                              onClick={() => add(item)}
                              className="pressable w-9 h-9 rounded-xl bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center shadow-sm"
                              aria-label={`Add one more ${item.name}`}
                            >
                              <Plus className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        );
                      }
                      return (
                        <button
                          onClick={() => add(item)}
                          className="pressable flex items-center gap-1 bg-ink-900 hover:bg-ink-700 text-white pl-3 pr-3.5 py-2 min-h-[36px] rounded-xl text-[13px] font-semibold"
                          aria-label={formatAddToCartLabel(item)}
                        >
                          <Plus className="w-4 h-4" aria-hidden="true" />
                          Add
                        </button>
                      );
                    })()
                  ) : (
                    <span className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border ${isOut ? "bg-red-50 text-red-700 border-red-200" : "bg-surface-50 text-ink-400 border-surface-200"}`}>
                      {isOut ? "Out of stock" : "Unavailable"}
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {count > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setOpen(true)}
            aria-label={`View cart, ${count} items, total ${formatCurrency(total)}`}
            className="pressable mx-auto w-full max-w-lg bg-ink-900 text-white pl-5 pr-4 py-3.5 min-h-[56px] rounded-2xl shadow-medium border border-white/10 flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2.5 font-semibold text-[15px]">
              <ShoppingBag className="w-5 h-5" aria-hidden="true" />
              View cart
              <span className="bg-brand-600 rounded-full min-w-[24px] h-6 px-1.5 inline-flex items-center justify-center text-xs font-bold tabular-nums">{count}</span>
            </span>
            <span className="font-bold tabular-nums">{formatCurrency(total)}</span>
          </button>
        </div>
      )}

      <CartDrawer menuItems={items} />
    </main>
  );
}

function NfcHint({
  restaurantId,
  tableId,
  token,
  tableNumber,
}: {
  restaurantId: string;
  tableId: string;
  token: string;
  tableNumber?: number;
}) {
  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);
  useEffect(() => {
    // Feature detection for Web NFC (Chrome Android)
    const hasNfc = typeof window !== "undefined" && "NDEFReader" in window;
    setNfcSupported(hasNfc);
    // Also check for NFC via navigator.nfc (future)
    // Graceful fallback: if not supported, hint is hidden or shows QR alternative
  }, []);

  const tableUrl = `${window.location.origin}/menu/${restaurantId}/${tableId}?token=${token}`;

  if (nfcSupported === false) {
    return (
      <div className="bg-white rounded-2xl border border-surface-200 p-3 flex items-center gap-3" role="status" aria-live="polite">
        <div className="w-8 h-8 rounded-xl bg-surface-50 border border-surface-200 flex items-center justify-center shrink-0" aria-hidden="true">
          <QrCode className="w-4 h-4 text-ink-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">Tap to order — QR ready</p>
          <p className="text-xs text-ink-500">
            Table {tableNumber ?? ""} • QR active
          </p>
        </div>
      </div>
    );
  }

  if (nfcSupported === null) return null;

  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-3 flex items-center gap-3" role="status">
      <div className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0" aria-hidden="true">
        <QrCode className="w-4 h-4 text-brand-700" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-900">NFC ready — tap phone to table tag</p>
        <p className="text-xs text-ink-500 break-all">URL: {tableUrl}</p>
      </div>
    </div>
  );
}

/**
 * True when the table holds a LIVE occupancy claim from another browser
 * session. Stale/finished/missing claims read as free so tables never strand.
 * Fail-closed: an unverifiable claim blocks with the occupied message.
 */
async function isClaimedByAnotherSession(
  restaurantId: string,
  table: Table
): Promise<boolean> {
  const mine = getOrCreateSessionId();
  if (!table.occupiedBy || table.occupiedBy === mine) return false;
  if (!table.currentOrderId) return false;
  try {
    const snap = await getDoc(
      doc(db, "restaurants", restaurantId, "orders", table.currentOrderId)
    );
    if (!snap.exists()) return false;
    const d = snap.data() as { status?: unknown; paymentStatus?: unknown };
    return (
      d.status === "PLACED" ||
      d.status === "PREPARING" ||
      d.status === "READY" ||
      (d.status === "SERVED" && d.paymentStatus !== "PAID")
    );
  } catch {
    return true;
  }
}

function CartDrawer({ menuItems }: { menuItems: import("../../types/menu").MenuItem[] }) {
  const { isOpen, setOpen, lines, total, count, setQuantity, remove, setInstruction } = useCart();
  const { prefs } = useAdaptivePrefs();
  const navigate = useNavigate();
  const [showInstructions, setShowInstructions] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasOpenRef = useRef(false);

  // Screen-reader focus management: land on the cart heading when opened.
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      headingRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Realtime availability sync: the menu snapshot updates live via useMenu,
  // so flag cart lines whose item was disabled or sold out after being added.
  const unavailableIds = useMemo(() => {
    const byId = new Map(menuItems.map((m) => [m.id, m]));
    const flagged = new Set<string>();
    for (const line of lines) {
      const item = byId.get(line.menuItemId);
      if (!item) {
        flagged.add(line.menuItemId); // removed from menu
        continue;
      }
      if (item.isAvailable === false) {
        flagged.add(line.menuItemId);
        continue;
      }
      const track = item.trackStock === true || item.stockEnabled === true;
      if (track && Number(item.stockQuantity) <= 0) flagged.add(line.menuItemId);
    }
    return flagged;
  }, [lines, menuItems]);
  const hasUnavailable = unavailableIds.size > 0;

  return (
    <div className={`fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`} role="dialog" aria-modal={isOpen || undefined} aria-label="Shopping cart" aria-hidden={!isOpen}>
      <div
        className={`absolute inset-0 bg-ink-900/45 transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0"}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`absolute right-0 top-0 h-[100dvh] w-full max-w-sm bg-white shadow-medium border-l border-surface-200 transition-transform duration-300 flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between gap-3">
          <h2 ref={headingRef} tabIndex={-1} className="text-[17px] font-bold tracking-tight text-ink-900 focus-visible:outline-none">
            Your cart {count > 0 && <span className="text-sm font-semibold text-ink-400">• {count} item{count > 1 ? "s" : ""}</span>}
          </h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close cart"
            className="pressable text-ink-400 hover:text-ink-700 p-2 -mr-1 rounded-xl hover:bg-surface-50 min-w-[38px] min-h-[38px] flex items-center justify-center"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto thin-scroll px-5 py-4 space-y-4">
          {lines.length === 0 && (
            <div className="py-8">
              <EmptyState icon={ShoppingBag} compact title="Your cart is empty" description="Add dishes from the menu to get started." />
            </div>
          )}
          {lines.map((line) => {
            const isUnavailable = unavailableIds.has(line.menuItemId);
            return (
            <div key={line.menuItemId} className={`border rounded-2xl p-3.5 ${isUnavailable ? "bg-amber-50/60 border-amber-200" : "bg-surface-50 border-surface-200"}`}>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14px] text-ink-900 truncate">{line.name}</div>
                <div className="text-[13px] font-semibold text-brand-700 tabular-nums mt-0.5">{formatCurrency(line.price)}</div>
                {isUnavailable && (
                  <p role="alert" className="mt-1.5 text-xs font-semibold text-amber-700">
                    This item is no longer available. Remove it to continue.
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <button
                    onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
                    aria-label={`Remove one ${line.name}`}
                    className="pressable w-8 h-8 rounded-xl bg-white border border-surface-200 hover:border-surface-300 flex items-center justify-center text-ink-700"
                  >
                    <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold tabular-nums" aria-live="polite">{line.quantity}</span>
                  <button
                    onClick={() => setQuantity(line.menuItemId, line.quantity + 1)}
                    aria-label={`Add one more ${line.name}`}
                    className="pressable w-8 h-8 rounded-xl bg-white border border-surface-200 hover:border-surface-300 flex items-center justify-center text-ink-700"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setShowInstructions(showInstructions === line.menuItemId ? null : line.menuItemId)}
                    aria-expanded={showInstructions === line.menuItemId}
                    className="ml-auto text-xs font-semibold text-ink-500 hover:text-brand-700 px-2 py-1.5 min-h-[32px]"
                  >
                    {showInstructions === line.menuItemId ? "Hide notes" : "Notes"}
                  </button>
                  <button
                    onClick={() => remove(line.menuItemId)}
                    aria-label={`Remove ${line.name} from cart`}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1.5 min-h-[32px]"
                  >
                    Remove
                  </button>
                </div>
                {showInstructions === line.menuItemId && (
                  <input
                    value={line.specialInstruction}
                    onChange={(e) => setInstruction(line.menuItemId, e.target.value)}
                    placeholder="Add note (e.g. less spicy)"
                    aria-label={`Special instructions for ${line.name}`}
                    className="mt-2.5 w-full px-3 py-2.5 min-h-[40px] rounded-xl border border-surface-200 bg-white text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                )}
              </div>
            </div>
            );
          })}
        </div>
        <div className="px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-surface-100 space-y-2.5 bg-white">
          <div className="flex justify-between text-sm text-ink-500">
            <span>Subtotal</span>
            <span className="font-semibold text-ink-900 tabular-nums">{formatCurrency(total)}</span>
          </div>
          <div className="flex justify-between items-center text-[15px] font-bold text-ink-900">
            <span className="flex items-center gap-2">
              Total
              {prefs.listen && (
                <ReadAloudButton
                  text={`Cart total ${Math.round(total)} rupees, ${count} item${count === 1 ? "" : "s"}`}
                  label="cart total"
                />
              )}
            </span>
            <span className="tabular-nums">{formatCurrency(total)}</span>
          </div>
          {hasUnavailable && lines.length > 0 && (
            <p role="alert" className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Remove unavailable items to continue to checkout.
            </p>
          )}
          <button
            onClick={() => {
              setOpen(false);
              navigate("/checkout");
            }}
            disabled={lines.length === 0 || hasUnavailable}
            className="pressable block w-full bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-center py-3 min-h-[48px] rounded-xl font-semibold text-[15px] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Proceed to checkout
          </button>
        </div>
      </div>
    </div>
  );
}
