import { formatCurrency } from "../../utils/formatting";
import type { OrderIntent, NaturalLanguageIntent } from "../../types/aiOrder";
import type { MenuItem } from "../../types/menu";

export function OrderIntentPreview({
  intent,
  menu,
  onAdd,
  onCancel,
  onEdit,
  ambiguous,
}: {
  intent: OrderIntent;
  menu: MenuItem[];
  onAdd: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  ambiguous?: OrderIntent["ambiguous"];
}) {
  const hasItems = intent.items.length > 0;
  const hasAmbiguousItems = !!(ambiguous && ambiguous.length > 0);

  // Calculate preview total using authoritative menu prices
  const total = intent.items.reduce((sum, it) => {
    const m = menu.find((x) => x.id === it.menuItemId);
    return sum + (m ? m.price * it.quantity : 0);
  }, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intent-title"
      className="bg-white rounded-2xl border border-surface-200 shadow-medium p-5 mt-4"
    >
      <h3 id="intent-title" className="font-bold text-ink-900">
        {hasItems ? "Detected order" : "No items detected"}
      </h3>

      {hasAmbiguousItems && ambiguous && (
        <div className="mt-3 space-y-2" role="alert" aria-live="polite">
          {ambiguous.map((a: { query: string; options: Array<{ id: string; name: string }> }) => (
            <div key={a.query} className="bg-warning-50 border border-warning-100 rounded-xl p-3">
              <p className="text-sm font-medium text-warning-700" id={`ambig-${a.query}`}>
                Which {a.query} would you like?
              </p>
              <div className="flex flex-wrap gap-2 mt-2" role="group" aria-labelledby={`ambig-${a.query}`}>
                {a.options.map((opt: { id: string; name: string }) => (
                  <span
                    key={opt.id}
                    className="px-3 py-1.5 rounded-full bg-white border border-surface-200 text-sm font-medium text-ink-700"
                  >
                    {opt.name}
                  </span>
                ))}
              </div>
              <p className="text-xs text-warning-600 mt-1">Please specify, e.g. "Chicken Biryani"</p>
            </div>
          ))}
        </div>
      )}

      {!hasItems && !hasAmbiguousItems && (
        <p className="text-sm text-ink-500 mt-2" role="status">
          I couldn't find matching items. Try: "2 chicken biryani" or "one paneer butter masala"
        </p>
      )}

      {hasItems && (
        <div className="mt-3 space-y-2" role="list" aria-label="Detected items">
          {intent.items.map((it) => {
            const m = menu.find((x) => x.id === it.menuItemId);
            const price = m?.price ?? 0;
            return (
              <div
                key={it.menuItemId}
                role="listitem"
                className="flex items-center justify-between bg-surface-50 rounded-xl px-3 py-2.5 border border-surface-100"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-success-600">
                    ✓
                  </span>
                  <span className="font-medium text-ink-900" aria-label={`${it.name} quantity ${it.quantity}`}>
                    {it.name} × {it.quantity}
                  </span>
                  {!it.available && (
                    <span className="text-xs bg-danger-50 text-danger-700 border border-danger-100 px-2 py-0.5 rounded-full">
                      Unavailable
                    </span>
                  )}
                </span>
                <span className="font-semibold text-ink-900" aria-label={`Price ${formatCurrency(price * it.quantity)}`}>
                  {formatCurrency(price * it.quantity)}
                </span>
              </div>
            );
          })}
          <div className="flex justify-between font-bold text-ink-900 border-t border-surface-200 pt-2 mt-2">
            <span>Preview total</span>
            <span>{formatCurrency(total)}</span>
          </div>
          <p className="text-xs text-ink-400">GST and service charge will be calculated at checkout.</p>
        </div>
      )}

      <div className="flex gap-3 mt-4">
        <button
          onClick={onAdd}
          disabled={!hasItems || intent.items.some((it) => !it.available)}
          aria-label="Confirm detected order"
          className="flex-1 py-3 rounded-xl bg-ink-900 text-white font-semibold hover:bg-ink-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Add to Cart
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            aria-label="Edit detected order"
            className="px-4 py-3 rounded-xl bg-white border border-surface-200 text-ink-700 font-medium hover:bg-surface-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Edit
          </button>
        )}
        <button
          onClick={onCancel}
          aria-label="Cancel detected order"
          className="px-4 py-3 rounded-xl bg-white border border-surface-200 text-ink-700 font-medium hover:bg-surface-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Cancel
        </button>
      </div>

      {intent.items.some((it) => !it.available) && (
        <p className="text-xs text-danger-600 mt-2" role="alert">
          Some items are unavailable or out of stock and will not be added.
        </p>
      )}
    </div>
  );
}

