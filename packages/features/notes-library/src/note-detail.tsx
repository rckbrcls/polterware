import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, on, type Component, type JSX } from "solid-js";
import type { DetailSectionDef } from "@polterware/feature-notes-shell/feature";
import { A11yDialog, ChevronLeft, DateTimePicker, ArrowDown, ArrowUp, Inbox, Scale, XIcon, AuroraCover, CalendarClock, Clock, Delete, FileUp, Gauge, Layers, MapPin, auroraForId, Button, DetailPanel, FileText, FilterChip, IconTile, Input, MarkdownEditor, PageEmpty, PageError, PageLoading, Select, SidebarRightIcon, StatusChip, Switch } from "@polterware/frontend-design-system";
import { TagPicker } from "./tag-picker";
import { spaceMark } from "./space-mark";
import { tryNotesShell } from "./shell-access";
import { checklistInputs, errorText, joinChecklist, localDate, splitChecklist, type NoteRecord } from "./model";
import { notesStore, type NotesStore } from "./store";
import { UndoNotice } from "./undo-notice";

export type NoteDetailProps = { noteId: string; sections?: DetailSectionDef[]; store?: NotesStore };
export function orderedSections(sections: DetailSectionDef[], noteId: string) {
  return sections.filter(section => section.visible?.(noteId) !== false).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** The page's NoteDetailHost owns the panel; this feature owns its record body. */
export function NoteDetail(props: NoteDetailProps) {
  const store = props.store ?? notesStore;
  const shell = tryNotesShell();
  onMount(() => onCleanup(store.connect()));
  const [error, setError] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const [actionError, setActionError] = createSignal("");
  const current = () => store.record(props.noteId);
  createEffect(on(() => props.noteId, id => {
    setError(""); setPending(!store.record(id));
    let active = true;
    void store.load(id).catch(value => { if (active) setError(errorText(value)); }).finally(() => { if (active) setPending(false); });
    onCleanup(() => { active = false; void store.flush(id); });
  }));
  const sections = createMemo(() => orderedSections(props.sections ?? shell?.detailSections() ?? [], props.noteId));
  async function remove() {
    try { await store.queueDelete(props.noteId); setConfirmDelete(false); setActionError(""); }
    catch (value) { setActionError(errorText(value)); }
  }
  const edit = (patch: Parameters<typeof store.edit>[1]) => store.edit(props.noteId, patch);
  const keyboard = (event: KeyboardEvent) => {
    if (!(event.target instanceof HTMLElement)) return;
    if ((event.metaKey || event.ctrlKey) && event.key === "Backspace" && !event.target.closest("input, textarea, [contenteditable=true]")) { event.preventDefault(); setConfirmDelete(true); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void store.flush(props.noteId); }
  };
  return <div class="flex h-full min-h-0 flex-1 flex-col" onKeyDown={keyboard}>
    <Show when={pending()}><PageLoading label="Loading note" /></Show>
    <Show when={error()}><PageError title="Note unavailable" message={error()} onRetry={() => { setError(""); void store.load(props.noteId, true).catch(value => setError(errorText(value))); }} /></Show>
    <Show when={store.deleting().has(props.noteId)}>
      <PageEmpty title="Deletion queued" description="Undo within 8 seconds to keep this note and its related data." />
      <UndoNotice store={store} />
    </Show>
    <Show when={!current() && !pending() && !error() && !store.deleting().has(props.noteId)}><PageEmpty title="Note removed" description="Open another note to continue." /></Show>
    <Show when={!store.deleting().has(props.noteId) && current()}>{note => <NotePageBody note={note()} store={store} sections={sections()} onDelete={() => setConfirmDelete(true)} edit={edit} />}</Show>
    <A11yDialog open={confirmDelete()} title="Delete note?" size="sm" onClose={() => setConfirmDelete(false)} footer={<><Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={() => void remove()}>Delete</Button></>}>
      <p>Deletion is queued for 8 seconds. Undo cancels it and preserves the note and all its related data.</p>
      <Show when={actionError()}><p role="alert">{actionError()}</p></Show>
    </A11yDialog>
  </div>;
}
/** A centered document (checklist as `- [ ]`) beside its programmatic properties. */
function NotePageBody(props: { note: NoteRecord; store: NotesStore; sections: DetailSectionDef[]; onDelete: () => void; edit: (patch: Parameters<NotesStore["edit"]>[1]) => void }) {
  const { store } = props;
  const shell = tryNotesShell();
  const id = () => props.note.id;
  const attachments = shell?.noteAttachments?.();
  const railOpen = () => shell?.propertiesOpen?.() ?? false;
  const toggleRail = () => shell?.setPropertiesOpen?.(!railOpen());
  const [body, setBody] = createSignal(joinChecklist(props.note.content, checklistInputs(props.note.checklist)));
  // Adopt note/checklist changes that did not come from this editor (core, MCP, reload) once saving settles,
  // and turn task syntax that was typed as plain text into real checklist items.
  createEffect(on(() => [props.note.content, props.note.checklist, store.state(props.note.id), store.drafts()[props.note.id]] as const, ([content, checklist, saveState, draft]) => {
    if (saveState !== "live" || draft) return;
    const local = namedItems(splitChecklist(body(), checklistInputs(checklist)));
    const same = local.content === content.trim() && local.items.length === checklist.length
      && local.items.every((item, index) => item.title === (checklist[index]?.title ?? "") && item.done === (checklist[index]?.done ?? false));
    const literal = /^\\[-*+] \\\[[ xX]\\\]/m.test(body());
    if (!same || literal) setBody(joinChecklist(content, checklistInputs(checklist)));
  }, { defer: true }));
  function changeBody(markdown: string) {
    setBody(markdown);
    const previous = checklistInputs(props.note.checklist);
    const next = namedItems(splitChecklist(markdown, previous));
    if (next.content !== props.note.content.trim()) props.edit({ content: next.content });
    const unchanged = next.items.length === previous.length && next.items.every((item, index) => item.title === previous[index]!.title && item.done === previous[index]!.done);
    if (!unchanged) store.editChecklist(id(), next.items);
  }
  const state = () => store.state(id());
  let editor: HTMLDivElement | undefined;
  return <DetailPanel.Body class="pw-detail-panel__body--fixed h-full min-h-0">
    <DetailPanel.Main class="flex min-w-0 min-h-0 flex-1 flex-col overflow-y-auto !p-3">
      <div class="relative shrink-0">
        <AuroraCover palette={auroraForId(id())} seed={id()} class="!h-28 !rounded-[var(--radius-surface)]" />
        <span class="absolute bottom-3 left-4 inline-flex text-[var(--color-bg)]" aria-hidden="true"><FileText size={32} /></span>
      </div>
      <div class="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col gap-4 pb-4 pt-4">
        <div class="flex items-center justify-between gap-3">
          <Show when={shell?.leaveNote} fallback={<span />}>
            <Button variant="icon" aria-label="Back" title="Back" onClick={() => { void store.flush(id()); shell?.leaveNote?.(); }}>
              <ChevronLeft size={14} />
            </Button>
          </Show>
          <div class="flex shrink-0 items-center gap-2">
            <span role="status" aria-live="polite" class="text-xs text-[var(--color-text-muted)]">{state() === "live" ? "Saved" : state() === "queued" ? "Changes queued" : state() === "saving" ? "Saving…" : state() === "conflict" ? "Edit conflict" : "Save failed"}</span>
            <Button
              variant="icon"
              aria-label={railOpen() ? "Hide properties" : "Show properties"}
              aria-expanded={railOpen()}
              title={railOpen() ? "Hide properties" : "Show properties"}
              onClick={toggleRail}
            >
              <SidebarRightIcon size={14} />
            </Button>
          </div>
        </div>
        <Show when={state() === "conflict" || state() === "failed"}>
          <div role="alert" class="flex flex-col gap-2">
            <StatusChip tone="danger">{state() === "conflict" ? "Edit conflict" : "Save failed"}</StatusChip>
            <p>{store.drafts()[id()] ? "Your local edits are retained. Reload discards them; Overwrite applies them to the latest revision." : "The action failed. Reload the note before retrying."} {store.errors()[id()]}</p>
            <div class="flex gap-2">
              <Button variant="secondary" onClick={() => void store.resolve(id(), "reload")}>Reload</Button>
              <Show when={store.drafts()[id()]}><Button onClick={() => void store.resolve(id(), "overwrite")}>Overwrite</Button></Show>
            </div>
          </div>
        </Show>
        <Input aria-label="Title" placeholder="Untitled" class="!h-auto !border-0 !bg-transparent !pl-8 !pr-0 !py-1 !text-[36px] !font-semibold !leading-tight !shadow-none !outline-none !ring-0 focus:!outline-none focus-visible:!outline-none focus-visible:!shadow-none focus-visible:!ring-0 focus:!border-0" id={`note-title-${id()}`} data-note-title value={props.note.title}
          onInput={event => props.edit({ title: event.currentTarget.value })} onBlur={() => void store.flush(id())}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); editor?.querySelector<HTMLElement>(".ProseMirror")?.focus(); } }} />
        <div class="pl-8">
          <TagPicker tags={store.tags()} selectedIds={props.note.tagIds ?? []}
          onChange={ids => store.editTags(id(), ids)} onCreate={name => store.createTag(name)} />
        </div>
        <div ref={editor} class="pw-note-editor flex min-h-0 flex-1 flex-col [&_.pw-md-editor]:min-h-0 [&_.pw-md-editor__surface]:flex [&_.pw-md-editor__surface]:flex-col [&_.ProseMirror]:flex-1 [&_.ProseMirror]:!outline-none [&_.ProseMirror]:!shadow-none [&_.ProseMirror:focus-visible]:!outline-none">
          <MarkdownEditor aria-label="Note content" placeholder="Write something…" value={body()} onChange={changeBody}
            renderAttachment={attachments ? (attachmentId, block) => attachments.render(id(), attachmentId, block) : undefined}
            onPickAttachments={attachments ? () => attachments.pick(id()) : undefined}
            attachmentActions={attachments?.actions?.map(action => ({ ...action, run: () => action.run(id()) }))}
            onAttachFiles={attachments ? files => attachments.drop(id(), files) : undefined} />
        </div>
        <UndoNotice store={store} />
      </div>
    </DetailPanel.Main>
  </DetailPanel.Body>;
}

