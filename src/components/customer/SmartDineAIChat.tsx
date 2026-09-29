import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles, Trash2, Plus, Languages } from "lucide-react";
import type { MenuItem, MenuCategory } from "../../types/menu";
import type { Restaurant } from "../../types/restaurant";
import type { OrderIntent } from "../../types/aiOrder";
import { useCart } from "../../context/CartContext";
import { useAdaptivePrefs, type AdaptiveLanguage } from "../../context/AdaptivePrefsContext";
import { formatCurrency } from "../../utils/formatting";
import {
  answerChat,
  type ChatReply,
  type ChatSuggestion,
} from "../../services/chatAssistant";
import {
  formatAddedAnnouncement,
} from "../../utils/announcements";
import { OrderIntentPreview } from "./OrderIntentPreview";
import { AccessibleStatus } from "./AccessibleStatus";

interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  text: string;
  suggestions?: ChatSuggestion[];
  intent?: OrderIntent;
  ambiguous?: ChatReply["ambiguous"];
}

const QUICK_PROMPTS: Record<AdaptiveLanguage, string[]> = {
  en: ["Show Biriyani", "Under ₹200", "Vegetarian", "Desserts", "Drinks", "What's in my cart?"],
  tanglish: ["Biriyani ena iruku", "₹200 kulla", "Veg items", "Desserts", "Drinks", "Cart la ena iruku?"],
  ta: ["என்ன பிரியாணி இருக்கு?", "₹200 க்குள்", "வெஜ்", "டெசர்ட்", "டிரிங்க்ஸ்", "கார்ட்-ல் என்ன இருக்கு?"],
};

const LANG_TABS: Array<{ code: AdaptiveLanguage; label: string }> = [
  { code: "en", label: "English" },
  { code: "tanglish", label: "Tanglish" },
  { code: "ta", label: "தமிழ்" },
];

let msgId = 0;
function nextId() {
  msgId += 1;
  return msgId;
}

/**
 * SmartDine AI Chat — floating assistant on the customer QR menu.
 * Desktop: right-side drawer. Mobile: bottom sheet. Session-only history.
 * Brain = existing deterministic engine (menu Q&A + matcher + resolver);
 * ordering flows through the existing OrderIntentPreview + CartContext.
 */
