import { useState } from "react";
import { Hand, Mic, Volume2, Type, Contrast, Languages, X, SlidersHorizontal } from "lucide-react";
import { useAdaptivePrefs } from "../../context/AdaptivePrefsContext";
import type { AdaptiveLanguage } from "../../context/AdaptivePrefsContext";

const DISMISS_KEY = "smartdine_adaptive_strip_dismissed";

function isDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Compact Adaptive Dining entry prompt ("How would you like to order?").
 * Tap & Browse remains the untouched default — this layer only ADDS optional
 * presentation/interaction choices. No disability labels, no mandatory steps.
 *
 * Entry behavior: the prompt collapses into a small "Ordering preferences"
 * pill as soon as the customer makes ANY choice (or dismisses it), so the
 * restaurant menu stays the primary content. Reopening restores the prompt.
 */
export function AdaptivePrefsStrip({
  onSpeak,
  onBrowse,
}: {
  onSpeak: () => void;
  onBrowse: () => void;
}) {
  const { prefs, setPrefs } = useAdaptivePrefs();
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissed());

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  /**
   * Apply a preference patch, then collapse the entry prompt so the menu
   * becomes the primary content. The pill reopens it on demand.
   */
  function choose(patch: Parameters<typeof setPrefs>[0]) {
    setPrefs(patch);
    dismiss();
  }

  function reopen() {
    setDismissed(false);
    try {
      window.sessionStorage.removeItem(DISMISS_KEY);
    } catch {
      // ignore
    }
  }

  if (dismissed) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-3">
        <button
          type="button"
          onClick={reopen}
          className="pressable inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-900 px-2 py-1.5"
          aria-label="Open ordering preferences"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
          Ordering preferences
        </button>
      </div>
    );
  }

  const toggleBtn =
    "pressable inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-full text-[13px] font-semibold border transition-colors";

  return (
    <div className="max-w-lg mx-auto px-4 pt-3">
      <section
        aria-labelledby="adaptive-prefs-title"
        className="bg-white rounded-2xl border border-surface-200 shadow-card p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="adaptive-prefs-title" className="text-[15px] font-bold tracking-tight text-ink-900">
              How would you like to order?
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Optional — browsing works as usual without choosing.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss ordering preferences"
            className="pressable p-1.5 -mr-1 -mt-1 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-surface-50 min-w-[32px] min-h-[32px] flex items-center justify-center"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label="Interaction style">
          <button
            type="button"
            onClick={() => {
              onBrowse();
              dismiss();
            }}
            aria-pressed={!prefs.voiceHints}
            className={`${toggleBtn} ${
              !prefs.voiceHints
                ? "bg-ink-900 border-ink-900 text-white"
                : "bg-white border-surface-200 text-ink-600"
            }`}
          >
            <Hand className="w-4 h-4" aria-hidden="true" />
            Tap &amp; Browse
          </button>
          <button
            type="button"
            onClick={() => {
              setPrefs({ voiceHints: true });
              onSpeak();
              dismiss();
            }}
            aria-pressed={prefs.voiceHints}
            className={`${toggleBtn} ${
              prefs.voiceHints
                ? "bg-ink-900 border-ink-900 text-white"
                : "bg-white border-surface-200 text-ink-600"
            }`}
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
            Speak
          </button>
          <button
            type="button"
            onClick={() => choose({ listen: !prefs.listen })}
            aria-pressed={prefs.listen}
            className={`${toggleBtn} ${
              prefs.listen
                ? "bg-ink-900 border-ink-900 text-white"
                : "bg-white border-surface-200 text-ink-600"
            }`}
          >
            <Volume2 className="w-4 h-4" aria-hidden="true" />
            Listen
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Reading preferences">
          <button
            type="button"
            onClick={() => choose({ largeText: !prefs.largeText })}
            aria-pressed={prefs.largeText}
            className={`${toggleBtn} ${
              prefs.largeText
                ? "bg-ink-900 border-ink-900 text-white"
                : "bg-white border-surface-200 text-ink-600"
            }`}
          >
            <Type className="w-4 h-4" aria-hidden="true" />
            Larger text
          </button>
          <button
            type="button"
            onClick={() => choose({ highContrast: !prefs.highContrast })}
            aria-pressed={prefs.highContrast}
            className={`${toggleBtn} ${
              prefs.highContrast
                ? "bg-ink-900 border-ink-900 text-white"
                : "bg-white border-surface-200 text-ink-600"
            }`}
          >
            <Contrast className="w-4 h-4" aria-hidden="true" />
            High contrast
          </button>
        </div>

        <div className="flex items-center gap-2 mt-3" role="group" aria-label="Language">
          <Languages className="w-4 h-4 text-ink-400 shrink-0" aria-hidden="true" />
          {(
            [
              { code: "en", label: "English" },
              { code: "tanglish", label: "Tanglish" },
              { code: "ta", label: "தமிழ்" },
            ] as Array<{ code: AdaptiveLanguage; label: string }>
          ).map((opt) => (
            <button
              key={opt.code}
              type="button"
              onClick={() => choose({ language: opt.code })}
              aria-pressed={prefs.language === opt.code}
              aria-label={`Order in ${opt.label}`}
              className={`pressable px-3 py-1.5 min-h-[34px] rounded-full text-xs font-semibold border transition-colors ${
                prefs.language === opt.code
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-white border-surface-200 text-ink-600"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