/** The note's properties, rendered by the shell inside its floating details card. */
export function NoteProperties(props: NoteDetailProps) {
  const store = props.store ?? notesStore;
  const shell = tryNotesShell();
  onMount(() => onCleanup(store.connect()));
  const note = () => store.record(props.noteId);
  const sections = createMemo(() => orderedSections(props.sections ?? shell?.detailSections() ?? [], props.noteId));
  const edit = (patch: Parameters<typeof store.edit>[1]) => store.edit(props.noteId, patch);
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  async function remove() {
    try { await store.queueDelete(props.noteId); setConfirmDelete(false); } catch { setConfirmDelete(false); }
  }
  return <Show when={note()}>{live => <DetailPanel.Body layout="document"><DetailPanel.Main class="!px-4 !pb-4 !pt-4">
    <DetailPanel.Title title={live().title || "Untitled"} />
    <Show when={shell?.isFreshNote?.(props.noteId)}>
          <Button variant="secondary" size="sm" onClick={() => { void store.flush(props.noteId).then(() => shell?.cancelNewNote?.(props.noteId)); }}>Cancel</Button>
        </Show>
        <DetailPanel.Section title="Organize" icon={<Layers size={14} />} collapsible>
          <DetailPanel.Properties>
            <DetailPanel.Property
              label="Space"
              value={
                <Select
                  size="sm"
                  class="w-full"
                  aria-label="Space"
                  options={[{ value: "", label: "Inbox", icon: <Inbox size={14} aria-hidden="true" /> }, ...store.spaces().map(space => ({ value: space.id ?? "", label: space.name ?? "Unnamed Space", icon: spaceMark(space.color, space.icon, space.id) }))]}
                  value={live().spaceId}
                  onChange={spaceId => edit(spaceId ? { spaceId, clearSpaceId: false } : { clearSpaceId: true })}
                />
              }
            />
            <DetailPanel.Property
              label="Status"
              value={
                <div class="flex w-full justify-end">
                  <Button variant="secondary" size="sm" onClick={() => void store.toggle(props.noteId, "status")}>
                    {live().status === "completed" ? "Reopen" : "Complete"}
                  </Button>
                </div>
              }
            />
            <DetailPanel.Property
              label="Pin"
              value={
                <div class="flex w-full justify-end"><Switch
                  size="sm"
                  aria-label="Pin note"
                  checked={live().pinned}
                  onCheckedChange={() => void store.toggle(props.noteId, "pinned")}
                /></div>
              }
            />
            <DetailPanel.Property
              label="Priority"
              value={
                <Select
                  size="sm"
                  class="w-full"
                  aria-label="Priority"
                  value={live().priority?.toString() ?? ""}
                  options={[
                    { value: "", label: "None", icon: <XIcon size={14} aria-hidden="true" /> },
                    { value: "1", label: "Low", icon: <ArrowDown size={14} aria-hidden="true" /> },
                    { value: "2", label: "Normal", icon: <Scale size={14} aria-hidden="true" /> },
                    { value: "3", label: "High", icon: <ArrowUp size={14} aria-hidden="true" /> },
                  ]}
                  onChange={value => edit(value ? { priority: Number(value), clearPriority: false } : { clearPriority: true })}
                />
              }
            />
          </DetailPanel.Properties>
          <Show when={store.metadataError()}>
            <p role="status" class="text-xs text-[var(--color-danger)]">Space, tags or activity unavailable: {store.metadataError()}</p>
          </Show>
        </DetailPanel.Section>
        <DetailPanel.Section title="Schedule" icon={<CalendarClock size={14} />} collapsible>
          <For each={sections().filter(section => section.id === "schedule")}>{section => <SectionContribution section={section} noteId={props.noteId} onAllDayChange={dueAllDay => edit({ dueAllDay })}>
            <DetailPanel.Property
              label="Ends"
              value={
                <DateTimePicker
                  class="!w-auto !ml-auto"
                  aria-label="Due date"
                  dateOnly={live().dueAllDay}
                  value={dueInput(live())}
                  onValueChange={value => {
                    if (!value) { edit({ clearDueAt: true }); return; }
                    const date = new Date(live().dueAllDay ? `${value}T00:00:00Z` : value);
                    if (!Number.isNaN(date.getTime())) edit({ dueAt: date.toISOString(), clearDueAt: false });
                  }}
                />
              }
            />
            <DetailPanel.Property
              label="Auto-complete"
              value={
                <div class="flex w-full justify-end"><Switch
                  size="sm"
                  aria-label="Complete note when every item is done"
                  checked={live().autoCompleteOnChecklist}
                  onCheckedChange={value => edit({ autoCompleteOnChecklist: value })}
                /></div>
              }
            />
          </SectionContribution>}</For>
        </DetailPanel.Section>
        <For each={sections().filter(section => section.id !== "schedule" && section.id !== "focus-recipe")}>{section => (
          <DetailPanel.Section title={sectionTitle(section.id)} icon={sectionIcon(section.id)} collapsible>
            <SectionContribution section={section} noteId={props.noteId} />
          </DetailPanel.Section>
        )}</For>
        <DetailPanel.Section title="Danger zone" icon={<Delete size={14} />} collapsible defaultOpen={false}>
          <Button variant="danger" size="sm" disabled={store.deleting().has(props.noteId)} onClick={() => setConfirmDelete(true)}>Delete note</Button>
        </DetailPanel.Section>
    <A11yDialog open={confirmDelete()} title="Delete note?" size="sm" onClose={() => setConfirmDelete(false)} footer={<><Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={() => void remove()}>Delete</Button></>}>
      <p>Deletion is queued for 8 seconds. Undo cancels it and preserves the note and all its related data.</p>
    </A11yDialog>
  </DetailPanel.Main></DetailPanel.Body>}</Show>;
}
/** Blank task lines stay in the editor while typing but are not persisted as checklist items. */
function namedItems(split: ReturnType<typeof splitChecklist>) {
  return { content: split.content, items: split.items.filter(item => item.title !== "").map((item, sortOrder) => ({ ...item, sortOrder })) };
}
function dueInput(note: NoteRecord) {
  if (!note.dueAt) return "";
  if (note.dueAllDay) return note.dueAt.slice(0, 10);
  const date = new Date(note.dueAt);
  return `${localDate(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
const SECTION_TITLES: Record<string, string> = { schedule: "Schedule", place: "Place", attachments: "Attachments", "focus-recipe": "Focus recipe" };
function sectionIcon(id: string) {
  const Icon = { schedule: Clock, place: MapPin, attachments: FileUp, "focus-recipe": Gauge }[id] ?? Layers;
  return <Icon size={14} />;
}
function sectionTitle(id: string) { return SECTION_TITLES[id] ?? id.charAt(0).toUpperCase() + id.slice(1); }
function SectionContribution(props: { section: DetailSectionDef; noteId: string; children?: JSX.Element; onAllDayChange?: (allDay: boolean) => void }) {
  const Content: Component<{ noteId?: string; children?: JSX.Element; onAllDayChange?: (allDay: boolean) => void }> = props.section.component;
  return <Content noteId={props.noteId} onAllDayChange={props.onAllDayChange}>{props.children}</Content>;
}
