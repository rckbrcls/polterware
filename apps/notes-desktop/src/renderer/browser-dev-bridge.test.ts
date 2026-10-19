import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RPC_METHODS } from "../shared/channels";
import { installBrowserDevBridge } from "./browser-dev-bridge";

const g = globalThis as unknown as { window: { pwnotes?: unknown } };
beforeEach(() => { g.window = {}; });
afterEach(() => { delete (g as { window?: unknown }).window; });

describe("browser dev bridge", () => {
  it("implements every allowlisted RPC method", async () => {
    expect(installBrowserDevBridge()).toBe(true);
    const bridge = g.window.pwnotes as unknown as Record<string, Record<string, () => Promise<unknown>>>;
    for (const [namespace, methods] of Object.entries(RPC_METHODS)) {
      for (const method of methods) expect(typeof bridge[namespace]![method], `${namespace}.${method}`).toBe("function");
    }
    const list = await (g.window.pwnotes as Window["pwnotes"]).notes.list({}) as unknown as { notes: unknown[]; total: number };
    expect(list.notes.length).toBeGreaterThan(0);
    expect(list.total).toBe(list.notes.length);
  });
  it("keeps an existing bridge", () => {
    const existing = {} as Window["pwnotes"];
    g.window.pwnotes = existing;
    expect(installBrowserDevBridge()).toBe(false);
    expect(g.window.pwnotes).toBe(existing);
  });
});
