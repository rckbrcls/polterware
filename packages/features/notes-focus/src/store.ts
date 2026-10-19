import { batch, createSignal } from "solid-js";
import { browserBridge, FOCUS_PHASE_KIND, type FocusBridge, type FocusDefaultsJSON, type FocusSessionJSON } from "./bridge";
import { playFocusSound } from "./sounds";
import {
  clampRecipe,
  createFocusTimer,
  recipeFromDefaults,
  recipeFromSchedule,
  type ActivePhase,
  type FocusRecipe,
  type FocusSnapshot,
  type FocusTimer,
  type FocusTimerEvent,
  type PhaseRecord,
} from "./timer";

export type Honesty = "live" | "queued" | "failed" | "unavailable";
export type InterruptedNotice = { message: string; recorded: boolean } | null;
const STORAGE_KEY = "pwnotes.focus.session";

type Persisted = {
  phase: ActivePhase;
  plannedS: number;
  elapsedS: number;
  startedAt: number;
  noteId?: string;
};

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function titles(phase: ActivePhase): { title: string; body: string } {
  if (phase === "work") return { title: "Focus complete", body: "Time for a break." };
  return { title: "Break over", body: "Ready for another focus block?" };
}

function startOfLocalDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function readPersisted(storage: Storage): Persisted | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Persisted;
    if (!value.phase || !value.startedAt || !value.plannedS) return null;
    return value;
  } catch { return null; }
}

