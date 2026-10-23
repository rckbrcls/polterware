/** Pure pomodoro engine. Absolute `phaseEndsAt` is the only remaining-time source while running. */

export type Clock = { now(): number };
export type FocusPhase = "idle" | "work" | "short_break" | "long_break";
export type ActivePhase = Exclude<FocusPhase, "idle">;
export type SessionState = "completed" | "stopped";

export type FocusRecipe = {
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  cycles: number;
  autoContinue: boolean;
};

export type PhaseRecord = {
  phase: ActivePhase;
  plannedS: number;
  elapsedS: number;
  state: SessionState;
  startedAt: number;
  endedAt: number;
};

export type FocusTimerEvent =
  | { type: "phase-start"; phase: ActivePhase; phaseEndsAt: number; plannedS: number }
  | { type: "phase-end"; record: PhaseRecord }
  | { type: "pause" }
  | { type: "reset" };

export type FocusSnapshot = {
  phase: FocusPhase;
  remainingMs: number;
  plannedMs: number;
  remainingSeconds: number;
  progress: number;
  isRunning: boolean;
  isWaitingForManualStart: boolean;
  isSessionActive: boolean;
  isQuickSession: boolean;
  completedPomodoros: number;
  cycleIndex: number;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  noteId: string | null;
  noteTitle: string | null;
  recipe: FocusRecipe | null;
};

export const DEFAULT_RECIPE: FocusRecipe = {
  workMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  cycles: 4,
  autoContinue: true,
};

export const WORK_PRESETS = [5, 10, 15, 20, 25, 30, 45, 60] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampRecipe(input: Partial<FocusRecipe> = {}): FocusRecipe {
  return {
    workMin: clamp(input.workMin ?? DEFAULT_RECIPE.workMin, 1, 60),
    shortBreakMin: clamp(input.shortBreakMin ?? DEFAULT_RECIPE.shortBreakMin, 1, 60),
    longBreakMin: clamp(input.longBreakMin ?? DEFAULT_RECIPE.longBreakMin, 1, 60),
    cycles: clamp(input.cycles ?? DEFAULT_RECIPE.cycles, 1, 12),
    autoContinue: input.autoContinue ?? DEFAULT_RECIPE.autoContinue,
  };
}

export function recipeFromSchedule(schedule?: {
  focusEnabled?: boolean;
  focusWorkMin?: number;
  focusShortBreakMin?: number;
  focusLongBreakMin?: number;
  focusCycles?: number;
  focusAutoContinue?: boolean;
} | null): FocusRecipe | null {
  if (!schedule?.focusEnabled) return null;
  if (!schedule.focusWorkMin || !schedule.focusShortBreakMin || !schedule.focusLongBreakMin || !schedule.focusCycles) {
    return null;
  }
  return clampRecipe({
    workMin: schedule.focusWorkMin,
    shortBreakMin: schedule.focusShortBreakMin,
    longBreakMin: schedule.focusLongBreakMin,
    cycles: schedule.focusCycles,
    autoContinue: schedule.focusAutoContinue ?? true,
  });
}

export function recipeFromDefaults(defaults?: {
  workMin?: number;
  shortBreakMin?: number;
  longBreakMin?: number;
  cycles?: number;
  autoContinue?: boolean;
} | null): FocusRecipe {
  return clampRecipe(defaults ?? {});
}

function secondsFor(phase: ActivePhase, recipe: FocusRecipe, completedPomodoros: number): number {
  if (phase === "work") return recipe.workMin * 60;
  const isLong = completedPomodoros > 0 && completedPomodoros % recipe.cycles === 0;
  return (isLong ? recipe.longBreakMin : recipe.shortBreakMin) * 60;
}

