import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { TTS_LOCALE, useAdaptivePrefs } from "../../context/AdaptivePrefsContext";
import {
  isReadAloudSupported,
  isSpeechPaused,
  pauseReadAloud,
  resumeReadAloud,
  speakText,
  stopReadAloud,
} from "../../services/readAloud";
import { formatCurrency } from "../../utils/formatting";

/**
 * Listen-mode experience: when the customer explicitly enables Listen, the
 * menu introduces itself aloud (restaurant, table, item count, cart state)
 * through the existing readAloud service — no second TTS system. Playback
 * controls (pause / resume / stop / replay / read cart) keep the customer in
 * control; nothing loops on its own. Manual Read Aloud buttons remain as
 * secondary controls. Renders nothing unless Listen is on.
 */
export function ListenAnnouncer({
  restaurantName,
  tableNumber,
  itemCount,
  categoryCount,
  cartCount,
  cartTotal,
}: {
  restaurantName: string;
  tableNumber?: number | string | null;
  itemCount: number;
  categoryCount: number;
  cartCount: number;
  cartTotal: number;
}) {
  const { prefs } = useAdaptivePrefs();
  const [supported] = useState<boolean>(() => isReadAloudSupported());
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const enabledRef = useRef(false);

  const summary = useMemo(() => {
    const parts = [
      `Welcome to ${restaurantName || "Smart Dine"}.`,
      tableNumber != null && tableNumber !== ""
        ? `You are at table ${tableNumber}.`
        : "",
      itemCount > 0
        ? `The menu has ${itemCount} items across ${categoryCount} categories. Browse, search, or tap any dish to add it.`
        : "The menu is loading.",
      cartCount > 0
        ? `Your cart has ${cartCount} item${cartCount === 1 ? "" : "s"}, total ${Math.round(cartTotal)} rupees.`
        : "Your cart is empty.",
    ];
    return parts.filter(Boolean).join(" ");
  }, [restaurantName, tableNumber, itemCount, categoryCount, cartCount, cartTotal]);

  const cartSummary = useMemo(
    () =>
      cartCount > 0
        ? `Cart summary: ${cartCount} item${cartCount === 1 ? "" : "s"}, total ${formatCurrency(cartTotal)}.`
        : "Your cart is empty.",
    [cartCount, cartTotal]
  );

  function say(text: string) {
    const ok = speakText(text, {
      locale: TTS_LOCALE[prefs.language],
      onEnd: () => setPaused(false),
      onError: () => {
        setPaused(false);
        setFailed(true);
      },
    });
    setPaused(false);
    setFailed(!ok);
  }

  // Auto-introduce once per Listen activation (not on every cart keystroke).
  useEffect(() => {
    if (!prefs.listen) {
      enabledRef.current = false;
      stopReadAloud();
      return;
    }
    if (enabledRef.current || !supported || itemCount === 0) return;
    enabledRef.current = true;
    setFailed(false);
    say(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.listen, supported, itemCount]);

  useEffect(() => {
    return () => {
      stopReadAloud();
    };
  }, []);

  if (!prefs.listen) return null;

  if (!supported) {
    return (
      <div
        role="status"
        className="max-w-lg mx-auto px-4 pt-3"
      >
        <p className="bg-white rounded-2xl border border-surface-200 shadow-card px-4 py-3 text-[13px] text-ink-500">
          Listen mode is on, but automatic reading isn&apos;t supported in this
          browser. The menu works normally — ask staff for assistance if needed.
        </p>
      </div>
    );
  }

  const btn =
    "pressable inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-full text-[13px] font-semibold border border-surface-200 bg-white text-ink-600";

  return (
    <div className="max-w-lg mx-auto px-4 pt-3">
      <div
        role="status"
        aria-live="polite"
        className="bg-ink-900 text-white rounded-2xl shadow-card px-4 py-3 flex items-center gap-2 flex-wrap"
      >
        <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="text-[13px] font-semibold mr-auto">Listen mode on</span>
        {failed && (
          <span className="text-xs text-white/80 w-full">
            Couldn&apos;t start speech — use the Read buttons on each item.
          </span>
        )}
        {paused ? (
          <button
            type="button"
            onClick={() => {
              resumeReadAloud();
              setPaused(isSpeechPaused());
            }}
            aria-label="Resume reading"
            className={btn}
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              pauseReadAloud();
              setPaused(isSpeechPaused());
            }}
            aria-label="Pause reading"
            className={btn}
          >
            <Pause className="w-4 h-4" aria-hidden="true" />
            Pause
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            stopReadAloud();
            setPaused(false);
          }}
          aria-label="Stop reading"
          className={btn}
        >
          <Square className="w-4 h-4" aria-hidden="true" />
          Stop
        </button>
        <button
          type="button"
          onClick={() => say(summary)}
          aria-label="Replay menu summary"
          className={btn}
        >
          Replay
        </button>
        <button
          type="button"
          onClick={() => say(cartSummary)}
          aria-label="Read cart summary aloud"
          className={btn}
        >
          Read cart
        </button>
      </div>
    </div>
  );
}
