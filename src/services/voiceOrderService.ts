import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../lib/firebase";
import type { MenuItem } from "../types/menu";
import type { VoiceOrderResult, OrderIntent } from "../types/aiOrder";
import { resolveVoiceIntent, fallbackParseVoiceClient } from "./aiMenuMatcher";

const MAX_TRANSCRIPT = 500;

export async function parseVoiceOrder(
  restaurantId: string,
  transcript: string,
  menu: MenuItem[]
): Promise<OrderIntent> {
  const clean = transcript.trim().slice(0, MAX_TRANSCRIPT);
  if (!clean || clean.length < 2) throw new Error("Please speak a valid order.");
  if (!restaurantId) throw new Error("Missing restaurant.");

  // Prefer server-side AI proxy
  try {
    const functions = getFunctions(app);
    const fn = httpsCallable<{ restaurantId: string; transcript: string }, VoiceOrderResult>(functions, "parseVoiceOrder");
    const res = await fn({ restaurantId, transcript: clean });
    const data = res.data as VoiceOrderResult;
    // Validate via matcher — server already validated, but client re-validates for safety
    return resolveVoiceIntent(data, menu);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const code = (err?.code || "").toLowerCase();
    // If function not deployed (Spark), fallback to deterministic client parser
    const isNotDeployed =
      code.includes("not-found") ||
      code.includes("unavailable") ||
      code.includes("internal") ||
      err?.message?.toLowerCase().includes("not found");

    if (isNotDeployed) {
      // Deterministic client fallback runs against the FULL loaded restaurant
      // menu (never a truncated subset) with the same authoritative prices.
      const fb = fallbackParseVoiceClient(clean, menu);
      return resolveVoiceIntent(fb, menu);
    }
    // For other errors, also fallback to client to keep ordering usable
    try {
      const fb = fallbackParseVoiceClient(clean, menu);
      const resolved = resolveVoiceIntent(fb, menu);
      if (resolved.items.length > 0) return resolved;
    } catch {
      // ignore
    }
    throw new Error(err?.message || "Voice ordering is temporarily unavailable. Please try typing your order.");
  }
}

export function isVoiceSupported(): boolean {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

export type SpeechRecognitionInstance = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
};

export function createSpeechRecognition(lang: string = "en-US"): SpeechRecognitionInstance | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const SR = (w.SpeechRecognition as unknown) || (w.webkitSpeechRecognition as unknown);
  if (!SR) return null;
  const inst = new (SR as { new (): SpeechRecognitionInstance })();
  inst.lang = lang;
  inst.continuous = false;
  inst.interimResults = false;
  return inst;
}
