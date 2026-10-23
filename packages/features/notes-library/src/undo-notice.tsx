import { For } from "solid-js";
import { Button, Surface } from "@polterware/frontend-design-system";
import type { NotesStore } from "./store";

/** Actionable undo uses a shared Surface because the shared toast has no action slot. */
export function UndoNotice(props: { store: NotesStore }) {
  return <div role="status" aria-live="polite" class="flex flex-col gap-2">
    <For each={props.store.undos()}>{item => <Surface class="flex items-center justify-between gap-3 p-3">
      <span>{item.message} · Undo available for 8 seconds</span>
      <Button variant="secondary" onClick={() => void props.store.undo(item)}>Undo</Button>
    </Surface>}</For>
  </div>;
}
