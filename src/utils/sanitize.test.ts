import { describe, it, expect } from "vitest";
import { escapeHtml, sanitizeUrl } from "./sanitize";

describe("escapeHtml", () => {
  it("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });
  it("escapes < > \" '", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });
  it("handles empty", () => {
    expect(escapeHtml("")).toBe("");
    expect(escapeHtml(null as unknown as string)).toBe("");
  });
});

describe("sanitizeUrl", () => {
  it("allows https", () => {
    expect(sanitizeUrl("https://example.com/logo.png")).toBe("https://example.com/logo.png");
  });
  it("blocks javascript", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
  });
  it("blocks data url", () => {
    expect(sanitizeUrl("data:text/html,hi")).toBe("");
  });
});
