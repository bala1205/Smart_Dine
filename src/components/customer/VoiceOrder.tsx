import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Loader2, Check, AlertCircle, X } from "lucide-react";
import { parseVoiceOrder, isVoiceSupported, createSpeechRecognition } from "../../services/voiceOrderService";
import { getTranscriptCoverage, resolveVoiceIntent } from "../../services/aiMenuMatcher";
import { useCart } from "../../context/CartContext";
import type { MenuItem } from "../../types/menu";
import type { VoiceState, OrderIntent } from "../../types/aiOrder";
import { OrderIntentPreview } from "./OrderIntentPreview";
import { AccessibleStatus } from "./AccessibleStatus";
import { VOICE_LOCALE, useAdaptivePrefs } from "../../context/AdaptivePrefsContext";

const STATE_LABEL: Record<VoiceState, string> = {
  IDLE: "Ready — tap to speak",
  LISTENING: "Listening...",
  PROCESSING: "Processing...",
  UNDERSTANDING: "Understanding your order...",
  CONFIRMATION: "Please confirm",
  ERROR: "Error",
};

const STATE_LIVE: Record<VoiceState, string> = {
  IDLE: "Voice ordering ready. Tap microphone to speak.",
  LISTENING: "Listening. Speak now. Tap stop when done.",
  PROCESSING: "Processing your speech.",
  UNDERSTANDING: "Understanding your order.",
  CONFIRMATION: "Order detected. Please confirm to add to cart.",
  ERROR: "Voice ordering error.",
};

