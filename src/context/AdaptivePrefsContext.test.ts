import { describe, it, expect } from "vitest";
import {
  DEFAULT_ADAPTIVE_PREFS,
  VOICE_LOCALE,
  TTS_LOCALE,
  parseAdaptivePrefs,
  loadAdaptivePrefs,
  saveAdaptivePrefs,
} from "./AdaptivePrefsContext";

function memoryStore(initial?: Record<string, string>) {
  const data: Record<string, string> = { ...(initial || {}) };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    data,
  };
}

describe("parseAdaptivePrefs", () => {
  it("returns defaults for garbage", () => {
    expect(parseAdaptivePrefs(null)).toEqual(DEFAULT_ADAPTIVE_PREFS);
    expect(parseAdaptivePrefs("nope")).toEqual(DEFAULT_ADAPTIVE_PREFS);
    expect(parseAdaptivePrefs({})).toEqual(DEFAULT_ADAPTIVE_PREFS);
  });

  it("accepts only known values (never medical/disability labels)", () => {
    const parsed = parseAdaptivePrefs({
      language: "blind",
      listen: "yes",
      largeText: 1,
      unknownKey: true,
    });
    expect(parsed).toEqual(DEFAULT_ADAPTIVE_PREFS);
  });

  it("accepts valid interaction preferences", () => {
    const parsed = parseAdaptivePrefs({
      language: "ta",
      listen: true,
      largeText: true,
      highContrast: true,
      voiceHints: true,
    });
    expect(parsed).toEqual({
      language: "ta",
      listen: true,
      largeText: true,
      highContrast: true,
      voiceHints: true,
    });
  });
});

describe("load/save round-trip", () => {
  it("defaults when empty", () => {
    expect(loadAdaptivePrefs(memoryStore())).toEqual(DEFAULT_ADAPTIVE_PREFS);
  });

  it("persists and restores", () => {
    const store = memoryStore();
    saveAdaptivePrefs({ ...DEFAULT_ADAPTIVE_PREFS, language: "ta", listen: true }, store);
    expect(loadAdaptivePrefs(store)).toEqual({
      ...DEFAULT_ADAPTIVE_PREFS,
      language: "ta",
      listen: true,
    });
  });

  it("survives corrupt JSON", () => {
    const store = memoryStore({ smartdine_adaptive_prefs: "{oops" });
    expect(loadAdaptivePrefs(store)).toEqual(DEFAULT_ADAPTIVE_PREFS);
  });
});

describe("locale maps", () => {
  it("tanglish uses Indian English recognition", () => {
    expect(VOICE_LOCALE.tanglish).toBe("en-IN");
    expect(VOICE_LOCALE.ta).toBe("ta-IN");
    expect(VOICE_LOCALE.en).toBe("en-US");
  });

  it("tts prefers Indian English voices", () => {
    expect(TTS_LOCALE.en).toBe("en-IN");
    expect(TTS_LOCALE.tanglish).toBe("en-IN");
    expect(TTS_LOCALE.ta).toBe("ta-IN");
  });
});
