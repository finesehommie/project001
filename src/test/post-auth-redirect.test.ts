import { beforeEach, describe, expect, it, vi } from "vitest";

// The helper records the entry URL when the module is first loaded, so each case
// sets the address bar, then re-imports the module to capture that address.
async function loadHelper(url: string) {
  window.sessionStorage.clear();
  window.history.replaceState({}, "", url);
  vi.resetModules();
  return import("@/lib/post-auth");
}

describe("Where sign-in leaves the user", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("sends a returning sign-in to the trading terminal", async () => {
    const { shouldOpenTerminalAfterSignIn } = await loadHelper("/?code=abc123");
    expect(shouldOpenTerminalAfterSignIn()).toBe(true);
  });

  it("sends a signed-in visitor on the log-in page to the trading terminal", async () => {
    const { shouldOpenTerminalAfterSignIn } = await loadHelper("/auth?mode=login");
    expect(shouldOpenTerminalAfterSignIn()).toBe(true);
  });

  it("keeps a signed-in visitor on the page they opened", async () => {
    const { shouldOpenTerminalAfterSignIn } = await loadHelper("/");
    expect(shouldOpenTerminalAfterSignIn()).toBe(false);
  });

  it("keeps a password-recovery link on the reset page", async () => {
    const { shouldOpenTerminalAfterSignIn } = await loadHelper("/reset-password?type=recovery&code=abc123");
    expect(shouldOpenTerminalAfterSignIn()).toBe(false);
  });

  it("sends the user to the terminal after a Google round trip, once", async () => {
    const { rememberPostAuthTarget, shouldOpenTerminalAfterSignIn, clearPostAuthTarget } =
      await loadHelper("/");
    expect(shouldOpenTerminalAfterSignIn()).toBe(false);
    rememberPostAuthTarget();
    expect(shouldOpenTerminalAfterSignIn()).toBe(true);
    clearPostAuthTarget();
    expect(shouldOpenTerminalAfterSignIn()).toBe(false);
  });
});