export function NaturalIntentPreview({
  intent,
  menu,
  onAdd,
  onCancel,
  onRemove,
}: {
  intent: NaturalLanguageIntent;
  menu: MenuItem[];
  onAdd: (ids: string[]) => void;
  onCancel: () => void;
  onRemove?: (id: string) => void;
}) {
  if (intent.noMatch) {
    return (
      <div className="bg-white rounded-2xl border border-surface-200 shadow-medium p-5 mt-4" role="alert">
        <h3 className="font-bold text-ink-900">No match</h3>
        <p className="text-sm text-ink-500 mt-1">{intent.reason || "No matching item is currently available."}</p>
        <button
          onClick={onCancel}
          className="mt-3 px-4 py-2 rounded-xl bg-white border border-surface-200 text-ink-700 font-medium"
          aria-label="Close no match"
        >
          Browse menu
        </button>
      </div>
    );
  }

  const total = intent.matches.reduce((sum, m) => {
    const menuItem = menu.find((x) => x.id === m.menuItemId);
    return sum + (menuItem ? menuItem.price * m.quantity : 0);
  }, 0);

  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-medium p-5 mt-4" role="dialog" aria-modal="true" aria-labelledby="nl-title">
      <h3 id="nl-title" className="font-bold text-ink-900">Suggestions for you</h3>
      <p className="text-xs text-ink-500 mt-1">Tap to add — prices from menu, not AI.</p>
      <div className="mt-3 space-y-2" role="list" aria-label="Suggested items">
        {intent.matches.map((m) => {
          const menuItem = menu.find((x) => x.id === m.menuItemId);
          return (
            <div key={m.menuItemId} role="listitem" className="flex items-center justify-between bg-surface-50 rounded-xl px-3 py-2.5 border border-surface-100 gap-2">
              <span className="flex-1 font-medium text-ink-900 flex items-center gap-2" aria-label={`${m.name} quantity ${m.quantity}`}>
                <span>{m.name} × {m.quantity}</span>
                {!m.available && <span className="text-xs bg-danger-50 text-danger-700 px-2 py-0.5 rounded-full">Unavailable</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-ink-900 text-sm">{menuItem ? formatCurrency(menuItem.price * m.quantity) : ""}</span>
                <button
                  onClick={() => onRemove?.(m.menuItemId)}
                  aria-label={`Remove ${m.name}`}
                  className="w-8 h-8 rounded-lg bg-white border border-surface-200 text-ink-500 hover:bg-danger-50 hover:text-danger-600 hover:border-danger-200 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500"
                  title="Remove"
                >
                  <span aria-hidden="true" className="text-sm">✕</span>
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {total > 0 && (
        <div className="flex justify-between font-bold text-ink-900 border-t border-surface-200 pt-2 mt-3">
          <span>Preview</span>
          <span>{formatCurrency(total)}</span>
        </div>
      )}
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => onAdd(intent.matches.map((m) => m.menuItemId))}
          disabled={intent.matches.some((m) => !m.available)}
          className="flex-1 py-3 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50"
          aria-label="Add suggestions to cart"
        >
          Add to Cart
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-3 rounded-xl bg-white border border-surface-200 text-ink-700 font-medium"
          aria-label="Cancel suggestions"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
