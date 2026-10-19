import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  Button, FilterChipGroup, PageError, PageLoading, PageOffline, Play, ProgressRing, StatusChip,
} from "@polterware/frontend-design-system";
import { NoteDetailHost, useNotesShell } from "@polterware/feature-notes-shell/feature";
import { formatRemaining, phaseLabel, WORK_PRESETS, type FocusRecipe } from "./timer";
import { focusStore, type FocusStore } from "./store";
import "./focus-page.css";

const DIAL_MAX = 60;
const DIAL_SIZE = 240;
const DIAL_THICKNESS = 16;

function minutesFromPoint(clientX: number, clientY: number, host: HTMLElement): number {
  const rect = host.getBoundingClientRect();
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  const clockwise = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  const minutes = Math.round((clockwise / (Math.PI * 2)) * DIAL_MAX);
  return Math.min(DIAL_MAX, Math.max(1, minutes || DIAL_MAX));
}

function honestyTone(state: string): "ok" | "syncing" | "danger" | "muted" {
  if (state === "live") return "ok";
  if (state === "queued") return "syncing";
  if (state === "failed") return "danger";
  return "muted";
}

export function FocusPage(props: { store?: FocusStore }) {
  const store = props.store ?? focusStore;
  const shell = useNotesShell();
  const snap = () => store.snapshot();
  const recipe = createMemo(() => snap().recipe ?? store.quickRecipe());

  onMount(() => onCleanup(store.connect()));

  createEffect(() => {
    const url = shell.deepLink();
    if (!url || url.hostname !== "note" || url.searchParams.get("action") !== "focus") return;
    const id = url.pathname.replace(/^\//, "");
    if (!id) return;
    void store.startNote(id).catch(error => store.reload().then(() => { throw error; }).catch(() => {}));
  });

  const cycles = () => Array.from({ length: recipe().cycles }, (_, index) => index);
  const filled = () => {
    const count = recipe().cycles;
    if (snap().phase === "long_break") return count;
    return snap().completedPomodoros % count;
  };
  const primary = () => {
    if (!snap().isSessionActive) return { label: "Start", action: () => void store.startQuick(), kind: "start" as const };
    if (snap().isWaitingForManualStart) return { label: snap().phase === "work" ? "Start focus" : "Start break", action: () => store.resume(), kind: "start" as const };
    if (snap().isRunning) return { label: "Pause", action: () => store.pause(), kind: "pause" as const };
    return { label: "Resume", action: () => store.resume(), kind: "start" as const };
  };

  const applyWork = (minutes: number) => {
    const next: FocusRecipe = { ...recipe(), workMin: Number(minutes) };
    store.setQuickRecipe(next);
  };
  const [dragging, setDragging] = createSignal(false);
  let clock: HTMLDivElement | undefined;
  const dial = () => !snap().isSessionActive;
  const shownMs = () => dial() ? recipe().workMin * 60_000 : snap().remainingMs;
  const knobStyle = () => {
    const angle = (recipe().workMin / DIAL_MAX) * Math.PI * 2 - Math.PI / 2;
    const radius = (DIAL_SIZE - DIAL_THICKNESS) / 2;
    return {
      left: `${DIAL_SIZE / 2 + Math.cos(angle) * radius}px`,
      top: `${DIAL_SIZE / 2 + Math.sin(angle) * radius}px`,
    };
  };
  const dragFrom = (event: PointerEvent) => { if (clock) applyWork(minutesFromPoint(event.clientX, event.clientY, clock)); };
  const onDialDown = (event: PointerEvent) => {
    if (!dial() || event.button !== 0 || !clock) return;
    event.preventDefault();
    setDragging(true);
    clock.setPointerCapture(event.pointerId);
    dragFrom(event);
  };
  const onDialMove = (event: PointerEvent) => { if (dragging()) dragFrom(event); };
  const onDialUp = (event: PointerEvent) => {
    if (!dragging()) return;
    setDragging(false);
    if (clock?.hasPointerCapture(event.pointerId)) clock.releasePointerCapture(event.pointerId);
  };
  const onDialKey = (event: KeyboardEvent) => {
    const step = event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : event.key === "ArrowDown" || event.key === "ArrowLeft" ? -1 : 0;
    if (event.key === "Home") { event.preventDefault(); applyWork(1); return; }
    if (event.key === "End") { event.preventDefault(); applyWork(DIAL_MAX); return; }
    if (!step) return;
    event.preventDefault();
    applyWork(Math.min(DIAL_MAX, Math.max(1, recipe().workMin + step)));
  };

  const title = () => {
    if (!snap().isSessionActive) return "Focus";
    if (snap().phase !== "work") return phaseLabel(snap().phase);
    return snap().noteTitle || "Focus";
  };

  return (
    <NoteDetailHost><div data-focus-page class="notes-focus-page">
      <Show when={store.loadState() === "queued"}><PageLoading label="Loading focus" /></Show>
      <Show when={store.loadState() === "unavailable"}>
        <PageOffline title="Focus unavailable" message={store.loadError() || "The local core is unreachable."} onRetry={() => void store.reload()} />
      </Show>
      <Show when={store.loadState() === "failed"}>
        <PageError title="Focus failed" message={store.loadError()} onRetry={() => void store.reload()} />
      </Show>
      <Show when={store.loadState() === "live"}>
        <div class="notes-focus-stage">
          <h1 class="notes-focus-title">{title()}</h1>
          <Show when={store.interrupted()}>
            <p role="status" class="max-w-md text-center text-[13px] text-[var(--color-text-secondary)]">{store.interrupted()!.message} {store.interrupted()!.recorded ? "The interrupted phase was recorded as stopped." : "The interrupted phase could not be recorded."}</p>
          </Show>
          <Show when={snap().isQuickSession}><p class="text-[13px] text-[var(--color-text-muted)]">Quick focus</p></Show>
          <Show when={snap().noteId}><p class="text-[13px] text-[var(--color-text-muted)]">Note-bound</p></Show>
          <div class="notes-focus-clock" ref={clock} data-dragging={dragging() ? "" : undefined}
            onPointerDown={onDialDown} onPointerMove={onDialMove} onPointerUp={onDialUp} onPointerCancel={onDialUp}>
            <ProgressRing label={dial() ? "Work duration" : `${phaseLabel(snap().phase)} remaining`} value={dial() ? Math.round(recipe().workMin / DIAL_MAX * 100) : Math.round(snap().progress * 100)} size={DIAL_SIZE} thickness={DIAL_THICKNESS} />
            <p class="notes-focus-time" role="timer" aria-live="off" aria-label="Time remaining">{formatRemaining(shownMs())}</p>
            <Show when={dial()}>
              <button type="button" class="notes-focus-knob" style={knobStyle()} role="slider" aria-label="Work duration" aria-valuemin={1} aria-valuemax={DIAL_MAX} aria-valuenow={recipe().workMin} aria-valuetext={`${recipe().workMin} minutes`} onKeyDown={onDialKey} />
            </Show>
          </div>
          <Show when={snap().isSessionActive}>
            <p class="text-[13px] text-[var(--color-text-secondary)]" role="status" aria-live="polite" aria-atomic="true">{snap().isRunning ? "Running" : snap().isWaitingForManualStart ? "Ready" : "Paused"}</p>
            <div class="flex gap-2" role="list" aria-label="Completed focus cycles">
              <For each={cycles()}>{index => (
                <span role="listitem" class={`h-2 w-2 rounded-full ${index < filled() ? "bg-[var(--color-brand)]" : "bg-[var(--color-surface-selected)]"}`} aria-label={index < filled() ? `Cycle ${index + 1} complete` : `Cycle ${index + 1} remaining`} />
              )}</For>
            </div>
          </Show>
          <div class="flex flex-wrap items-center justify-center gap-2">
            <Button class="notes-focus-start !rounded-full" variant={primary().kind === "pause" ? "secondary" : "primary"} onClick={() => primary().action()}>
              {primary().label}
              <Show when={primary().kind === "start"}><Play size={14} /></Show>
            </Button>
            <Show when={snap().isSessionActive}>
              <Button variant="secondary" onClick={() => store.skip()}>Skip</Button>
              <Button variant="danger" onClick={() => store.reset()}>Reset</Button>
            </Show>
          </div>
          <Show when={!snap().isSessionActive}>
            <FilterChipGroup aria-label="Work duration" value={String(recipe().workMin)} onChange={value => applyWork(Number(value))} items={WORK_PRESETS.map(minutes => ({ id: String(minutes), label: `${minutes} min` }))} />
          </Show>
          <Show when={store.recordState() !== "live"}>
            <StatusChip tone={honestyTone(store.recordState())}>{store.recordState() === "queued" ? "Recording session" : store.recordState() === "failed" ? "Session record failed" : "Session record unavailable"}</StatusChip>
          </Show>
        </div>
        <Show when={store.sessions().length}>
          <section class="notes-focus-sessions" aria-label="Today's sessions">
            <div class="notes-focus-sessions-head">
              <h2>Today</h2>
              <span>{store.sessions().filter(session => session.state === "completed" && session.phase === "work").length} completed</span>
            </div>
            <For each={store.sessions()}>{session => (
              <div class="notes-focus-session" data-state={session.state === "completed" ? "completed" : "stopped"}>
                <span class="notes-focus-session-dot" aria-hidden="true" />
                <span>{phaseLabel((session.phase as "work" | "short_break" | "long_break") ?? "idle")}{session.state === "completed" ? "" : " · Stopped"}</span>
                <span class="notes-focus-session-meta">
                  {Math.round((session.elapsedS ?? 0) / 60)} min{session.endedAt ? ` · ${new Date(session.endedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                </span>
              </div>
            )}</For>
          </section>
        </Show>
      </Show>
    </div></NoteDetailHost>
  );
}
