import { describe, expect, it, vi } from "vitest";
import type { CoreClients } from "./client.js";
import { startChangeWatcher } from "./change-watcher.js";
describe("change watcher", () => {
  it("resumes sequence on reconnect, resets on a new daemon, and stops on abort", async () => {
    const emit = vi.fn(), reconnect = vi.fn(async () => true);
    let attempts = 0;
    const requests: bigint[] = [];
    const clients = { changes: { watch: async function* (input: { sinceSeq: bigint }, options: { signal: AbortSignal }) {
      requests.push(input.sinceSeq);
      if (attempts++ === 0) { yield { seq: 7n, snapshot: true, changes: [] }; throw new Error("restart"); }
      yield { seq: 1n, snapshot: false, changes: [{ entity: "notes", id: "one", op: "update" }] };
      await new Promise<void>(resolveWait => options.signal.addEventListener("abort", () => resolveWait(), { once: true }));
    } } } as unknown as CoreClients;
    const stop = startChangeWatcher({ getClients: () => clients, reconnect, emit });
    try {
      await vi.waitFor(() => expect(requests).toEqual([0n, 0n]));
      expect(reconnect).toHaveBeenCalledOnce();
      expect(emit).toHaveBeenCalledWith({ seq: "0", changes: [], resync: true });
      expect(emit).toHaveBeenCalledWith({ seq: "1", changes: [{ entity: "notes", id: "one", op: "update" }], resync: false });
    } finally { stop(); }
    const calls = emit.mock.calls.length;
    await new Promise(resolveWait => setTimeout(resolveWait, 20));
    expect(emit.mock.calls.length).toBe(calls);
  });
});
