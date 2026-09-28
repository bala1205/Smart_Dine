import { useEffect, useRef } from "react";
import { isReadAloudSupported, speakText, stopReadAloud } from "../services/readAloud";
import { TTS_LOCALE, useAdaptivePrefs } from "../context/AdaptivePrefsContext";

/**
 * Speaks `text` once whenever it becomes non-empty while `active` is true
 * (e.g. Listen mode + freshly loaded order status). Cancels on change,
 * deactivation, or unmount. Silent no-op where TTS is unavailable — callers
 * render their own fallback note. Reuses the single readAloud touchpoint.
 */
export function useAutoSpeak(text: string, active: boolean): void {
  const { prefs } = useAdaptivePrefs();
  const lastSpoken = useRef<string>("");
  const locale = TTS_LOCALE[prefs.language];

  useEffect(() => {
    if (!active || !text.trim() || !isReadAloudSupported()) return;
    if (lastSpoken.current === text) return;
    lastSpoken.current = text;
    speakText(text, { locale });
    return () => {
      stopReadAloud();
    };
  }, [active, text, locale]);

  useEffect(() => {
    if (!active) {
      lastSpoken.current = "";
      stopReadAloud();
    }
  }, [active]);
}
