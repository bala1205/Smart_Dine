import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function srcFile(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("Previous Orders placement — Table Selection vs Menu", () => {
  it("Previous Orders is NOT rendered on the Table Selection page", () => {
    const page = srcFile("./TableCheck.tsx");
    expect(page).not.toContain("Previous Orders");
    expect(page).not.toContain("No previous orders yet.");
    // Active reservation section stays.
    expect(page).toContain("Your Table");
    expect(page).toContain("Continue to Order");
  });
  it("Previous Orders button appears on the Menu page, above AI Chat", () => {
    const menu = srcFile("./Menu.tsx");
    expect(menu).toContain("OrderHistorySheet");
    // Mounted above the chat component (JSX mount order, not imports).
    const historyIdx = menu.indexOf("<OrderHistorySheet");
    const chatIdx = menu.indexOf("<SmartDineAIChat");
    expect(historyIdx).toBeGreaterThan(-1);
    expect(chatIdx).toBeGreaterThan(-1);
    expect(historyIdx).toBeLessThan(chatIdx);
  });
  it("Menu keeps AI Chat, Voice Order and search", () => {
    const menu = srcFile("./Menu.tsx");
    expect(menu).toContain("<SmartDineAIChat");
    expect(menu).toContain("VoiceOrder");
    expect(menu).toContain('id="sd-search-input"');
  });
});

describe("OrderHistorySheet — history panel behavior", () => {
  it("opens history, shows own orders, empty state, View Order flow", () => {
    const sheet = srcFile("../../components/customer/OrderHistorySheet.tsx");
    expect(sheet).toContain("Previous Orders");
    expect(sheet).toContain("useOrderHistory");
    expect(sheet).toContain("No previous orders yet.");
    expect(sheet).toContain("View Order");
    // Reuses the existing order-detail route, never a parallel screen.
    expect(sheet).toContain("/order/${order.id}?token=${order.trackingToken}");
    expect(sheet).toContain('aria-label="Open previous orders"');
  });
});
