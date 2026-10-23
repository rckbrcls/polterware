import { afterEach, expect, it, vi } from "vitest";
import { createNativeNotify } from "./native";
import type { NotificationAction } from "./types";
function fixture() {
  let receive!: (raw: string) => void;
  const addon = { start: (callback: (raw: string) => void) => { receive = callback; }, send: vi.fn(), close: vi.fn(), wasActionLaunch: () => true };
  const native = createNativeNotify(addon);
  return { native, addon, receive: (value: object) => receive(JSON.stringify(value)) };
}
afterEach(() => { vi.useRealTimers(); });
it("buffers early actions and system events until callbacks are installed", () => {
  const f = fixture(), action = vi.fn(), event = vi.fn();
  const payload: NotificationAction = { event: "action", id: "one:1", noteId: "", occurrenceAt: "2026-10-04T12:00:00.000Z", action: "DONE", token: "opaque", receivedAtMs: 1 };
  f.receive(payload); f.receive({ event: "refresh", reason: "timezone" });
  f.native.onAction(action); f.native.onEvent(event);
  expect(action).toHaveBeenCalledWith(payload); expect(event).toHaveBeenCalledWith({ event: "refresh", reason: "timezone" });
  expect(f.native.wasActionLaunch()).toBe(true); f.native.close();
});
it("serializes OS mutations and recovers after native errors without leaking them", async () => {
  const f = fixture(); const first = f.native.apply([]), second = f.native.removeAll("rem:");
  const assertion = expect(first).rejects.toThrow("Native notification operation failed");
  await Promise.resolve(); expect(f.addon.send).toHaveBeenCalledTimes(1);
  f.receive({ rid: "1", error: "secret note content" }); await assertion; await Promise.resolve();
  expect(f.addon.send).toHaveBeenCalledTimes(2);
  f.receive({ rid: "2", value: [] }); await expect(second).resolves.toEqual([]); f.native.close();
});
it("rejects foreign prefixes before native commands", async () => {
  const f = fixture(); await expect(f.native.removeAll("foreign:")).rejects.toThrow("Foreign");
  expect(f.addon.send).not.toHaveBeenCalled(); f.native.close();
});
it("rejects pending commands on shutdown and ignores late callbacks", async () => {
  const f = fixture(); const pending = f.native.status(); const assertion = expect(pending).rejects.toThrow("closed");
  f.native.close(); f.native.close(); f.receive({ rid: "1", value: {} });
  await assertion; expect(f.addon.close).toHaveBeenCalledTimes(1); await expect(f.native.status()).rejects.toThrow("closed");
});
it("bounds command waits and permits subsequent operations", async () => {
  vi.useFakeTimers(); const f = fixture(), pending = f.native.status();
  const assertion = expect(pending).rejects.toThrow("timed out"); await vi.advanceTimersByTimeAsync(30_000); await assertion;
  const next = f.native.pending(); f.receive({ rid: "2", value: [] }); await expect(next).resolves.toEqual([]); f.native.close();
});
