import { describe, expect, it } from "vitest";
import {
  clampRecipe,
  createFocusTimer,
  formatRemaining,
  recipeFromSchedule,
  type FocusRecipe,
  type FocusTimerEvent,
} from "./timer";

function recipe(overrides: Partial<FocusRecipe> = {}): FocusRecipe {
  return clampRecipe({ workMin: 1, shortBreakMin: 1, longBreakMin: 2, cycles: 2, autoContinue: true, ...overrides });
}

function harness(autoContinue = true) {
  let now = 1_000;
  const events: FocusTimerEvent[] = [];
  const timer = createFocusTimer({ now: () => now, onEvent: event => events.push(event) });
  return {
    events,
    timer,
    now: () => now,
    jump(ms: number) { now += ms; return timer.tick(); },
    set(ms: number) { now = ms; return timer.tick(); },
    startQuick(overrides: Partial<FocusRecipe> = {}) {
      return timer.beginQuick(recipe({ autoContinue, ...overrides }));
    },
  };
}

describe("FocusTimer fake clock", () => {
  it("sets an absolute phaseEndsAt when a work phase starts", () => {
    const h = harness();
    expect(h.startQuick({ workMin: 25 })).toBe(true);
    const snap = h.timer.snapshot();
    expect(snap.phase).toBe("work");
    expect(snap.isRunning).toBe(true);
    expect(snap.phaseEndsAt).toBe(1_000 + 25 * 60_000);
    expect(snap.remainingSeconds).toBe(25 * 60);
    expect(h.events[0]).toMatchObject({ type: "phase-start", phase: "work", phaseEndsAt: snap.phaseEndsAt });
  });

  it("advances one phase after a clock jump past the deadline (sleep drift)", () => {
    const h = harness();
    h.startQuick();
    const after = h.jump(90_000);
    expect(after.phase).toBe("short_break");
    expect(after.isRunning).toBe(true);
    expect(after.completedPomodoros).toBe(1);
    expect(after.phaseEndsAt).toBe(91_000 + 60_000);
    expect(h.events.some(event => event.type === "phase-end" && event.record.state === "completed")).toBe(true);
    expect(h.events.filter(event => event.type === "phase-start")).toHaveLength(2);
  });

  it("waits for a manual start when auto-continue is off", () => {
    const h = harness(false);
    h.startQuick();
    const after = h.jump(60_000);
    expect(after.phase).toBe("short_break");
    expect(after.isRunning).toBe(false);
    expect(after.isWaitingForManualStart).toBe(true);
    expect(after.phaseEndsAt).toBeNull();
    expect(h.timer.start()).toBe(true);
    expect(h.timer.snapshot().isRunning).toBe(true);
    expect(h.timer.snapshot().phaseEndsAt).toBe(h.now() + 60_000);
  });

  it("uses a long break after the configured cadence", () => {
    const h = harness();
    h.startQuick({ cycles: 2, longBreakMin: 3 });
    h.jump(60_000);
    expect(h.timer.snapshot().phase).toBe("short_break");
    h.jump(60_000);
    expect(h.timer.snapshot().phase).toBe("work");
    h.jump(60_000);
    const longBreak = h.timer.snapshot();
    expect(longBreak.phase).toBe("long_break");
    expect(longBreak.completedPomodoros).toBe(2);
    expect(longBreak.plannedMs).toBe(3 * 60_000);
  });

  it("freezes remaining time across pause and restores a new phaseEndsAt on resume", () => {
    const h = harness();
    h.startQuick();
    h.jump(10_000);
    expect(h.timer.pause()).toBe(true);
    const paused = h.timer.snapshot();
    expect(paused.isRunning).toBe(false);
    expect(paused.phaseEndsAt).toBeNull();
    expect(paused.remainingMs).toBe(50_000);
    h.jump(100_000);
    expect(h.timer.snapshot().remainingMs).toBe(50_000);
    expect(h.timer.start()).toBe(true);
    expect(h.timer.snapshot().phaseEndsAt).toBe(h.now() + 50_000);
    expect(h.events.some(event => event.type === "pause")).toBe(true);
  });

  it("skips the current phase and records it as stopped", () => {
    const h = harness();
    h.startQuick();
    h.jump(5_000);
    expect(h.timer.skip()).toBe(true);
    const snap = h.timer.snapshot();
    expect(snap.phase).toBe("short_break");
    expect(snap.isRunning).toBe(true);
    const ended = h.events.find(event => event.type === "phase-end");
    expect(ended).toMatchObject({ type: "phase-end", record: { phase: "work", state: "stopped", elapsedS: 5, plannedS: 60 } });
  });

  it("resets a running session without resuming later", () => {
    const h = harness();
    h.startQuick();
    h.jump(8_000);
    expect(h.timer.reset()).toBe(true);
    const snap = h.timer.snapshot();
    expect(snap.phase).toBe("idle");
    expect(snap.isSessionActive).toBe(false);
    expect(snap.isRunning).toBe(false);
    expect(snap.noteId).toBeNull();
    expect(h.events.some(event => event.type === "reset")).toBe(true);
    expect(h.events.some(event => event.type === "phase-end" && event.record.state === "stopped")).toBe(true);
  });

  it("does not replace a different active session", () => {
    const h = harness();
    h.timer.beginNote("note-a", "A", recipe());
    expect(h.timer.wouldReplace("note-b")).toBe(true);
    expect(h.timer.beginNote("note-b", "B", recipe())).toBe(false);
    expect(h.timer.snapshot().noteId).toBe("note-a");
    expect(h.timer.beginQuick()).toBe(false);
  });

  it("resolves a schedule recipe only when focus is enabled with concrete durations", () => {
    expect(recipeFromSchedule({ focusEnabled: false, focusWorkMin: 25, focusShortBreakMin: 5, focusLongBreakMin: 15, focusCycles: 4 })).toBeNull();
    expect(recipeFromSchedule({ focusEnabled: true, focusWorkMin: 0, focusShortBreakMin: 5, focusLongBreakMin: 15, focusCycles: 4 })).toBeNull();
    expect(recipeFromSchedule({
      focusEnabled: true, focusWorkMin: 12, focusShortBreakMin: 3, focusLongBreakMin: 9, focusCycles: 2, focusAutoContinue: false,
    })).toEqual({ workMin: 12, shortBreakMin: 3, longBreakMin: 9, cycles: 2, autoContinue: false });
  });

  it("formats remaining time from absolute milliseconds", () => {
    expect(formatRemaining(25 * 60_000)).toBe("25:00");
    expect(formatRemaining(1_001)).toBe("00:02");
    expect(formatRemaining(0)).toBe("00:00");
  });
});
