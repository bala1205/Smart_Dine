/**
 * Minimal HTML escaping for interpolated Firestore values in generated HTML (PDF/print windows).
 * Prevents stored XSS if owner sets restaurant name like "<img src=x onerror=...>" .
 */
export function escapeHtml(value: unknown): string {
  const str = String(value ?? "");
  return str.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

export function sanitizeUrl(url: string): string {
  try {
    // Use absolute URL parsing without window (works in node for tests)
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    // Fallback for relative URLs or missing protocol — treat as unsafe
    return "";
  }
}