export function VoiceOrder({
  restaurantId,
  menu,
}: {
  restaurantId: string;
  menu: MenuItem[];
}) {
  const { add, setInstruction } = useCart();
  const { prefs } = useAdaptivePrefs();
  const [state, setState] = useState<VoiceState>("IDLE");
  const [transcript, setTranscript] = useState("");
  const [intent, setIntent] = useState<OrderIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [heardHint, setHeardHint] = useState<string | null>(null);
  // Language support: English (en-US/en-IN), Tamil (ta-IN), Tanglish (en-IN handles Tanglish well).
  // Default comes from the adaptive language preference; a previous manual
  // choice in this browser still wins for backward compatibility.
  const [lang, setLang] = useState<string>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("smartdine_voice_lang") : null;
    if (saved && ["en-US", "en-IN", "ta-IN", "ta"].includes(saved)) return saved;
    return VOICE_LOCALE[prefs.language];
  });
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const isSupported = isVoiceSupported();

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("smartdine_voice_lang", lang);
    }
  }, [lang]);

  // Adaptive language preference drives recognition locale (manual picks persist too).
  useEffect(() => {
    const mapped = VOICE_LOCALE[prefs.language];
    setLang((prev) => (prev === mapped ? prev : mapped));
  }, [prefs.language]);

  const reset = useCallback(() => {
    setState("IDLE");
    setTranscript("");
    setIntent(null);
    setError(null);
    setConfirmMessage(null);
    setHeardHint(null);
  }, []);

  const handleResult = useCallback(
    async (text: string) => {
      const t = text.trim().slice(0, 500);
      if (!t) {
        setState("ERROR");
        setError("I couldn't hear anything. Please try again.");
        return;
      }
      setTranscript(t);
      setState("UNDERSTANDING");
      try {
        const rawIntent = await parseVoiceOrder(restaurantId, t, menu);
        // Check for empty
        if (rawIntent.items.length === 0 && (!rawIntent.ambiguous || rawIntent.ambiguous.length === 0)) {
          setState("ERROR");
          setError("No matching items found. Try saying '2 chicken biryani and one lime juice'.");
          return;
        }
        setIntent(rawIntent);
        // Uncertain match? Web Speech gives no confidence scores, so use
        // transcript-ambiguity: if little of what we matched was actually
        // said, ask for confirmation instead of trusting it.
        const coverage = getTranscriptCoverage(t, rawIntent);
        setHeardHint(
          rawIntent.items.length > 0 && coverage < 0.5
            ? `Heard “${t}”. Please double-check the detected items before adding.`
            : null
        );
        setState("CONFIRMATION");
      } catch (e: unknown) {
        const msg = (e as Error).message || "Voice ordering is temporarily unavailable.";
        setState("ERROR");
        setError(msg);
      }
    },
    [restaurantId, menu]
  );

  const startListening = useCallback(async () => {
    if (!isSupported) {
      setError("Voice not supported in this browser. Please type your order instead.");
      setState("ERROR");
      return;
    }
    // Check permission via getUserMedia
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermissionDenied(false);
    } catch {
      setPermissionDenied(true);
      setError("Microphone access is disabled. You can type your order instead.");
      setState("ERROR");
      return;
    }

    const rec = createSpeechRecognition(lang);
    if (!rec) {
      setError("Voice not supported.");
      setState("ERROR");
      return;
    }
    recognitionRef.current = rec;
    setState("LISTENING");
    setError(null);
    setTranscript("");
    setIntent(null);

    rec.onresult = (event) => {
      const text = Array.from(event.results)
        .map((r) => r[0]?.transcript || "")
        .join(" ")
        .trim();
      if (text) {
        setTranscript(text);
        setState("PROCESSING");
        // Stop after result
        try {
          rec.stop();
        } catch {
          // ignore
        }
        handleResult(text);
      }
    };
    rec.onerror = (event) => {
      const err = (event as unknown as { error: string }).error;
      if (err === "not-allowed" || err === "permission-denied") {
        setPermissionDenied(true);
        setError("Microphone access is disabled. You can type your order instead.");
      } else if (err === "no-speech") {
        setError("I couldn't hear anything. Please try again.");
      } else {
        setError("Voice ordering is temporarily unavailable.");
      }
      setState("ERROR");
    };
    rec.onend = () => {
      // If still listening and no result, go to error
      if (state === "LISTENING" && !transcript) {
        // Keep listening state until result or explicit stop
      }
    };
    try {
      rec.start();
    } catch {
      setState("ERROR");
      setError("Could not start microphone.");
    }
  }, [isSupported, lang, handleResult, state, transcript]);

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // ignore
      }
      try {
        rec.abort();
      } catch {
        // ignore
      }
    }
    if (state === "LISTENING") {
      setState("IDLE");
    }
  }, [state]);

  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // External activation: the Adaptive "Speak" choice dispatches
  // "sd:start-voice" from a genuine user click, so starting here stays
  // within the browser gesture/permission window where permitted.
  const startRef = useRef(startListening);
  startRef.current = startListening;
  useEffect(() => {
    const handler = () => {
      startRef.current();
    };
    window.addEventListener("sd:start-voice", handler);
    return () => window.removeEventListener("sd:start-voice", handler);
  }, []);

  const handleAdd = () => {
    if (!intent) return;
    const addedIds: string[] = [];
    for (const it of intent.items) {
      const menuItem = menu.find((m) => m.id === it.menuItemId);
      if (!menuItem) continue;
      if (!it.available) continue;
      // Use existing cart logic — add with quantity
      add(menuItem, it.quantity);
      addedIds.push(menuItem.id);
    }
    if (addedIds.length > 0) {
      // Carry AI-detected notes (e.g. "no onion") into the cart's existing
      // special-instruction field when exactly one dish was confirmed.
      const notes = intent.notes?.trim();
      if (notes && addedIds.length === 1) {
        setInstruction(addedIds[0], notes.slice(0, 200));
      }
      // Announce for screen reader
      setState("IDLE");
      setIntent(null);
      setTranscript("");
      setConfirmMessage(
        addedIds.length === 1 ? "Added to cart" : `${addedIds.length} items added to cart`
      );
    }
  };

  // Tap/keyboard/voice-follow-up answer to "Did you mean …?" — resolves one
  // ambiguous option straight into the cart (validated against the menu).
  const handleSelectOption = (menuItemId: string, name: string) => {
    const menuItem = menu.find((m) => m.id === menuItemId);
    if (!menuItem) return;
    if (!menuItem.isAvailable) {
      setHeardHint(`${name} is currently unavailable. Please pick another option.`);
      return;
    }
    add(menuItem, 1);
    setConfirmMessage(`${name} added to cart`);
    reset();
  };

  const isListening = state === "LISTENING";
  const showPreview = state === "CONFIRMATION" && intent;

  return (
    <section
      aria-labelledby="voice-order-title"
      className="bg-white rounded-2xl border border-surface-200 shadow-card p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="voice-order-title" className="font-bold tracking-tight text-ink-900 flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-surface-50 border border-surface-200 flex items-center justify-center shrink-0" aria-hidden="true">
              <Mic className="w-4 h-4 text-ink-500" />
            </span>
            Voice order
          </h2>
          <p className="text-sm text-ink-500 mt-1">
            {permissionDenied
              ? "Microphone disabled — type instead."
              : state === "IDLE"
              ? "Tap and speak naturally, e.g. “2 chicken biryani and one lime juice”"
              : STATE_LABEL[state]}
          </p>
          <p className="text-xs text-ink-400 mt-1">Supports English, Tamil, Tanglish — e.g. “rendu biryani venum”</p>
          {/* Language selector for Tamil/Tanglish support */}
          <div className="flex gap-1.5 mt-2" role="group" aria-label="Voice language">
            {[
              { code: "en-IN", label: "Tanglish", desc: "en-IN" },
              { code: "en-US", label: "English", desc: "en-US" },
              { code: "ta-IN", label: "தமிழ்", desc: "ta-IN" },
            ].map((opt) => (
              <button
                key={opt.code}
                onClick={() => setLang(opt.code)}
                aria-pressed={lang === opt.code}
                aria-label={`Set voice language to ${opt.label}`}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  lang === opt.code
                    ? "bg-ink-900 text-white border-ink-900"
                    : "bg-white text-ink-600 border-surface-200 hover:border-surface-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {state !== "IDLE" && state !== "LISTENING" && (
          <button
            onClick={reset}
            aria-label="Close voice order"
            className="p-2 rounded-xl hover:bg-surface-50 text-ink-400"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <AccessibleStatus message={STATE_LIVE[state]} />
      {error && <AccessibleStatus message={error} level="assertive" />}

      <div className="mt-4 flex flex-col items-center gap-3" role="group" aria-label="Voice controls">
        {!isListening ? (
          <button
            id="sd-voice-mic"
            onClick={startListening}
            disabled={state === "PROCESSING" || state === "UNDERSTANDING"}
            aria-label="Start voice ordering"
            className="w-20 h-20 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-medium hover:bg-brand-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 transition-all active:scale-95"
          >
            {state === "PROCESSING" || state === "UNDERSTANDING" ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : state === "ERROR" ? (
              <AlertCircle className="w-8 h-8" />
            ) : (
              <Mic className="w-8 h-8" />
            )}
          </button>
        ) : (
          <button
            onClick={stopListening}
            aria-label="Stop voice recording"
            className="w-20 h-20 rounded-full bg-danger-600 text-white flex items-center justify-center shadow-medium animate-pulse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500"
          >
            <MicOff className="w-8 h-8" />
          </button>
        )}

        <div aria-live="polite" className="text-center min-h-[24px]">
          {state === "LISTENING" && <span className="text-sm font-medium text-brand-600">Listening... speak now</span>}
          {state === "PROCESSING" && <span className="text-sm text-ink-500">Processing...</span>}
          {state === "UNDERSTANDING" && <span className="text-sm text-ink-500">Understanding your order...</span>}
          {transcript && state !== "CONFIRMATION" && (
            <p className="text-sm text-ink-700 mt-1 px-3 py-1 bg-surface-50 rounded-full border border-surface-200" role="status">
              “{transcript}”
            </p>
          )}
          {state === "ERROR" && error && (
            <p className="text-sm text-danger-600" role="alert">
              {error}
            </p>
          )}
        </div>

        {!isSupported && (
          <p className="text-xs text-ink-500 text-center" role="status">
            Voice not supported in this browser. Please use “Type your order”.
          </p>
        )}
        {permissionDenied && (
          <div className="text-center">
            <p className="text-sm text-danger-600" role="alert">
              Microphone access is disabled.
            </p>
            <p className="text-xs text-ink-500 mt-1">You can type your order instead.</p>
          </div>
        )}
      </div>

      {confirmMessage && state === "IDLE" && (
        <p className="mt-3 text-sm font-medium text-green-700" role="status">
          {confirmMessage}
        </p>
      )}

      {heardHint && state === "CONFIRMATION" && (
        <p className="mt-3 text-[13px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2" role="status">
          {heardHint}
        </p>
      )}

      {showPreview && intent && (
        <OrderIntentPreview
          intent={intent}
          menu={menu}
          onAdd={handleAdd}
          onCancel={reset}
          onEdit={reset}
          ambiguous={intent.ambiguous}
          onSelectOption={handleSelectOption}
        />
      )}

      {state === "ERROR" && !permissionDenied && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={reset}
            className="flex-1 py-2.5 rounded-xl bg-white border border-surface-200 text-ink-700 font-medium"
            aria-label="Try again"
          >
            Try again
          </button>
          <button
            onClick={reset}
            className="flex-1 py-2.5 rounded-xl bg-surface-50 border border-surface-200 text-ink-500 text-sm"
            aria-label="Type order instead"
          >
            Type instead
          </button>
        </div>
      )}

      {/* Hidden live region for cart add confirmation */}
      <div aria-live="polite" className="sr-only">
        {intent && state === "IDLE" && transcript ? "Order added to cart" : ""}
      </div>
    </section>
  );
}
