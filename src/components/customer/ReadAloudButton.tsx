import { useEffect, useState } from "react";
import { Volume2, Square } from "lucide-react";
import { isReadAloudSupported, speakText, stopReadAloud } from "../../services/readAloud";
import { TTS_LOCALE, useAdaptivePrefs } from "../../context/AdaptivePrefsContext";

/**
 * Small play/stop control that reads a short label aloud (menu item + price,
 * cart total, order status...). Renders nothing where TTS is unavailable.
 * Never blocks normal interaction; stop-on-unmount included.
 */
export function ReadAloudButton({
  text,
  label,
  className = "",
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const { prefs } = useAdaptivePrefs();
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      stopReadAloud();
    };
  }, []);

  if (!isReadAloudSupported() || !text.trim()) return null;

  function toggle() {
    if (speaking) {
      stopReadAloud();
      setSpeaking(false);
      return;
    }
    const ok = speakText(text, {
      locale: TTS_LOCALE[prefs.language],
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
    setSpeaking(ok);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={speaking ? `Stop reading: ${label}` : `Read aloud: ${label}`}
      aria-pressed={speaking}
      className={`pressable w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
        speaking
          ? "bg-ink-900 border-ink-900 text-white"
          : "bg-white border-surface-200 text-ink-500 hover:border-surface-300 hover:text-ink-900"
      } ${className}`}
    >
      {speaking ? (
        <Square className="w-4 h-4" aria-hidden="true" />
      ) : (
        <Volume2 className="w-4 h-4" aria-hidden="true" />
      )}
    </button>
  );
}
