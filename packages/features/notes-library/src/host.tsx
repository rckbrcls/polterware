import { Show } from "solid-js";
import type { DetailSectionDef } from "@polterware/feature-notes-shell/feature";
import { NoteDetailHost as NotePanelHost } from "@polterware/feature-notes-shell/feature";
import { NoteDetail, NoteProperties } from "./note-detail";
import { tryNotesShell } from "./shell-access";
import type { NotesStore } from "./store";

export function NoteDetailHost(props: { noteId?: string; sections?: DetailSectionDef[]; store?: NotesStore }) {
  const shell = tryNotesShell();
  const id = () => props.noteId || shell?.selectedNoteId() || shell?.params().id || "";
  const editor = () => <Show when={id()}>{value => <NoteDetail noteId={value()} sections={props.sections ?? shell?.detailSections() ?? []} store={props.store} />}</Show>;
  return shell ? <NotePanelHost>{editor()}</NotePanelHost> : editor();
}

export function NotePropertiesHost(props: { noteId?: string; sections?: DetailSectionDef[]; store?: NotesStore }) {
  const shell = tryNotesShell();
  const id = () => props.noteId || shell?.selectedNoteId() || "";
  return <Show when={id()}>{value => <NoteProperties noteId={value()} sections={props.sections ?? shell?.detailSections() ?? []} store={props.store} />}</Show>;
}