export function createFocusStore(getBridge: () => FocusBridge = browserBridge, options: { now?: () => number; storage?: Storage; play?: typeof playFocusSound; autotick?: boolean } = {}) {
  const storage = options.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const play = options.play ?? playFocusSound;
  const autotick = options.autotick !== false;
  let io = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    io = io.catch(() => undefined).then(work);
    return io;
  };
  const [snapshot, setSnapshot] = createSignal<FocusSnapshot>(createFocusTimer({ now: options.now }).snapshot());
  const [defaults, setDefaults] = createSignal<FocusDefaultsJSON | null>(null);
  const [quickRecipe, setQuickRecipe] = createSignal<FocusRecipe>(clampRecipe());
  const [sessions, setSessions] = createSignal<FocusSessionJSON[]>([]);
  const [loadState, setLoadState] = createSignal<Honesty>("queued");
  const [loadError, setLoadError] = createSignal("");
  const [reminderState, setReminderState] = createSignal<Honesty>("unavailable");
  const [reminderDetail, setReminderDetail] = createSignal("Phase reminder is not armed.");
  const [recordState, setRecordState] = createSignal<Honesty>("live");
  const [interrupted, setInterrupted] = createSignal<InterruptedNotice>(null);
  const [pickedNoteId, setPickedNoteId] = createSignal<string | null>(null);
  let oneOffId = "";
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let users = 0;
  let timer: FocusTimer | undefined;

  const now = () => options.now?.() ?? Date.now();

  function publish() {
    if (timer) setSnapshot(timer.snapshot());
  }

  function persist(): void {
    if (!storage || !timer) return;
    const snap = timer.snapshot();
    if (!snap.isSessionActive || snap.phase === "idle" || snap.phaseStartedAt == null) {
      storage.removeItem(STORAGE_KEY);
      return;
    }
    const plannedS = Math.round(snap.plannedMs / 1000);
    storage.setItem(STORAGE_KEY, JSON.stringify({
      phase: snap.phase, plannedS,
      elapsedS: Math.max(0, Math.min(plannedS, Math.round((snap.plannedMs - snap.remainingMs) / 1000))),
      startedAt: snap.phaseStartedAt, noteId: snap.noteId ?? undefined,
    } satisfies Persisted));
  }

  async function cancelArmed(): Promise<void> {
    const id = oneOffId;
    oneOffId = "";
    if (!id) return;
    try { await getBridge().reminders.cancelOneOff({ id }); }
    catch { /* The OS may already have delivered this one-off. */ }
  }

  async function armPhase(phase: ActivePhase, phaseEndsAt: number, noteId: string | null): Promise<void> {
    setReminderState("queued");
    setReminderDetail("Arming the phase-end reminder.");
    try {
      await cancelArmed();
      const copy = titles(phase);
      const result = await getBridge().reminders.armOneOff({
        kind: FOCUS_PHASE_KIND, noteId: noteId ?? "", fireAt: iso(phaseEndsAt), title: copy.title, body: copy.body,
      });
      oneOffId = result.id ?? "";
      setReminderState("live");
      setReminderDetail("Phase reminder armed. It will fire even if this window is hidden.");
    } catch (error) {
      setReminderState("failed");
      setReminderDetail(error instanceof Error ? error.message : "Could not arm the phase reminder.");
    }
  }

  async function recordPhase(record: PhaseRecord, noteId: string | null): Promise<boolean> {
    setRecordState("queued");
    try {
      await getBridge().focus.recordSession({
        noteId: noteId ?? "", phase: record.phase, plannedS: record.plannedS, elapsedS: record.elapsedS,
        state: record.state, startedAt: iso(record.startedAt), endedAt: iso(record.endedAt),
      });
      setRecordState("live");
      await refreshSessions();
      return true;
    } catch (error) {
      setRecordState("failed");
      setLoadError(error instanceof Error ? error.message : "Could not record the focus session.");
      return false;
    }
  }

  function onEvent(event: FocusTimerEvent): void {
    void enqueue(async () => {
      const noteId = timer?.snapshot().noteId ?? null;
      if (event.type === "phase-start") {
        persist();
        await armPhase(event.phase, event.phaseEndsAt, noteId);
      } else if (event.type === "phase-end") {
        await cancelArmed();
        const recorded = await recordPhase(event.record, noteId);
        const enabled = defaults()?.sounds !== false;
        const name = (await getBridge().settings.get({}).catch(() => ({ settings: undefined }))).settings?.notificationsSound ?? "glass";
        if (recorded) await play(name, enabled).catch(() => {});
      } else if (event.type === "pause") {
        persist();
        await cancelArmed();
        setReminderState("unavailable");
        setReminderDetail("Phase reminder cancelled while paused.");
      } else {
        await cancelArmed();
        if (storage) storage.removeItem(STORAGE_KEY);
        setReminderState("unavailable");
        setReminderDetail("Phase reminder is not armed.");
      }
      publish();
      persist();
    });
  }

  function ensureTimer(): FocusTimer {
    if (!timer) timer = createFocusTimer({ now, onEvent });
    return timer;
  }

  function startTicking(): void {
    if (!autotick || tickTimer != null) return;
    tickTimer = setInterval(() => {
      ensureTimer().tick();
      publish();
      persist();
    }, 250);
  }

  function stopTicking(): void {
    if (tickTimer == null) return;
    clearInterval(tickTimer);
    tickTimer = undefined;
  }

  async function refreshSessions(): Promise<void> {
    const from = startOfLocalDay(new Date(now()));
    const to = new Date(now() + 1000);
    const listed = await getBridge().focus.listSessions({ from: from.toISOString(), to: to.toISOString() });
    setSessions(listed.sessions ?? []);
  }

  async function recoverInterrupted(): Promise<void> {
    if (!storage) return;
    const pending = readPersisted(storage);
    storage.removeItem(STORAGE_KEY);
    if (!pending) return;
    const endedAt = now();
    const elapsedS = Math.max(0, Math.min(pending.plannedS, pending.elapsedS ?? Math.round((endedAt - pending.startedAt) / 1000)));
    let recorded = false;
    try {
      recorded = await recordPhase({
        phase: pending.phase, plannedS: pending.plannedS, elapsedS, state: "stopped", startedAt: pending.startedAt, endedAt,
      }, pending.noteId ?? null);
    } catch { recorded = false; }
    setInterrupted({
      message: "The previous focus session was not resumed. The window closed mid-phase.",
      recorded,
    });
  }

  async function load(): Promise<void> {
    setLoadState("queued");
    setLoadError("");
    try {
      const [focus, setting] = await Promise.all([getBridge().focus.getDefaults({}), getBridge().settings.get({})]);
      const next = focus.defaults ?? recipeFromDefaults();
      setDefaults(next);
      setQuickRecipe(recipeFromDefaults(next));
      await refreshSessions();
      await recoverInterrupted();
      setLoadState("live");
    } catch (error) {
      setLoadState("unavailable");
      setLoadError(error instanceof Error ? error.message : "Focus is unavailable.");
    }
  }

  function afterStart(): void {
    publish();
    persist();
    startTicking();
  }

  async function startQuick(recipe?: FocusRecipe): Promise<boolean> {
    const engine = ensureTimer();
    if (engine.snapshot().isSessionActive) return false;
    const used = clampRecipe(recipe ?? quickRecipe());
    const started = engine.beginQuick(used);
    if (started) afterStart();
    return started;
  }

  async function startNote(id: string): Promise<boolean> {
    const engine = ensureTimer();
    if (engine.wouldReplace(id)) return false;
    if (engine.snapshot().isSessionActive && engine.snapshot().noteId === id) return false;
    const result = await getBridge().notes.get({ id, include: { schedule: true } });
    const note = result.note;
    if (!note?.id) throw new Error("Note unavailable.");
    const recipe = recipeFromSchedule(note.schedule);
    if (!recipe) throw new Error("This note has no focus recipe.");
    const started = engine.beginNote(note.id, note.title ?? "Focus", recipe);
    if (started) afterStart();
    return started;
  }

  async function startCommand(): Promise<boolean> {
    const picked = pickedNoteId();
    if (picked) {
      try { if (await startNote(picked)) return true; }
      catch { /* Fall back to a quick session when the selected note has no recipe. */ }
    }
    return startQuick();
  }

  const store = {
    snapshot, defaults, quickRecipe, sessions, loadState, loadError, reminderState, reminderDetail, recordState, interrupted, pickedNoteId,
    setQuickRecipe, pickNote: setPickedNoteId, dismissInterrupted: () => setInterrupted(null),
    connect() {
      users += 1;
      if (users === 1) {
        try {
          unsubscribe = getBridge().onChange(event => {
            if (event.resync || event.changes.some(change => change.entity === "focus" || change.entity === "settings")) void load();
          });
        } catch {
          setLoadState("unavailable");
          setLoadError("Polterware Notes bridge unavailable. Open this page in Polterware Notes Desktop.");
        }
        void load();
      }
      return () => {
        users = Math.max(0, users - 1);
        if (users === 0) { unsubscribe?.(); unsubscribe = undefined; }
      };
    },
    startQuick, startNote, startCommand,
    pause() { const ok = ensureTimer().pause(); publish(); persist(); if (!ensureTimer().snapshot().isRunning) stopTicking(); return ok; },
    resume() { const ok = ensureTimer().start(); if (ok) afterStart(); return ok; },
    skip() { const ok = ensureTimer().skip(); publish(); persist(); if (!ensureTimer().snapshot().isRunning) stopTicking(); else startTicking(); return ok; },
    reset() { const ok = ensureTimer().reset(); publish(); if (storage) storage.removeItem(STORAGE_KEY); stopTicking(); return ok; },
    tick() { ensureTimer().tick(); publish(); persist(); },
    async reload() { await load(); },
    flush() { return io; },
    dispose() { stopTicking(); unsubscribe?.(); unsubscribe = undefined; users = 0; },
  };
  return store;
}

export const focusStore = createFocusStore();
export type FocusStore = ReturnType<typeof createFocusStore>;