function nextBreakPhase(recipe: FocusRecipe, completedPomodoros: number): ActivePhase {
  return completedPomodoros > 0 && completedPomodoros % recipe.cycles === 0 ? "long_break" : "short_break";
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function phaseLabel(phase: FocusPhase): string {
  if (phase === "work") return "Focus";
  if (phase === "short_break") return "Short break";
  if (phase === "long_break") return "Long break";
  return "Idle";
}

export function createFocusTimer(options: { now?: () => number; onEvent?: (event: FocusTimerEvent) => void } = {}) {
  const now = () => options.now?.() ?? Date.now();
  const emit = (event: FocusTimerEvent) => options.onEvent?.(event);
  let phase: FocusPhase = "idle";
  let plannedMs = DEFAULT_RECIPE.workMin * 60_000;
  let remainingMs = plannedMs;
  let isRunning = false;
  let waiting = false;
  let completedPomodoros = 0;
  let phaseStartedAt: number | null = null;
  let phaseEndsAt: number | null = null;
  let noteId: string | null = null;
  let noteTitle: string | null = null;
  let recipe: FocusRecipe | null = null;
  let live = false;

  function bound(): FocusRecipe {
    return recipe ?? DEFAULT_RECIPE;
  }

  function remainingFromWall(): number {
    if (!isRunning || phaseEndsAt == null) return remainingMs;
    return Math.max(0, phaseEndsAt - now());
  }

  function snapshot(): FocusSnapshot {
    const remaining = remainingFromWall();
    const active = recipe != null;
    const cycleCount = bound().cycles;
    return {
      phase,
      remainingMs: remaining,
      plannedMs,
      remainingSeconds: Math.max(0, Math.ceil(remaining / 1000)),
      progress: plannedMs > 0 ? Math.max(0, Math.min(1, (plannedMs - remaining) / plannedMs)) : 0,
      isRunning,
      isWaitingForManualStart: waiting,
      isSessionActive: active,
      isQuickSession: active && noteId == null,
      completedPomodoros,
      cycleIndex: cycleCount === 0 ? 0 : completedPomodoros % cycleCount,
      phaseStartedAt,
      phaseEndsAt: isRunning ? phaseEndsAt : null,
      noteId,
      noteTitle,
      recipe,
    };
  }

  function record(state: SessionState, endedAt: number): PhaseRecord | undefined {
    if (phase === "idle" || phaseStartedAt == null || !live) return undefined;
    const plannedS = Math.max(1, Math.round(plannedMs / 1000));
    const workedMs = plannedMs - remainingFromWall();
    const elapsedS = Math.max(0, Math.min(plannedS, Math.round(workedMs / 1000)));
    live = false;
    return { phase, plannedS, elapsedS, state, startedAt: phaseStartedAt, endedAt };
  }

  function finish(state: SessionState): void {
    const endedAt = now();
    const value = record(state, endedAt);
    if (value) emit({ type: "phase-end", record: value });
  }

  function configure(next: ActivePhase, totalSeconds: number, startRunning: boolean): void {
    const started = now();
    phase = next;
    plannedMs = Math.max(0, totalSeconds) * 1000;
    remainingMs = plannedMs;
    phaseStartedAt = started;
    phaseEndsAt = started + plannedMs;
    waiting = false;
    if (startRunning) {
      isRunning = true;
      live = true;
      emit({ type: "phase-start", phase: next, phaseEndsAt: phaseEndsAt, plannedS: Math.round(plannedMs / 1000) });
    } else {
      isRunning = false;
      phaseEndsAt = null;
      waiting = true;
      live = false;
    }
  }

  function advance(): void {
    const current = bound();
    if (phase === "work") {
      finish("completed");
      completedPomodoros += 1;
      const next = nextBreakPhase(current, completedPomodoros);
      configure(next, secondsFor(next, current, completedPomodoros), current.autoContinue);
      return;
    }
    if (phase === "short_break" || phase === "long_break") {
      finish("completed");
      configure("work", secondsFor("work", current, completedPomodoros), current.autoContinue);
      return;
    }
    configure("work", secondsFor("work", current, completedPomodoros), current.autoContinue);
  }

  function begin(nextRecipe: FocusRecipe, nextNoteId: string | null, nextTitle: string): boolean {
    if (recipe != null && noteId === nextNoteId) return false;
    if (recipe != null) return false;
    recipe = clampRecipe(nextRecipe);
    noteId = nextNoteId;
    noteTitle = nextTitle;
    completedPomodoros = 0;
    configure("work", secondsFor("work", recipe, 0), true);
    return true;
  }

  function start(): boolean {
    if (isRunning) return false;
    if (recipe == null && phase === "idle") return false;
    if (phase === "idle") {
      recipe = bound();
      noteTitle ??= "Quick Focus";
      configure("work", secondsFor("work", recipe, completedPomodoros), true);
      return true;
    }
    const remaining = Math.max(remainingMs, 0);
    const started = now();
    isRunning = true;
    waiting = false;
    live = true;
    if (phaseStartedAt == null) phaseStartedAt = started;
    phaseEndsAt = started + remaining;
    emit({ type: "phase-start", phase: phase as ActivePhase, phaseEndsAt, plannedS: Math.round(plannedMs / 1000) });
    return true;
  }

  function pause(): boolean {
    if (!isRunning) return false;
    remainingMs = remainingFromWall();
    isRunning = false;
    phaseEndsAt = null;
    emit({ type: "pause" });
    return true;
  }

  function skip(): boolean {
    if (recipe == null || phase === "idle") return false;
    finish(remainingFromWall() <= 0 ? "completed" : "stopped");
    const current = bound();
    if (phase === "work") {
      completedPomodoros += 1;
      const next = nextBreakPhase(current, completedPomodoros);
      configure(next, secondsFor(next, current, completedPomodoros), current.autoContinue);
    } else {
      configure("work", secondsFor("work", current, completedPomodoros), current.autoContinue);
    }
    return true;
  }

  function reset(): boolean {
    if (recipe == null && phase === "idle") return false;
    if (isRunning || live) finish("stopped");
    isRunning = false;
    waiting = false;
    live = false;
    phase = "idle";
    recipe = null;
    noteId = null;
    noteTitle = null;
    completedPomodoros = 0;
    plannedMs = DEFAULT_RECIPE.workMin * 60_000;
    remainingMs = plannedMs;
    phaseStartedAt = null;
    phaseEndsAt = null;
    emit({ type: "reset" });
    return true;
  }

  function tick(): FocusSnapshot {
    if (!isRunning) return snapshot();
    remainingMs = remainingFromWall();
    if (remainingMs <= 0) advance();
    return snapshot();
  }

  return {
    snapshot,
    beginQuick(next = DEFAULT_RECIPE) {
      return begin(next, null, "Quick Focus");
    },
    beginNote(id: string, title: string, next: FocusRecipe) {
      return begin(next, id, title.trim() || "Focus");
    },
    start,
    pause,
    skip,
    reset,
    tick,
    wouldReplace(id: string | null) {
      return recipe != null && noteId !== id;
    },
  };
}

export type FocusTimer = ReturnType<typeof createFocusTimer>;