export function SmartDineAIChat({
  restaurantId,
  menu,
  categories,
  restaurant,
  tableNumber,
}: {
  restaurantId: string;
  menu: MenuItem[];
  categories: MenuCategory[];
  restaurant: Restaurant | null;
  tableNumber?: number | string | null;
}) {
  const { prefs, setPrefs } = useAdaptivePrefs();
  const { lines, total, add, setInstruction } = useCart();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveMessage, setLiveMessage] = useState("AI chat closed");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<{ ids: string[]; label: string } | null>(null);

  const lang = prefs.language;
  const prompts = QUICK_PROMPTS[lang];

  const menuById = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);

  // Focus into chat on open; back to trigger on close. Escape closes.
  useEffect(() => {
    if (open) {
      setLiveMessage("SmartDine AI chat opened");
      const t = window.setTimeout(() => inputRef.current?.focus(), 120);
      return () => window.clearTimeout(t);
    }
    triggerRef.current?.focus();
    return undefined;
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  // Keep latest message visible; announce only the newest assistant text.
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function buildCtx() {
    return {
      restaurantName: restaurant?.name || "Smart Dine",
      description: restaurant?.description || "",
      address: restaurant?.address || "",
      phone: restaurant?.phone || "",
      isActive: restaurant?.isActive !== false,
      gstPercent: restaurant?.gstPercent ?? 0,
      serviceChargePercent: restaurant?.serviceChargePercent ?? 0,
      tableNumber: tableNumber ?? null,
      categories,
      cart: lines.map((l) => ({ menuItemId: l.menuItemId, name: l.name, price: l.price, quantity: l.quantity })),
      cartTotal: total,
      language: lang,
      lastIds: scopeRef.current?.ids,
      lastLabel: scopeRef.current?.label,
    };
  }

  async function send(raw: string) {
    const q = raw.trim().slice(0, 500);
    if (!q || busy) return;
    const userMsg: ChatMsg = { id: nextId(), role: "user", text: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);
    try {
      // Engine is synchronous/deterministic; await a tick for loading paint.
      await new Promise((r) => window.setTimeout(r, 30));
      const reply = answerChat(q, menu, buildCtx());
      if (reply.scopeIds) {
        scopeRef.current = { ids: reply.scopeIds, label: reply.scopeLabel || q };
      }
      const assistant: ChatMsg = {
        id: nextId(),
        role: "assistant",
        text: reply.text,
        suggestions: reply.suggestions,
        intent: reply.intent,
        ambiguous: reply.ambiguous,
      };
      setMessages((prev) => [...prev, assistant]);
      setLiveMessage(reply.text);
    } catch {
      const fallback: ChatMsg = {
        id: nextId(),
        role: "assistant",
        text:
          lang === "ta"
            ? "மன்னிக்கவும், தற்போது பதிலளிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."
            : lang === "tanglish"
              ? "Sorry, ippo reply panna mudiyala. Retry pannunga."
              : "Sorry, I couldn't answer that right now. Please try again.",
      };
      setMessages((prev) => [...prev, fallback]);
      setLiveMessage(fallback.text);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function addSuggestion(s: ChatSuggestion) {
    const item = menuById.get(s.menuItemId);
    if (!item || item.isAvailable === false) return;
    add(item, 1);
    const msg: ChatMsg = {
      id: nextId(),
      role: "assistant",
      text: formatAddedAnnouncement([{ name: item.name, quantity: 1 }], total + (Number.isFinite(item.price) ? item.price : 0)),
    };
    setMessages((prev) => [...prev, msg]);
    setLiveMessage(msg.text);
  }

  function confirmIntent(intent: OrderIntent, msgIdOfPreview: number) {
    const added: Array<{ name: string; quantity: number }> = [];
    let addedTotal = 0;
    for (const it of intent.items) {
      const item = menuById.get(it.menuItemId);
      if (!item || it.available === false) continue;
      add(item, it.quantity);
      added.push({ name: item.name, quantity: it.quantity });
      addedTotal += (Number.isFinite(item.price) ? item.price : 0) * it.quantity;
    }
    if (added.length === 0) return;
    const notes = intent.notes?.trim();
    if (notes && added.length === 1) {
      const id = intent.items[0].menuItemId;
      setInstruction(id, notes.slice(0, 200));
    }
    const done: ChatMsg = {
      id: nextId(),
      role: "assistant",
      text: formatAddedAnnouncement(added, total + addedTotal),
    };
    setMessages((prev) =>
      prev.map((m) => (m.id === msgIdOfPreview ? { ...m, intent: undefined } : m)).concat(done)
    );
    setLiveMessage(done.text);
  }

  function cancelIntent(msgIdOfPreview: number) {
    setMessages((prev) => prev.map((m) => (m.id === msgIdOfPreview ? { ...m, intent: undefined } : m)));
  }

  function selectAmbiguous(menuItemId: string, _name: string, msgIdOfPreview: number) {
    const item = menuById.get(menuItemId);
    if (!item || item.isAvailable === false) return;
    add(item, 1);
    const msg: ChatMsg = {
      id: nextId(),
      role: "assistant",
      text: formatAddedAnnouncement([{ name: item.name, quantity: 1 }], total + (Number.isFinite(item.price) ? item.price : 0)),
    };
    setMessages((prev) =>
      prev.map((m) => (m.id === msgIdOfPreview ? { ...m, ambiguous: undefined } : m)).concat(msg)
    );
    setLiveMessage(msg.text);
  }

  if (!open) {
    return (
      <>
        <AccessibleStatus message={liveMessage} />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open SmartDine AI chat assistant"
          aria-haspopup="dialog"
          className="pressable fixed z-40 right-4 bottom-24 w-14 h-14 rounded-full bg-ink-900 text-white shadow-medium border border-white/10 flex items-center justify-center hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <MessageCircle className="w-6 h-6" aria-hidden="true" />
        </button>
      </>
    );
  }

  return (
    <>
      <AccessibleStatus message={liveMessage} />
      <div className="fixed inset-0 z-40 bg-ink-900/30 sm:bg-transparent sm:pointer-events-none" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="sd-ai-chat-title"
        className="fixed z-50 bg-white shadow-medium border border-surface-200 flex flex-col overflow-hidden
          inset-x-0 bottom-0 top-auto h-[85dvh] rounded-t-3xl
          sm:inset-x-auto sm:right-4 sm:top-20 sm:bottom-6 sm:h-auto sm:w-[380px] sm:rounded-3xl animate-modal-in"
      >
        <div className="px-4 pt-3 pb-2 border-b border-surface-100">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0" aria-hidden="true">
              <Sparkles className="w-4 h-4 text-brand-700" />
            </span>
            <h2 id="sd-ai-chat-title" className="text-[15px] font-bold tracking-tight text-ink-900 mr-auto">
              SmartDine AI
            </h2>
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                scopeRef.current = null;
                setLiveMessage("Chat cleared");
              }}
              aria-label="Clear chat history"
              className="pressable p-2 rounded-xl text-ink-400 hover:text-ink-700 hover:bg-surface-50 min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close SmartDine AI chat"
              className="pressable p-2 rounded-xl text-ink-400 hover:text-ink-700 hover:bg-surface-50 min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-2" role="group" aria-label="Chat language">
            <Languages className="w-3.5 h-3.5 text-ink-400 shrink-0" aria-hidden="true" />
            {LANG_TABS.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => setPrefs({ language: t.code })}
                aria-pressed={lang === t.code}
                aria-label={`Chat in ${t.label}`}
                className={`pressable px-2.5 py-1 min-h-[30px] rounded-full text-xs font-semibold border transition-colors ${
                  lang === t.code
                    ? "bg-ink-900 border-ink-900 text-white"
                    : "bg-white border-surface-200 text-ink-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto thin-scroll px-4 py-3 space-y-3" role="log" aria-label="Chat messages" aria-live="off">
          {messages.length === 0 && (
            <div>
              <p className="text-[13px] text-ink-500 leading-relaxed">
                {lang === "ta"
                  ? "வணக்கம்! உணவு, விலை, ஆர்டர் பற்றி கேளுங்கள்."
                  : lang === "tanglish"
                    ? "Vanakkam! Food, price, order pathi kelunga."
                    : "Hi! Ask me about food, prices, or orders."}
              </p>
              <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label="Quick prompts">
                {prompts.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="pressable px-3 py-1.5 rounded-full bg-surface-50 border border-surface-200 text-xs font-medium text-ink-600 hover:bg-surface-100 min-h-[34px]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] bg-ink-900 text-white text-sm rounded-2xl rounded-br-md px-3.5 py-2.5 leading-relaxed">
                  {m.text}
                </p>
              </div>
            ) : (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[92%] bg-surface-50 border border-surface-200 text-sm rounded-2xl rounded-bl-md px-3.5 py-2.5 leading-relaxed text-ink-800">
                  <p>{m.text}</p>
                  {m.ambiguous && m.ambiguous.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {m.ambiguous.slice(0, 2).map((a) => (
                        <div key={a.query || a.options[0]?.id} role="group" aria-label={a.query ? `Did you mean for ${a.query}` : "Did you mean"}>
                          <p className="text-xs font-semibold text-ink-500 mb-1">Please choose one:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {a.options.slice(0, 5).map((o) => (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() => selectAmbiguous(o.id, o.name, m.id)}
                                aria-label={`Select ${o.name}`}
                                className="pressable px-2.5 py-1.5 min-h-[34px] rounded-full bg-white border border-surface-200 text-xs font-semibold text-ink-700"
                              >
                                {o.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.suggestions && m.suggestions.length > 0 && (
                    <div className="mt-2 space-y-1.5" role="list" aria-label="Suggested dishes">
                      {m.suggestions.slice(0, 5).map((s) => (
                        <div key={s.menuItemId} role="listitem" className="flex items-center justify-between gap-2 bg-white border border-surface-200 rounded-xl px-2.5 py-2">
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-ink-900 truncate">{s.name}</span>
                            <span className="block text-xs text-ink-500 tabular-nums">
                              {formatCurrency(s.price)}
                              {s.category ? ` • ${s.category}` : ""}
                              {s.available ? "" : " • Unavailable"}
                            </span>
                            {s.description && (
                              <span className="block text-xs text-ink-400 line-clamp-2 mt-0.5">{s.description}</span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => addSuggestion(s)}
                            disabled={!s.available}
                            aria-label={s.available ? `Add ${s.name} to cart` : `${s.name} unavailable`}
                            className="pressable shrink-0 w-9 h-9 rounded-xl bg-ink-900 text-white flex items-center justify-center disabled:opacity-40"
                          >
                            <Plus className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.intent && (
                    <div className="mt-1">
                      <OrderIntentPreview
                        intent={m.intent}
                        menu={menu}
                        onAdd={() => confirmIntent(m.intent!, m.id)}
                        onCancel={() => cancelIntent(m.id)}
                        onEdit={() => cancelIntent(m.id)}
                        ambiguous={m.intent.ambiguous}
                        onSelectOption={(id) => selectAmbiguous(id, "", m.id)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          )}
          {busy && (
            <div className="flex justify-start" role="status" aria-live="polite">
              <p className="bg-surface-50 border border-surface-200 text-sm rounded-2xl px-3.5 py-2.5 text-ink-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Thinking…
              </p>
            </div>
          )}
        </div>

        <form
          className="border-t border-surface-100 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <label htmlFor="sd-ai-chat-input" className="sr-only">
            Ask SmartDine AI about the menu
          </label>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              id="sd-ai-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              maxLength={500}
              placeholder={
                lang === "ta" ? "மெனு பற்றி கேளுங்கள்…" : lang === "tanglish" ? "Menu pathi kelunga…" : "Ask about the menu…"
              }
              autoComplete="off"
              className="flex-1 min-w-0 resize-none max-h-28 px-3.5 py-2.5 min-h-[44px] rounded-2xl border border-surface-200 bg-white text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={busy || input.trim().length === 0}
              aria-label="Send message to SmartDine AI"
              className="pressable shrink-0 w-11 h-11 rounded-2xl bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
