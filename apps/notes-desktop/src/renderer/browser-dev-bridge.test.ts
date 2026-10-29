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
  it("upserts saved filters per surface and deletes them", async () => {
    installBrowserDevBridge();
    type Filter = { id: string; name: string; payloadJson: string; position: number };
    const bridge = (g.window.pwnotes as Window["pwnotes"]).savedFilters;
    const save = async (surface: string, name: string, payloadJson: string) =>
      (await bridge.save({ surface, name, payloadJson }) as unknown as { filter: Filter }).filter;
    const names = async (surface: string) =>
      (await bridge.list({ surface }) as unknown as { filters: Filter[] }).filters.map(item => item.name);
    const first = await save("notes.library", "Urgent", '{"version":1}');
    const second = await save("notes.library", "Inbox", '{"version":1}');
    const again = await save("notes.library", "Urgent", '{"version":1,"clauses":[]}');
    expect(again.id).toBe(first.id);
    expect(again.payloadJson).toBe('{"version":1,"clauses":[]}');
    expect(second.position).toBe(1);
    await expect(save("notes.library", "Bad", "[]")).rejects.toThrow();
    expect(await names("notes.library")).toEqual(["Urgent", "Inbox"]);
    expect(await names("notes.search")).toEqual([]);
    await bridge.delete({ id: first.id });
    expect(await names("notes.library")).toEqual(["Inbox"]);
  });
  it("keeps an existing bridge", () => {
    const existing = {} as Window["pwnotes"];
    g.window.pwnotes = existing;
    expect(installBrowserDevBridge()).toBe(false);
    expect(g.window.pwnotes).toBe(existing);
  });
});
