import { afterEach, describe, expect, it, vi } from "vitest";
import { createAutosave } from "./autosave";

afterEach(() => vi.useRealTimers());
describe("canvas autosave", () => {
  it("debounces to the latest graph/layout snapshot", async () => {
    vi.useFakeTimers(); const write = vi.fn().mockResolvedValue({}); const notify = vi.fn();
    const save = createAutosave(write, notify, 500);
    save.schedule({ graph: "old", layout: "old" }); save.schedule({ graph: "new", layout: "new" });
    await vi.advanceTimersByTimeAsync(499); expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledExactlyOnceWith({ graph: "new", layout: "new" });
    expect(notify).toHaveBeenLastCalledWith("saved");
  });
  it("serializes writes and drains edits made during an in-flight save", async () => {
    let finish!: () => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue(undefined);
    const save = createAutosave(write, vi.fn(), 500);
    save.schedule("first"); const flushed = save.flush();
    save.schedule("latest"); expect(write).toHaveBeenCalledTimes(1);
    finish(); expect(await flushed).toBe(true);
    expect(write.mock.calls.map(([value]) => value)).toEqual(["first", "latest"]);
    await save.flush(); expect(write).toHaveBeenCalledTimes(2);
  });
  it("keeps failed edits retryable and reports the server validation message", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("nodes[0]: requires a ref to a structure node")).mockResolvedValue({});
    const notify = vi.fn(); const save = createAutosave(write, notify);
    save.schedule("draft"); expect(await save.flush()).toBe(false);
    expect(notify).toHaveBeenLastCalledWith("error", "nodes[0]: requires a ref to a structure node");
    expect(await save.flush()).toBe(true); expect(write).toHaveBeenLastCalledWith("draft");
  });
  it("flushes pending changes immediately before navigation without a duplicate timer write", async () => {
    vi.useFakeTimers(); const write = vi.fn().mockResolvedValue({}); const save = createAutosave(write, vi.fn());
    save.schedule("last edit"); expect(await save.flush()).toBe(true);
    await vi.runAllTimersAsync(); expect(write).toHaveBeenCalledExactlyOnceWith("last edit");
  });
});
