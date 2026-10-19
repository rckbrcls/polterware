import { Show, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { Button, StatusChip } from "@polterware/frontend-design-system";
import { useNotesShell } from "@polterware/feature-notes-shell/feature";
import { browserBridge } from "./bridge";
import { recipeFromSchedule } from "./timer";
import { focusStore } from "./store";

/** Read-only focus recipe. Editing belongs to W2-SCHEDULE. */
export function FocusRecipeSection() {
  const shell = useNotesShell();
  const id = () => shell.selectedNoteId();
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [recipe] = createResource(id, async noteId => {
    if (!noteId) return null;
    focusStore.pickNote(noteId);
    const result = await browserBridge().notes.get({ id: noteId, include: { schedule: true } });
    return { title: result.note?.title ?? "Focus", recipe: recipeFromSchedule(result.note?.schedule) };
  });

  onMount(() => onCleanup(focusStore.connect()));

  const start = async () => {
    const noteId = id();
    if (!noteId || busy()) return;
    setBusy(true); setError("");
    try { await focusStore.startNote(noteId); }
    catch (value) { setError(value instanceof Error ? value.message : "Could not start focus."); }
    finally { setBusy(false); }
  };

  return (
    <div data-focus-recipe class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <p class="sr-only">Focus recipe</p>
        <StatusChip tone={recipe.loading ? "syncing" : recipe.error ? "danger" : recipe()?.recipe ? "ok" : "muted"}>
          {recipe.loading ? "Queued" : recipe.error ? "Failed" : recipe()?.recipe ? "Live" : "Unavailable"}
        </StatusChip>
      </div>
      <Show when={recipe.error}><p role="alert" class="text-[13px] text-[var(--color-text-secondary)]">Focus recipe unavailable.</p></Show>
      <Show when={!recipe.loading && !recipe.error && !recipe()?.recipe}>
        <p class="text-[13px] text-[var(--color-text-muted)]">No focus recipe. Add one in Schedule.</p>
      </Show>
      <Show when={recipe()?.recipe}>{value => (
        <>
          <p class="text-[13px] text-[var(--color-text-secondary)]">{value().workMin}/{value().shortBreakMin} · long break {value().longBreakMin} min after {value().cycles} sessions · {value().autoContinue ? "auto-continue on" : "auto-continue off"}</p>
          <Button variant="secondary" disabled={busy() || focusStore.snapshot().isSessionActive && focusStore.snapshot().noteId !== id()} onClick={() => void start()}>
            {focusStore.snapshot().noteId === id() && focusStore.snapshot().isSessionActive ? "Focus running" : "Start focus"}
          </Button>
        </>
      )}</Show>
      <Show when={error()}><p role="alert" class="text-[13px] text-[var(--color-text-secondary)]">{error()}</p></Show>
    </div>
  );
}
