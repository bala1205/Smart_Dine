import { describe, it, expect } from "vitest";
import { isReadAloudSupported, pickVoiceForLocale, speakText, stopReadAloud } from "./readAloud";

describe("readAloud (node: no Web Speech API)", () => {
  it("reports unsupported and no-ops safely", () => {
    expect(isReadAloudSupported()).toBe(false);
    expect(speakText("hello")).toBe(false);
    expect(() => stopReadAloud()).not.toThrow();
  });
});

describe("pickVoiceForLocale", () => {
  const voices = [
    { name: "Google US English", lang: "en-US" },
    { name: "Google UK English Female", lang: "en-GB" },
    { name: "Lekha", lang: "ta-IN" },
  ];

  it("prefers exact locale match", () => {
    expect(pickVoiceForLocale(voices, "ta-IN")?.name).toBe("Lekha");
  });

  it("falls back to language prefix", () => {
    expect(pickVoiceForLocale(voices, "en-IN")?.lang).toBe("en-US");
  });

  it("falls back to English, then first voice", () => {
    expect(pickVoiceForLocale([{ name: "Lekha", lang: "ta-IN" }], "fr-FR")?.name).toBe("Lekha");
    expect(pickVoiceForLocale([], "en-IN")).toBe(null);
  });
});
