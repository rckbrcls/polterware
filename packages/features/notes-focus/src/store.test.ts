import { afterEach, describe, expect, it, vi } from "vitest";
import { FOCUS_PHASE_KIND } from "./bridge";
import { fakeBridge } from "./fake-bridge";
import { createFocusStore } from "./store";

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(run => run()); });

function mount() {
  const fake = fakeBridge();
  const storage = { store: new Map<string, string>(), getItem(key: string) { return this.store.get(key) ?? null; }, setItem(key: string, value: string) { this.store.set(key, value); }, removeItem(key: string) { this.store.delete(key); }, clear() { this.store.clear(); }, key() { return null; }, get length() { return this.store.size; } } satisfies Storage;
  const play = vi.fn(async () => "synthesized" as const);
  const store = createFocusStore(() => fake.bridge, { storage, play, autotick: false, now: () => Date.parse("2026-10-04T12:00:00.000Z") });
  cleanups.push(() => store.dispose());
  return { fake, store, storage, play };
}

describe("focus store", () => {
  it("arms a focus_phase one-off on phase start and cancels it on pause", async () => {
    const { fake, store } = mount();
    store.connect();
    await vi.waitFor(() => expect(store.loadState()).toBe("live"));
    await store.startQuick({ workMin: 1, shortBreakMin: 1, longBreakMin: 1, cycles: 2, autoContinue: true });
    await store.flush();
    expect(fake.bridge.reminders.armOneOff).toHaveBeenCalledWith(expect.objectContaining({
      kind: FOCUS_PHASE_KIND, title: "Focus complete", fireAt: "2026-10-04T12:01:00.000Z",
    }));
    expect(store.reminderState()).toBe("live");
    store.pause();
    await store.flush();
    expect(fake.bridge.reminders.cancelOneOff).toHaveBeenCalled();
    expect(store.reminderState()).toBe("unavailable");
  });

  it("records a skipped phase and arms the next one", async () => {
    const { fake, store } = mount();
    store.connect();
    await vi.waitFor(() => expect(store.loadState()).toBe("live"));
    await store.startQuick({ workMin: 1, shortBreakMin: 1, longBreakMin: 1, cycles: 2, autoContinue: true });
    await store.flush();
    store.skip();
    await store.flush();
    expect(fake.bridge.focus.recordSession).toHaveBeenCalledWith(expect.objectContaining({ phase: "work", state: "stopped" }));
    expect(store.snapshot().phase).toBe("short_break");
    expect(fake.bridge.reminders.armOneOff).toHaveBeenCalledTimes(2);
  });

  it("starts a note-bound session from its schedule recipe", async () => {
    const { store } = mount();
    store.connect();
    await vi.waitFor(() => expect(store.loadState()).toBe("live"));
    await store.startNote("note-1");
    await store.flush();
    expect(store.snapshot().noteId).toBe("note-1");
    expect(store.snapshot().plannedMs).toBe(12 * 60_000);
  });

  it("does not resume a session persisted from a closed window and says so", async () => {
    const { fake, store, storage } = mount();
    storage.setItem("pwnotes.focus.session", JSON.stringify({
      phase: "work", plannedS: 1500, elapsedS: 120, startedAt: Date.parse("2026-10-04T11:50:00.000Z"), noteId: "note-1",
    }));
    store.connect();
    await vi.waitFor(() => expect(store.loadState()).toBe("live"));
    expect(store.snapshot().isSessionActive).toBe(false);
    expect(store.interrupted()?.message).toContain("not resumed");
    expect(fake.bridge.focus.recordSession).toHaveBeenCalledWith(expect.objectContaining({ state: "stopped", phase: "work" }));
  });
});
