import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Adaptive dining preferences — interaction choices only (never medical or
 * disability labels). Session/browser-scoped for guest QR users; no account
 * required. Defaults preserve the existing Tap & Browse experience untouched.
 */

export type AdaptiveLanguage = "en" | "tanglish" | "ta";

export interface AdaptivePrefs {
  language: AdaptiveLanguage;
  /** Show read-aloud (Listen) buttons across menu/cart/tracking/bill. */
  listen: boolean;
  /** Larger text across the customer flow. */
  largeText: boolean;
  /** High-contrast presentation. */
  highContrast: boolean;
  /** Extra voice-hint copy inside ordering sections. */
  voiceHints: boolean;
}

export const DEFAULT_ADAPTIVE_PREFS: AdaptivePrefs = {
  language: "tanglish",
  listen: false,
  largeText: false,
  highContrast: false,
  voiceHints: false,
};

const STORAGE_KEY = "smartdine_adaptive_prefs";

/** Speech-recognition locale per language choice (Indian English default). */
export const VOICE_LOCALE: Record<AdaptiveLanguage, string> = {
  en: "en-US",
  tanglish: "en-IN",
  ta: "ta-IN",
};

/** Speech-synthesis locale per language choice. */
export const TTS_LOCALE: Record<AdaptiveLanguage, string> = {
  en: "en-IN",
  tanglish: "en-IN",
  ta: "ta-IN",
};

export function parseAdaptivePrefs(raw: unknown): AdaptivePrefs {
  const base = { ...DEFAULT_ADAPTIVE_PREFS };
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  if (r.language === "en" || r.language === "tanglish" || r.language === "ta") {
    base.language = r.language;
  }
  for (const key of ["listen", "largeText", "highContrast", "voiceHints"] as const) {
    if (typeof r[key] === "boolean") base[key] = r[key];
  }
  return base;
}

export function loadAdaptivePrefs(
  storage?: { getItem: (k: string) => string | null } | null
): AdaptivePrefs {
  try {
    const store =
      storage ?? (typeof window !== "undefined" ? window.sessionStorage : null);
    if (!store) return { ...DEFAULT_ADAPTIVE_PREFS };
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ADAPTIVE_PREFS };
    return parseAdaptivePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_ADAPTIVE_PREFS };
  }
}

export function saveAdaptivePrefs(
  prefs: AdaptivePrefs,
  storage?: { setItem: (k: string, v: string) => void } | null
): void {
  try {
    const store =
      storage ?? (typeof window !== "undefined" ? window.sessionStorage : null);
    store?.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are best-effort; never break ordering.
  }
}

interface AdaptivePrefsContextValue {
  prefs: AdaptivePrefs;
  setPrefs: (patch: Partial<AdaptivePrefs>) => void;
  resetPrefs: () => void;
}

const AdaptivePrefsContext = createContext<AdaptivePrefsContextValue | null>(null);

export function AdaptivePrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<AdaptivePrefs>(() => loadAdaptivePrefs());

  useEffect(() => {
    saveAdaptivePrefs(prefs);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.adaptiveListen = prefs.listen ? "on" : "off";
      root.dataset.largeText = prefs.largeText ? "on" : "off";
      root.dataset.highContrast = prefs.highContrast ? "on" : "off";
      root.dataset.adaptiveLang = prefs.language;
    }
  }, [prefs]);

  const setPrefs = useCallback((patch: Partial<AdaptivePrefs>) => {
    setPrefsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetPrefs = useCallback(() => {
    setPrefsState({ ...DEFAULT_ADAPTIVE_PREFS });
  }, []);

  const value = useMemo(
    () => ({ prefs, setPrefs, resetPrefs }),
    [prefs, setPrefs, resetPrefs]
  );

  return (
    <AdaptivePrefsContext.Provider value={value}>
      {children}
    </AdaptivePrefsContext.Provider>
  );
}

export function useAdaptivePrefs(): AdaptivePrefsContextValue {
  const ctx = useContext(AdaptivePrefsContext);
  if (!ctx) throw new Error("useAdaptivePrefs must be used within AdaptivePrefsProvider");
  return ctx;
}
