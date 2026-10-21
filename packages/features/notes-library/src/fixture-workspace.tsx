import { Show, createSignal } from "solid-js";
import { DetailPanel, DesignSystemProvider } from "@polterware/frontend-design-system";
import type { DetailSectionDef } from "@polterware/feature-notes-shell/feature";
import { NoteCollection } from "./note-list";
import { NoteDetail } from "./note-detail";
import type { NotesStore } from "./store";

/** Isolated host for page behavior tests and W3's 10k Playwright performance fixture. */
export function NoteFixtureWorkspace(props: { store: NotesStore; sections?: DetailSectionDef[]; virtualized?: boolean; mode?: "today" | "inbox" | "space"; spaceId?: string }) {
  const [selected, setSelected] = createSignal<string>();
  const [open, setOpen] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  return <DesignSystemProvider storagePrefix="notes-fixture">
    <DetailPanel.Root open={open()} expanded={expanded()} activeEntityId={selected() ?? null} onOpenChange={setOpen} onExpandedChange={setExpanded}>
      <DetailPanel.Collection><NoteCollection store={props.store} mode={props.mode} spaceId={props.spaceId} virtualized={props.virtualized} onOpen={id => { setSelected(id); setOpen(true); }} /></DetailPanel.Collection>
      <DetailPanel.Content><DetailPanel.Header /><Show when={selected()}>{id => <NoteDetail noteId={id()} sections={props.sections} store={props.store} />}</Show></DetailPanel.Content>
    </DetailPanel.Root>
  </DesignSystemProvider>;
}
