// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// window.ts needs a live Electron runtime, so the security posture is checked on its source:
// every BrowserWindow (main and Commander) must be created with the same hardened preferences.
const source = readFileSync(new URL("./window.ts", import.meta.url), "utf8");

function webPreferencesBlocks(): string[] {
  return [...source.matchAll(/webPreferences:\s*{([^}]*)}/g)].map((match) => match[1] ?? "");
}

describe("BrowserWindow security preferences", () => {
  it("finds a preferences block for both the main window and Commander", () => {
    expect(webPreferencesBlocks().length).toBeGreaterThanOrEqual(2);
  });

  it("isolates every window's renderer from Node", () => {
    for (const block of webPreferencesBlocks()) {
      expect(block).toContain("contextIsolation: true");
      expect(block).toContain("nodeIntegration: false");
      expect(block).toContain("sandbox: true");
      expect(block).toContain("webSecurity: true");
    }
  });

  it("loads the typed preload bridge in every window", () => {
    for (const block of webPreferencesBlocks()) {
      expect(block).toMatch(/preload:\s*join\(__dirname, "\.\.\/preload\/index\.cjs"\)/);
    }
  });

  it("never weakens the sandbox anywhere in the main process", () => {
    for (const file of ["window.ts", "index.ts", "ipc.ts"]) {
      const body = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(body, file).not.toMatch(/nodeIntegration:\s*true/);
      expect(body, file).not.toMatch(/contextIsolation:\s*false/);
      expect(body, file).not.toMatch(/sandbox:\s*false/);
      expect(body, file).not.toMatch(/webSecurity:\s*false/);
      expect(body, file).not.toMatch(/allowRunningInsecureContent:\s*true/);
    }
  });

  it("restricts navigation through a shared policy", () => {
    expect(source).toContain("configureWindowSecurity");
  });
});
