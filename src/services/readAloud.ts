/**
 * Minimal text-to-speech wrapper around the Web Speech API.
 * No duplicate infrastructure: this is the ONLY speechSynthesis touchpoint.
 * All functions are safe no-ops where the API is unavailable (node tests,
 * old browsers, Flutter WebViews without TTS).
 */

export interface ReadAloudVoice {
  name: string;
  lang: string;
}

export function isReadAloudSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

/** Pick the best voice for a locale from a voice list (pure — unit tested). */
export function pickVoiceForLocale(
  voices: ReadonlyArray<ReadAloudVoice>,
  locale: string
): ReadAloudVoice | null {
  if (voices.length === 0) return null;
  const want = locale.toLowerCase();
  const exact = voices.find((v) => v.lang.toLowerCase() === want);
  if (exact) return exact;
  const prefix = want.split("-")[0];
  const byPrefix = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
  if (byPrefix) return byPrefix;
  const english = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
  return english ?? voices[0] ?? null;
}

function currentVoices(): ReadAloudVoice[] {
  try {
    if (!isReadAloudSupported()) return [];
    return window.speechSynthesis.getVoices() as ReadAloudVoice[];
  } catch {
    return [];
  }
}

export function stopReadAloud(): void {
  try {
    if (isReadAloudSupported()) window.speechSynthesis.cancel();
  } catch {
    // never break UI
  }
}

export function pauseReadAloud(): void {
  try {
    if (isReadAloudSupported() && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
    }
  } catch {
    // never break UI
  }
}

export function resumeReadAloud(): void {
  try {
    if (isReadAloudSupported() && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch {
    // never break UI
  }
}

export function isSpeechPaused(): boolean {
  try {
    return isReadAloudSupported() && window.speechSynthesis.paused;
  } catch {
    return false;
  }
}

export function speakText(
  text: string,
  opts?: { locale?: string; rate?: number; onEnd?: () => void; onError?: () => void }
): boolean {
  const clean = text.trim().slice(0, 500);
  if (!clean || !isReadAloudSupported()) return false;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    const voice = pickVoiceForLocale(currentVoices(), opts?.locale ?? "en-IN");
    if (voice) {
      const match = window.speechSynthesis
        .getVoices()
        .find((v) => v.name === voice.name && v.lang === voice.lang);
      if (match) utter.voice = match;
      utter.lang = voice.lang;
    } else {
      utter.lang = opts?.locale ?? "en-IN";
    }
    utter.rate = Math.min(1.25, Math.max(0.8, opts?.rate ?? 1));
    if (opts?.onEnd) utter.onend = opts.onEnd;
    if (opts?.onError) utter.onerror = opts.onError;
    window.speechSynthesis.speak(utter);
    return true;
  } catch {
    return false;
  }
}
