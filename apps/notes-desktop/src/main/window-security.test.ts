import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("./window.ts", import.meta.url), "utf8");
describe("window security", () => {
  it("isolates every window from Node and enables the sandbox", () => {
    const blocks = [...source.matchAll(/webPreferences:\s*{([^}]*)}/g)].map(match => match[1]!);
    expect(blocks).toHaveLength(1);
    for (const block of blocks) for (const setting of ["contextIsolation: true", "nodeIntegration: false", "sandbox: true", "webSecurity: true"]) expect(block).toContain(setting);
  });
  it("blocks webviews and guards redirects and new windows", () => {
    expect(source).toContain('"will-attach-webview"');
    expect(source).toContain('"will-redirect"');
    expect(source).toContain('action: "deny"');
    expect(source).toContain("configureWindowSecurity(win)");
    expect(source).toContain("setVibrancy(null)");
  });
  it("keeps running on macOS after the last window closes and never stops the detached core", () => {
    const main = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(main).toContain('app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); })');
    expect(main).not.toContain("stopCore");
    expect(main).not.toContain("process.kill(core");
    expect(main).toContain('process.argv.includes("--background-replan")');
    expect(main).toContain('appendSwitch("remote-debugging-port"');
    expect(main).toContain("before-quit");
    expect(main).toContain("stopWatcher");
    expect(main).toContain("if (pendingLink) routeDeepLink(pendingLink.url)");
    expect(main).toContain("resetTempImportDirectory");
    expect(main).toContain("pathsForDroppedFiles");
    expect(main).toContain("writeTempFile");
    expect(main).toContain("assertTrustedSender");
    expect(main).toContain("matchSoundPath");
    expect(main).toContain("matchCharacterPath");
    expect(main).toContain("openLog");
    expect(main).toContain("openDataFolder");
    expect(main).toContain("testMcpConnection");
    expect(main).toContain("publicIpcError");
    expect(main).toContain("mapGeocoding");
    expect(main).not.toContain("setLoginItem");
  });
});
