import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, Plus, Minus, ShoppingBag, X } from "lucide-react";
import { useRestaurant } from "../../hooks/useRestaurant";
import { useMenu } from "../../hooks/useMenu";
import { getTable } from "../../services/tableService";
import { useCart } from "../../context/CartContext";
import { formatCurrency } from "../../utils/formatting";
import { setRestaurantContext } from "../../utils/session";
import type { Table } from "../../types/table";
import { PageLoader } from "../../components/common/Spinner";
import { ErrorState, EmptyState } from "../../components/common/States";

export default function CustomerMenu() {
  const { restaurantId = "", tableId = "" } = useParams();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [table, setTable] = useState<Table | null>(null);
  const [invalid, setInvalid] = useState<false | "loading" | "table" | "restaurant">("loading");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [query, setQuery] = useState("");

  const { restaurant, loading: rLoading } = useRestaurant(restaurantId);
  const { categories, items, loading: mLoading } = useMenu(restaurantId);

  useEffect(() => {
    console.log("[QR_SESSION] menu loaded", {
      restaurantId,
      tableId,
      hasQrToken: !!token,
    });
    setRestaurantContext(restaurantId, tableId, token);
    console.log("[QR_SESSION] session saved", {
      restaurantId,
      tableId,
      hasQrToken: !!token,
    });
    if (!restaurantId || !tableId) {
      setInvalid("table");
      return;
    }
    getTable(restaurantId, tableId)
      .then((t) => {
        if (!t || !t.isActive || t.qrToken !== token) {
          setInvalid("table");
        } else {
          setTable(t);
          setInvalid(false);
        }
      })
      .catch(() => setInvalid("table"));
  }, [restaurantId, tableId, token]);

  const { add, count, total, setOpen, lines, setQuantity } = useCart();

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

  if (invalid === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <PageLoader label="Loading restaurant..." />
      </div>
    );
  }

  if (invalid === "table" || !restaurantId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🍽️</div>
          <h1 className="text-2xl font-bold text-gray-800">Table Not Available</h1>
          <p className="text-gray-600 mt-2">
            This QR code is invalid or inactive. Please contact restaurant staff.
          </p>
        </div>
      </div>
    );
  }

  if (!restaurant || rLoading || mLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageLoader label="Loading menu..." />
      </div>
    );
  }

  if (!restaurant.isActive) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⏸️</div>
          <h1 className="text-2xl font-bold text-gray-800">Restaurant Closed</h1>
          <p className="text-gray-600 mt-2">This restaurant is currently not accepting orders.</p>
        </div>
      </div>
    );
  }

  const visibleCategories = categories.filter((c) => c.isActive);

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="bg-gradient-to-r from-brand-600 to-brand-700 text-white">
        <div className="max-w-lg mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            {restaurant.logoUrl ? (
              <img
                src={restaurant.logoUrl}
                alt={restaurant.name}
                className="w-14 h-14 rounded-full object-cover bg-white"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
                {restaurant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold">{restaurant.name}</h1>
              {table && (
                <span className="inline-flex items-center gap-1 text-sm bg-white/20 rounded-full px-2.5 py-0.5 mt-1">
                  Table {table.tableNumber}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 sticky top-0 z-20 bg-gray-50 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search food..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
          <button
            onClick={() => setActiveCat("all")}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeCat === "all" ? "bg-brand-600 text-white" : "bg-white text-gray-600 shadow-sm"
            }`}
          >
            All
          </button>
          {visibleCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeCat === c.id ? "bg-brand-600 text-white" : "bg-white text-gray-600 shadow-sm"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {activeItems.length === 0 && (
          <EmptyState
            title={query ? "No results found" : "No menu items"}
            description={query ? "Try a different search" : "Items will appear here"}
          />
        )}
        {activeItems.map((item) => {
          const available = item.isAvailable;
          return (
            <div key={item.id} className="bg-white rounded-xl shadow-sm p-4 flex gap-4">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
                  🍽️
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-800">{item.name}</h3>
                {item.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mt-0.5">{item.description}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-gray-900">{formatCurrency(item.price)}</span>
                  {available ? (
                    (() => {
                      const line = lines.find((l) => l.menuItemId === item.id);
                      if (line && line.quantity > 0) {
                        return (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setQuantity(item.id, line.quantity - 1)}
                              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-6 text-center font-semibold">{line.quantity}</span>
                            <button
                              onClick={() => add(item)}
                              className="w-8 h-8 rounded-lg bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      }
                      return (
                        <button
                          onClick={() => add(item)}
                          className="flex items-center gap-1 bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
                        >
                          <Plus className="w-4 h-4" />
                          ADD
                        </button>
                      );
                    })()
                  ) : (
                    <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1.5 rounded-lg">
                      Unavailable
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {count > 0 && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-lg bg-gray-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingBag className="w-5 h-5" />
            View Cart
            <span className="bg-brand-600 rounded-full px-2 py-0.5 text-xs font-bold">{count}</span>
          </span>
          <span className="font-bold">{formatCurrency(total)}</span>
        </button>
      )}

      <CartDrawer />
    </div>
  );
}

function CartDrawer() {
  const { isOpen, setOpen, lines, total, setQuantity, remove, setInstruction } = useCart();
  const navigate = useNavigate();
  const [showInstructions, setShowInstructions] = useState<string | null>(null);

  return (
    <div className={`fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "opacity-0"}`}
        onClick={() => setOpen(false)}
      />
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-sm bg-white shadow-xl transition-transform ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } flex flex-col`}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Your Cart</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {lines.length === 0 && (
            <p className="text-center text-gray-500 py-10">Your cart is empty</p>
          )}
          {lines.map((line) => (
            <div key={line.menuItemId} className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-medium text-gray-800">{line.name}</div>
                <div className="text-sm text-brand-600">{formatCurrency(line.price)}</div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
                    className="w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center font-medium">{line.quantity}</span>
                  <button
                    onClick={() => setQuantity(line.menuItemId, line.quantity + 1)}
                    className="w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowInstructions(showInstructions === line.menuItemId ? null : line.menuItemId)}
                    className="ml-auto text-xs text-gray-500 hover:text-brand-600"
                  >
                    Notes
                  </button>
                  <button
                    onClick={() => remove(line.menuItemId)}
                    className="text-xs text-red-500 hover:text-red-700 ml-2"
                  >
                    Remove
                  </button>
                </div>
                {showInstructions === line.menuItemId && (
                  <input
                    value={line.specialInstruction}
                    onChange={(e) => setInstruction(line.menuItemId, e.target.value)}
                    placeholder="Add note (e.g. less spicy)"
                    className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 space-y-3">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span className="font-semibold text-gray-800">{formatCurrency(total)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-gray-900">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              navigate("/checkout");
            }}
            className="block w-full bg-brand-600 hover:bg-brand-700 text-white text-center py-3 rounded-xl font-semibold"
          >
            Proceed to Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
