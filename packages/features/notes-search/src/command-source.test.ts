import { afterEach, describe, expect, it, vi } from "vitest";
import feature from "./index";
import { createSearchCommandSource } from "./command-source";
import { createSearchStore } from "./store";
import { fakeBridge } from "./fake-bridge";

afterEach(() => vi.useRealTimers());

describe("Commander search source", () => {
  it("registers dynamic hits alongside the static search.open command", () => {
    expect(feature.commands?.[0]?.id).toBe("search.open");
    expect(feature.commandSources?.[0]?.id).toBe("search.notes");
  });
  it("returns fixture hits with plain snippets and opens the selected note", async () => {
    const fake = fakeBridge();
    const store = createSearchStore(() => fake.bridge, { debounceMs: 0 });
    const source = createSearchCommandSource(store);
    const result = await source.search("milk");
    expect(result.hits[0]).toMatchObject({ id: "note-milk", label: "Buy milk", snippet: "Get <b>milk</b> from the store" });
    expect(typeof result.hits[0]!.snippet).toBe("string");
    result.hits[0]!.run();
    expect(fake.bridge.app.openDeepLink).toHaveBeenCalledWith("pwnotes://note/note-milk");
    store.dispose();
  });
  it("debounces and cancels stale queries including an in-flight request", async () => {
    vi.useFakeTimers();
    const fake = fakeBridge();
    const store = createSearchStore(() => fake.bridge, { debounceMs: 100 });
    const source = createSearchCommandSource(store);
    const first = source.search("m");
    const second = source.search("milk");
    await vi.advanceTimersByTimeAsync(100);
    expect((await first).hits).toEqual([]);
    expect((await second).hits[0]?.label).toBe("Buy milk");
    expect(fake.bridge.search.search).toHaveBeenCalledOnce();
    let finish!: (value: { hits: [] }) => void;
    vi.mocked(fake.bridge.search.search).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const stale = source.search("old");
    await vi.advanceTimersByTimeAsync(100);
    const latest = source.search("eggs");
    finish({ hits: [] });
    expect((await stale).hits).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect((await latest).hits[0]?.label).toBe("Boil eggs");
    store.dispose();
  });
  it("clears an empty query and reports bridge failure", async () => {
    const fake = fakeBridge();
    const store = createSearchStore(() => fake.bridge, { debounceMs: 0 });
    const source = createSearchCommandSource(store);
    expect((await source.search(" ")).hits).toEqual([]);
    expect(fake.bridge.search.search).not.toHaveBeenCalled();
    vi.mocked(fake.bridge.search.search).mockRejectedValueOnce(new Error("Core unavailable"));
    await expect(source.search("milk")).rejects.toThrow("Core unavailable");
    store.dispose();
  });
});
