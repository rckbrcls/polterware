import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReminderController } from "./controller";
import type { NativeNotify, NativeRefresh, NotificationAction, ReminderCore } from "./types";
const noteId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
function fixture(background = false) {
  let action!: (event: NotificationAction) => void, event!: (value: NativeRefresh) => void;
  const native: NativeNotify = {
    status: vi.fn(async () => ({ authorization: "authorized" as const, pendingCount: 1 })),
    apply: vi.fn(async () => ({ added: ["one:1"], removed: [], unchanged: 0 })),
    requestAuthorization: vi.fn(async () => true), pending: vi.fn(async () => []), delivered: vi.fn(async () => []), removeAll: vi.fn(async () => []),
    onAction: (callback) => { action = callback; }, onEvent: (callback) => { event = callback; },
    finishAction: vi.fn(async () => {}), emitSystemEvent: vi.fn(async () => {}), close: vi.fn(), wasActionLaunch: () => false,
  };
  const core: ReminderCore = { plan: vi.fn(async () => []), complete: vi.fn(async () => {}), snooze: vi.fn(async () => {}), ack: vi.fn(async () => {}), heartbeat: vi.fn(async () => {}) };
  const ensureCore = vi.fn(async () => core), quit = vi.fn(), openNote = vi.fn(), log = vi.fn(), hasWindow = vi.fn(() => !background);
  const controller = createReminderController({ native, ensureCore, quit, openNote, hasWindow, background, log, receipts: { record: vi.fn(), authorize: () => true } });
  const sendAction = (overrides: Partial<NotificationAction> = {}) => action({ event: "action", id: `rem:${noteId}:1791111600000`, noteId, occurrenceAt: "2026-10-04T11:00:00.000Z", action: "DONE", token: "opaque", receivedAtMs: Date.now(), ...overrides });
  return { controller, native, core, ensureCore, quit, openNote, hasWindow, log, sendAction, event: (value: NativeRefresh) => event(value) };
}
let cleanups: (() => void)[] = [];
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { for (const close of cleanups) close(); cleanups = []; vi.useRealTimers(); });
function setup(background = false) { const f = fixture(background); cleanups.push(f.controller.close); return f; }
describe("lazy reminder controller", () => {
  it("coalesces start and a burst of committed schedule edits into one lazy plan", async () => {
    const f = setup(); expect(f.core.plan).not.toHaveBeenCalled();
    f.controller.start();
    for (let i = 0; i < 20; i++) { f.controller.onChanges({ snapshot: false, changes: [{ entity: "schedules" }] }); await vi.advanceTimersByTimeAsync(20); }
    expect(f.core.plan).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(f.core.plan).toHaveBeenCalledTimes(1); expect(f.native.apply).toHaveBeenCalledTimes(1);
    expect(f.controller.status().state).toBe("armed");
  });
  it("ignores unrelated changes and replans snapshots, timezone, wake, delivery and six hours", async () => {
    const f = setup(); f.controller.start(); await vi.advanceTimersByTimeAsync(500);
    f.controller.onChanges({ snapshot: false, changes: [{ entity: "tags" }, { entity: "activity" }] });
    await vi.advanceTimersByTimeAsync(500); expect(f.core.plan).toHaveBeenCalledTimes(1);
    f.controller.onChanges({ snapshot: false, changes: [{ entity: "note" }] }); await vi.advanceTimersByTimeAsync(500);
    expect(f.core.plan).toHaveBeenCalledTimes(2);
    for (const reason of ["timezone", "wake", "delivered"] as const) { f.event({ event: "refresh", reason, id: "one:1" }); await vi.advanceTimersByTimeAsync(500); }
    f.controller.onChanges({ snapshot: true, changes: [] }); await vi.advanceTimersByTimeAsync(500);
    expect(f.core.plan).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(f.core.plan).toHaveBeenCalledTimes(7);
  });
  it("does not replan in response to its own persisted heartbeat", async () => {
    const f = setup();
    f.controller.start();
    await vi.advanceTimersByTimeAsync(500);
    for (let i = 0; i < 10; i++) {
      f.controller.onChanges({ snapshot: false, changes: [{ entity: "setting", id: "_internal.reminder.heartbeat" }] });
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(f.core.plan).toHaveBeenCalledTimes(1);
    expect(f.core.heartbeat).toHaveBeenCalledTimes(1);
    f.controller.onChanges({ snapshot: false, changes: [{ entity: "setting", id: "notifications.sound" }] });
    await vi.advanceTimersByTimeAsync(500);
    expect(f.core.plan).toHaveBeenCalledTimes(2);
  });
  it("refreshes within 1.5 s even under sustained changes", async () => {
    const f = setup(); f.controller.start();
    for (let i = 0; i < 16; i++) { f.controller.requestRefresh("change"); await vi.advanceTimersByTimeAsync(100); }
    expect(f.core.plan).toHaveBeenCalledTimes(1);
  });
  it("serializes in-flight plans and refreshes changes received during apply", async () => {
    const f = setup(); let resolve!: () => void;
    vi.mocked(f.native.apply).mockImplementationOnce(() => new Promise((done) => { resolve = () => done({ added: [], removed: [], unchanged: 0 }); }));
    f.controller.start(); await vi.advanceTimersByTimeAsync(500);
    f.controller.requestRefresh("timezone"); await vi.advanceTimersByTimeAsync(500);
    expect(f.core.plan).toHaveBeenCalledTimes(1); resolve(); await vi.advanceTimersByTimeAsync(0);
    expect(f.core.plan).toHaveBeenCalledTimes(2);
  });
  it("preserves already armed requests on denied authorization without prompting", async () => {
    const f = setup(); vi.mocked(f.native.status).mockResolvedValue({ authorization: "denied", pendingCount: 3 });
    f.controller.start(); await vi.advanceTimersByTimeAsync(500);
    expect(f.core.plan).not.toHaveBeenCalled(); expect(f.native.apply).not.toHaveBeenCalled();
    expect(f.native.removeAll).not.toHaveBeenCalled(); expect(f.native.requestAuthorization).not.toHaveBeenCalled();
    expect(f.controller.status()).toMatchObject({ state: "permission-denied", armed: 3 });
  });
  it("requests permission only with a foreground window", async () => {
    const f = setup(true); f.controller.start();
    await expect(f.controller.requestAuthorization()).rejects.toThrow("foreground");
    f.hasWindow.mockReturnValue(true); await f.controller.requestAuthorization();
    expect(f.native.requestAuthorization).toHaveBeenCalledTimes(1);
  });
  it("buffers cold actions until start, applies exact occurrence then refreshes and finishes", async () => {
    const f = setup(true); f.sendAction(); expect(f.ensureCore).not.toHaveBeenCalled();
    expect(f.controller.shouldStartHidden()).toBe(true);
    f.controller.start(); await vi.advanceTimersByTimeAsync(0);
    expect(f.core.complete).toHaveBeenCalledWith(noteId, "2026-10-04T11:00:00.000Z");
    expect(f.native.finishAction).toHaveBeenCalledWith("opaque");
    expect(f.native.apply).toHaveBeenCalled();
    expect(vi.mocked(f.core.complete).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(f.native.apply).mock.invocationCallOrder[0]);
    await vi.advanceTimersByTimeAsync(10_000); expect(f.quit).toHaveBeenCalledTimes(1);
  });
  it("does not idle-exit while an action or replan is pending", async () => {
    const f = setup(true); let resolve!: () => void;
    vi.mocked(f.core.snooze).mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    f.controller.start(); f.sendAction({ action: "SNOOZE" }); await vi.advanceTimersByTimeAsync(30_000);
    expect(f.quit).not.toHaveBeenCalled(); resolve(); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000); expect(f.quit).toHaveBeenCalledTimes(1);
  });
  it("finishes failed snoozes once, does not retry, and logs no raw RPC error", async () => {
    const f = setup(true); vi.mocked(f.core.snooze).mockRejectedValue(new Error("Bearer secret; private note"));
    f.controller.start(); f.sendAction({ action: "SNOOZE" }); await vi.advanceTimersByTimeAsync(0);
    expect(f.core.snooze).toHaveBeenCalledTimes(1); expect(f.native.finishAction).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.log.mock.calls)).not.toMatch(/secret|private content|opaque/);
  });
  it("recovers after Plan failure and never reports a successful refresh", async () => {
    const f = setup(); vi.mocked(f.core.plan).mockRejectedValueOnce(new Error("private note"));
    f.controller.start(); await vi.advanceTimersByTimeAsync(500); expect(f.controller.status().state).toBe("refresh-pending");
    f.controller.requestRefresh("core-write"); await vi.advanceTimersByTimeAsync(500); expect(f.controller.status().state).toBe("armed");
  });
  it("routes Open and Start focus through a validated note URL and stays open", async () => {
    const f = setup(true); f.openNote.mockImplementation(() => { f.hasWindow.mockReturnValue(true); });
    f.controller.start(); f.sendAction({ action: "START_FOCUS" }); await vi.advanceTimersByTimeAsync(0);
    expect(f.openNote).toHaveBeenCalledWith(`pwnotes://note/${noteId}?action=focus`);
    await vi.advanceTimersByTimeAsync(11_000); expect(f.quit).not.toHaveBeenCalled();
  });
  it("rejects malformed actions and safely handles standalone focus activation", async () => {
    const f = setup(); f.controller.start();
    f.sendAction({ noteId: "../../bad" }); f.sendAction({ id: "one:focus", noteId: "", action: "com.apple.UNNotificationDefaultActionIdentifier" });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.core.complete).not.toHaveBeenCalled(); expect(f.openNote).not.toHaveBeenCalled(); expect(f.native.finishAction).toHaveBeenCalledTimes(2);
  });
  it("cancels lifecycle timers and closes the native delegate once", async () => {
    const f = setup(true); f.controller.start(); f.controller.close(); f.controller.close();
    await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000);
    expect(f.core.plan).not.toHaveBeenCalled(); expect(f.quit).not.toHaveBeenCalled(); expect(f.native.close).toHaveBeenCalledTimes(1);
  });
});
