import { useState, useRef } from "react";
import { Sparkles, Loader2, Search, X } from "lucide-react";
import { parseNaturalLanguage } from "../../services/naturalLanguageOrderService";
import type { MenuItem } from "../../types/menu";
import type { NaturalLanguageIntent } from "../../types/aiOrder";
import { NaturalIntentPreview } from "./OrderIntentPreview";
import { AccessibleStatus } from "./AccessibleStatus";
import { useCart } from "../../context/CartContext";

export function NaturalLanguageOrder({
  restaurantId,
  menu,
}: {
  restaurantId: string;
  menu: MenuItem[];
}) {
  const { add } = useCart();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<NaturalLanguageIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("Ask SmartDine — type what you want");
  const inputRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim().slice(0, 500);
    if (!q) {
      setError("Please enter what you'd like, e.g. 'something spicy under 500 for two'");
      setLiveMessage("Please enter a request");
      return;
    }
    if (q.length < 2) {
      setError("Please enter a longer request");
      return;
    }
    setLoading(true);
    setError(null);
    setIntent(null);
    setLiveMessage("Finding suggestions...");

    try {
      const res = await parseNaturalLanguage(restaurantId, q, menu);
      setIntent(res);
      if (res.noMatch) {
        setLiveMessage("No matching items found");
      } else {
        setLiveMessage(`Found ${res.matches.length} suggestions`);
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || "Smart recommendations are temporarily unavailable.";
      setError(msg);
      setLiveMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = (ids: string[]) => {
    for (const id of ids) {
      const match = intent?.matches.find((m) => m.menuItemId === id);
      const menuItem = menu.find((m) => m.id === id);
      if (!menuItem || !match) continue;
      if (!match.available) continue;
      add(menuItem, match.quantity);
    }
    setIntent(null);
    setQuery("");
    setLiveMessage("Added to cart");
    setError(null);
    inputRef.current?.focus();
  };

  const handleRemove = (id: string) => {
    if (!intent) return;
    const nextMatches = intent.matches.filter((m) => m.menuItemId !== id);
    if (nextMatches.length === 0) {
      setIntent({ ...intent, matches: [], noMatch: true, reason: "No matching item is currently available." });
      setLiveMessage("Removed last suggestion");
    } else {
      setIntent({ ...intent, matches: nextMatches });
      const removed = intent.matches.find((m) => m.menuItemId === id);
      setLiveMessage(removed ? `Removed ${removed.name}` : "Removed suggestion");
    }
  };

  const handleCancel = () => {
    setIntent(null);
    setError(null);
    setLiveMessage("Ask SmartDine — type what you want");
  };

  const showPreview = intent !== null;

  return (
    <section aria-labelledby="nl-title" className="bg-white rounded-2xl border border-surface-200 shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="nl-title" className="font-bold tracking-tight text-ink-900 flex items-center gap-2">
            <span aria-hidden="true">✨</span> Ask SmartDine
          </h2>
          <p className="text-sm text-ink-500 mt-1">Describe what you want — we’ll find it in the menu</p>
          <p className="text-xs text-ink-400 mt0.5">e.g. “vegetarian under ₹400 for two” or “rendu biryani venum”</p>
        </div>
        {(intent || error) && (
          <button
            onClick={handleCancel}
            aria-label="Clear natural language results"
            className="p-2 rounded-xl hover:bg-surface-50 text-ink-400"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <AccessibleStatus message={liveMessage} />
      {error && <AccessibleStatus message={error} level="assertive" />}

      <form onSubmit={handleSubmit} className="mt-4" noValidate>
        <label htmlFor="nl-input" className="sr-only">
          Describe what you want to order
        </label>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" aria-hidden="true" />
          <input
            ref={inputRef}
            id="nl-input"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!touched) setTouched(true);
              if (error) setError(null);
            }}
            placeholder="I want something spicy under 500 for two..."
            aria-label="Describe what you want to order"
            aria-describedby="nl-help"
            autoComplete="off"
            maxLength={500}
            className="w-full pl-10 pr-[96px] py-3 rounded-2xl border border-surface-200 bg-white text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={loading}
            aria-label="Ask SmartDine"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Ask
          </button>
        </div>
        <p id="nl-help" className="text-xs text-ink-400 mt-2">
          Supports English, Tamil, Tanglish. We never invent dishes — only from this restaurant’s menu.
        </p>
        {touched && query.length > 0 && query.length < 2 && (
          <p className="text-xs text-danger-600 mt-1" role="alert">
            Please enter at least 2 characters.
          </p>
        )}
        {error && !intent && (
          <p className="text-sm text-danger-600 mt-2" role="alert">
            {error}
          </p>
        )}
      </form>

      {/* Quick chips for common intents */}
      {!intent && !loading && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Try these">
          <span className="text-xs text-ink-400 py-1.5">Try:</span>
          {[
            "Vegetarian under 400",
            "Something spicy",
            "For two people",
            "Enakku veg venum",
            "Rendu dosa",
          ].map((chip) => (
            <button
              key={chip}
              onClick={() => {
                setQuery(chip);
                // auto submit after chip
                setTimeout(() => {
                  const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                  // We need to handle form submit with chip value — set query then call handleSubmit with current chip
                  // Use direct call
                  (async () => {
                    setLoading(true);
                    setError(null);
                    setIntent(null);
                    setLiveMessage("Finding suggestions...");
                    try {
                      const res = await parseNaturalLanguage(restaurantId, chip, menu);
                      setIntent(res);
                      setLiveMessage(res.noMatch ? "No matching items" : `Found ${res.matches.length} suggestions`);
                    } catch (err: unknown) {
                      setError((err as Error).message || "Smart recommendations are temporarily unavailable.");
                    } finally {
                      setLoading(false);
                    }
                  })();
                }, 0);
              }}
              className="px-3 py-1.5 rounded-full bg-surface-50 border border-surface-200 text-xs font-medium text-ink-600 hover:bg-surface-100"
              aria-label={`Try ${chip}`}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-ink-500" role="status" aria-live="polite">
          <Loader2 className="w-4 h-4 animate-spin" />
          Finding best matches...
        </div>
      )}

      {showPreview && intent && (
        <NaturalIntentPreview intent={intent} menu={menu} onAdd={handleAdd} onCancel={handleCancel} onRemove={handleRemove} />
      )}
    </section>
  );
}
