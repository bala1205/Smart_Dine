import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getOrCreateSessionId } from "./session";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("getOrCreateSessionId — persistent same-browser identity", () => {
  const g = globalThis as Record<string, unknown>;
  let realSession: unknown;
  let realLocal: unknown;

  beforeEach(() => {
    realSession = g.sessionStorage;
    realLocal = g.localStorage;
  });
  afterEach(() => {
    g.sessionStorage = realSession;
    g.localStorage = realLocal;
  });

  it("creates a stable id and reuses it in-session", () => {
    g.sessionStorage = fakeStorage();
    g.localStorage = fakeStorage();
    const a = getOrCreateSessionId();
    const b = getOrCreateSessionId();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(16);
  });
  it("session persists after reload (sessionStorage cleared, localStorage kept)", () => {
    const session = fakeStorage();
    const local = fakeStorage();
    g.sessionStorage = session;
    g.localStorage = local;
    const before = getOrCreateSessionId();
    // Simulate closing/reopening the tab: session storage wiped, local kept.
    g.sessionStorage = fakeStorage();
    const after = getOrCreateSessionId();
    expect(after).toBe(before);
  });
  it("session persists after navigation (same stores, new call)", () => {
    g.sessionStorage = fakeStorage();
    g.localStorage = fakeStorage();
    const first = getOrCreateSessionId();
    // navigation keeps both stores
    expect(getOrCreateSessionId()).toBe(first);
  });
  it("different browser/device gets a different id (isolation)", () => {
    g.sessionStorage = fakeStorage();
    g.localStorage = fakeStorage();
    const mine = getOrCreateSessionId();
    g.sessionStorage = fakeStorage();
    g.localStorage = fakeStorage();
    const other = getOrCreateSessionId();
    expect(other).not.toBe(mine);
  });
  it("expired reservation is a consumer concern — id itself stays stable", () => {
    g.sessionStorage = fakeStorage();
    g.localStorage = fakeStorage();
    expect(getOrCreateSessionId()).toBe(getOrCreateSessionId());
  });
});
