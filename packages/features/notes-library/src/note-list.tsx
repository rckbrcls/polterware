import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { A11yDialog, ActiveFilterBar, AuroraCover, auroraForId, Button, CalendarClock, Card, Check, Checkbox, ContextMenu, Delete, ExternalLink, Inbox, Pin, PinOff, CollapsibleSection, FileText, Folder, FilterPopover, ListChecks, MoreHorizontal, Plus, PageEmpty, PageError, PageLoading, PageOffline, PageToolbar, SearchBar, Select, TemplateCardGrid, type ActiveFilterPill, type FilterPopoverGroup, type TemplateCardGridItem } from "@polterware/frontend-design-system";
import { NoteDetailHost } from "@polterware/feature-notes-shell/feature";
import { browserBridge } from "./bridge";
import { createCardReorder, type FolderItem } from "./card-reorder";
import { errorText, filterRows, todayGroup, DEFAULT_FILTER, type NoteRow } from "./model";
import { spaceMark } from "./space-mark";
import { tryNotesShell } from "./shell-access";
import { notesStore, type NotesStore } from "./store";

const newCardClass = "!h-[224px] !w-full !flex-col !gap-3 !rounded-[var(--radius-card)] !border-dashed !border-[var(--color-border-strong)]";
import { UndoNotice } from "./undo-notice";

export type NoteCollectionProps = { spaceId?: string; mode?: "today" | "inbox" | "space" | "spaces"; store?: NotesStore; onOpen?: (id: string) => void; virtualized?: boolean; leading?: JSX.Element; trailing?: JSX.Element; onCreateSpace?: () => void; folderItems?: FolderItem[]; onReorderFolders?: (updates: { id: string; sortOrder: number }[]) => Promise<void> | void; canDropInto?: (held: HeldItem, spaceId: string) => boolean; onDropInto?: (held: HeldItem, spaceId: string) => Promise<void> | void };
export type HeldItem = { kind: "space" | "note"; id: string };
/** Nothing is filtered out until the user narrows by status. */
const DEFAULT_STATUS = "";
export function NoteCollection(props: NoteCollectionProps) {
  const store = props.store ?? notesStore;
  const shell = tryNotesShell();
  const [query, setQuery] = createSignal("");
  const [status, setStatus] = createSignal(DEFAULT_STATUS);
  const [pinned, setPinned] = createSignal(false);
  const [tagId, setTagId] = createSignal("");
  const [selection, setSelection] = createSignal<ReadonlySet<string>>(new Set<string>());
  const [activeId, setActiveId] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [actionError, setActionError] = createSignal("");
  const [deleteIds, setDeleteIds] = createSignal<string[]>([]);
  const [bulkSpace, setBulkSpace] = createSignal("");
  const [menu, setMenu] = createSignal<{ row: NoteRow; x: number; y: number } | null>(null);
  const [now, setNow] = createSignal(new Date());
  let root: HTMLDivElement | undefined;
  const mode = () => props.mode ?? (props.spaceId ? "space" : "inbox");
  onMount(() => {
    root?.addEventListener("keydown", keyboard, true);
    const disconnect = store.connect();
    const timer = setInterval(() => setNow(new Date()), 60000);
    const unregKeys = shell?.registerCollectionShortcuts(action => {
      const id = activeId();
      if (!id) return;
      if (action === "open") open(id);
      else if (action === "toggle-done") void store.toggle(id, "status");
      else if (action === "edit-title") { open(id); setTimeout(() => document.querySelector<HTMLInputElement>("[data-note-title]")?.focus(), 50); }
      else if (action === "pin") void store.toggle(id, "pinned");
      else if (action === "delete") setDeleteIds([id]);
    });
    onCleanup(() => { disconnect(); clearInterval(timer); unregKeys?.(); root?.removeEventListener("keydown", keyboard, true); });
  });
  const groups = createMemo(() => {
    const dates = new Map<string, "Overdue" | "Today" | "Upcoming 7 days">();
    for (const occurrence of store.occurrences()) {
      if (occurrence.completed || !occurrence.noteId) continue;
      const group = todayGroup({ dueAt: occurrence.occurrenceAt, dueAllDay: occurrence.allDay ?? false }, now());
      if (group && (!dates.has(occurrence.noteId) || group === "Today")) dates.set(occurrence.noteId, group);
    }
    return dates;
  });
  const filtered = createMemo(() => filterRows(store.rows(), { ...DEFAULT_FILTER, query: query(), status: status(), pinned: pinned(), tagId: tagId(), order: DEFAULT_FILTER.order,
    inbox: mode() === "inbox", spaceId: mode() === "space" ? props.spaceId : undefined }));
  const displayRows = createMemo(() => {
    if (mode() === "spaces") return [];
    if (mode() !== "today") return filtered();
    const rank = { Overdue: 0, Today: 1, "Upcoming 7 days": 2 };
    return filtered().filter(row => todayGroup(row, now()) || groups().has(row.id))
      .sort((a, b) => rank[todayGroup(a, now()) ?? groups().get(a.id)!] - rank[todayGroup(b, now()) ?? groups().get(b.id)!]);
  });
  const reorderable = () => mode() === "space" || mode() === "spaces";
  const parseKey = (key: string): HeldItem => ({ kind: key.startsWith("space:") ? "space" : "note", id: key.slice(key.indexOf(":") + 1) });
  const items = createMemo(() => {
    const folders = (props.folderItems ?? []).map(folder => ({ key: `space:${folder.id}`, kind: "space" as const, sortOrder: folder.sortOrder, folder, row: undefined as NoteRow | undefined }));
    const notes = displayRows().map(row => ({ key: `note:${row.id}`, kind: "note" as const, sortOrder: row.sortOrder, folder: undefined as FolderItem | undefined, row }));
    // Never-ordered notes (all 0) keep the old layout: Spaces first, then notes.
    if (!reorderable() || notes.every(item => item.sortOrder === 0)) return [...folders, ...notes];
    return [...folders, ...notes].sort((a, b) => a.sortOrder - b.sortOrder || (a.kind === b.kind ? 0 : a.kind === "space" ? -1 : 1));
  });
  const reorder = createCardReorder({
    order: () => items().map(item => item.key),
    commit: async keys => {
      const folders: { id: string; sortOrder: number }[] = [];
      const changed: string[] = [];
      keys.forEach((key, index) => {
        const held = parseKey(key);
        if (held.kind === "note") {
          if (store.rows().find(row => row.id === held.id)?.sortOrder !== index) {
            store.edit(held.id, { sortOrder: index });
            changed.push(held.id);
          }
        } else folders.push({ id: held.id, sortOrder: index });
      });
      // Hold the arranged order until every save has landed, so the grid never snaps back and forth.
      await Promise.all([...changed.map(id => store.flush(id)), props.onReorderFolders?.(folders)]);
    },
    canDropInto: (held, target) => target.startsWith("space:") && held !== target && (props.canDropInto?.(parseKey(held), parseKey(target).id) ?? true),
    dropInto: (held, target) => props.onDropInto?.(parseKey(held), parseKey(target).id),
  });
  const noteCounts = createMemo(() => {
    const counts = new Map<string, number>();
    for (const row of store.rows()) if (row.spaceId) counts.set(row.spaceId, (counts.get(row.spaceId) ?? 0) + 1);
    return counts;
  });
  const itemByKey = createMemo(() => new Map(items().map(item => [item.key, item])));
  /**
   * DOM order never changes for a card that is already there: moving a node closes its popover, which
   * would drop the held card out of the top layer. Visual order comes from CSS `order` instead.
   */
  const domKeys = createMemo((previous: string[]) => {
    const keys = items().map(item => item.key);
    const kept = previous.filter(key => keys.includes(key));
    return [...kept, ...keys.filter(key => !kept.includes(key))];
  }, []);
  const position = (key: string) => { const index = reorder.order().indexOf(key); return index < 0 ? 0 : index; };
  const group = (row: NoteRow) => mode() === "today" ? todayGroup(row, now()) ?? groups().get(row.id) : row.pinned ? "Pinned" : "Notes";
  createEffect(() => {
    const ids = new Set(displayRows().map(row => row.id));
    setSelection(previous => new Set([...previous].filter(id => ids.has(id))));
  });
  const open = (id: string) => {
    setActiveId(id);
    if (props.onOpen) props.onOpen(id);
    else if (shell) shell.openNote(id);
    else void browserBridge().app.openDeepLink(`pwnotes://note/${encodeURIComponent(id)}`).catch((error: unknown) => setActionError(errorText(error)));
  };
  async function createFrom(input: { title: string; content?: string; checklist?: { id: string; title: string; detail: string; done: boolean; sortOrder: number }[]; dueAt?: string; dueAllDay?: boolean }) {
    if (busy()) return;
    setBusy(true); setActionError("");
    try {
      const note = await store.create({ title: input.title, content: input.content ?? "", spaceId: props.spaceId ?? "", checklist: input.checklist, dueAt: input.dueAt, dueAllDay: input.dueAllDay ?? false });
      open(note.id);
    } catch (error) { setActionError(errorText(error)); }
    finally { setBusy(false); }
  }
  function newNote() {
    if (shell?.newNote) void shell.newNote({ spaceId: props.spaceId });
    else void createFrom({ title: "Untitled" });
  }
  const narrowed = () => Boolean(query() || pinned() || tagId() || status() !== DEFAULT_STATUS);
  const templateItems = (): TemplateCardGridItem[] => [
    { id: "note", title: "Note", description: "A short note you can fill in.", tone: "knowledge", icon: <FileText size={16} />, onSelect: () => void createFrom({ title: "Note" }) },
    { id: "checklist", title: "Checklist", description: "A few steps to check off.", tone: "execution", icon: <ListChecks size={16} />, onSelect: () => void createFrom({ title: "Checklist", checklist: [
      { id: "check-1", title: "First step", detail: "", done: false, sortOrder: 0 },
      { id: "check-2", title: "Second step", detail: "", done: false, sortOrder: 1 },
      { id: "check-3", title: "Third step", detail: "", done: false, sortOrder: 2 },
    ] }) },
    { id: "reminder", title: "Reminder", description: "Something due today.", tone: "observability", icon: <CalendarClock size={16} />, onSelect: () => void createFrom({ title: "Reminder", dueAt: new Date().toISOString(), dueAllDay: true }) },
  ];
  async function bulk(action: "complete" | "pin" | "move") {
    setBusy(true); setActionError("");
    try {
      const selectedIds = [...selection()];
      // Serialized per entity and expectedRev checked: partial failures remain visible individually.
      for (const id of selectedIds) {
        if (action === "move") { store.edit(id, bulkSpace() ? { spaceId: bulkSpace(), clearSpaceId: false } : { clearSpaceId: true }); await store.flush(id); }
        else await store.toggle(id, action === "complete" ? "status" : "pinned", true);
      }
      if (selectedIds.some(id => ["failed", "conflict"].includes(store.state(id)))) throw new Error("Some actions failed. Open the affected note to resolve its retained edits.");
      setSelection(new Set<string>());
    } catch (error) { setActionError(errorText(error)); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setActionError("");
    try { for (const id of deleteIds()) await store.queueDelete(id); setDeleteIds([]); setSelection(new Set<string>()); }
    catch (error) { setActionError(errorText(error)); }
    finally { setBusy(false); }
  }
  const keyboard = (event: KeyboardEvent) => {
    const element = event.target;
    if (!(element instanceof HTMLElement)) return;
    const editing = element.closest("input, textarea, [contenteditable=true], [role=dialog], [role=menu]");
    if (editing) return;
    const id = element.closest<HTMLElement>("[data-row-id]")?.dataset.rowId ?? activeId();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); event.stopPropagation(); newNote(); }
    else if (event.key === "/") { event.preventDefault(); event.stopPropagation(); root?.querySelector<HTMLInputElement>('[role="searchbox"]')?.focus(); }
    else if (id && (event.metaKey || event.ctrlKey) && event.key === "Backspace") { event.preventDefault(); event.stopPropagation(); setDeleteIds([id]); }
    else if (id && event.key.toLowerCase() === "p" && !event.metaKey && !event.ctrlKey) { event.preventDefault(); event.stopPropagation(); void store.toggle(id, "pinned"); }
    else if (id && event.key === " " && element.matches("[data-row-id]")) { event.preventDefault(); event.stopPropagation(); void store.toggle(id, "status"); }
    else if (id && event.key.toLowerCase() === "e" && !event.metaKey && !event.ctrlKey) { event.preventDefault(); event.stopPropagation(); open(id); queueMicrotask(() => document.querySelector<HTMLInputElement>("[data-note-title]")?.focus()); }
  };
  const resetFilters = () => { setStatus(DEFAULT_STATUS); setPinned(DEFAULT_FILTER.pinned); setTagId(DEFAULT_FILTER.tagId); };
  const filtersActive = () => status() !== DEFAULT_STATUS || pinned() || Boolean(tagId());
  const filterGroups = createMemo((): FilterPopoverGroup[] => [
    { id: "pinned", label: "Pinned", inline: true, options: [{ id: "pinned", label: "Pinned", checked: pinned(), onCheckedChange: setPinned }] },
    { id: "status", label: "Status", selectionMode: "single", options: [
      { id: "active", label: "Active", checked: status() === "active", onCheckedChange: checked => setStatus(checked ? "active" : DEFAULT_STATUS) },
      { id: "completed", label: "Completed", checked: status() === "completed", onCheckedChange: checked => setStatus(checked ? "completed" : DEFAULT_STATUS) },
    ] },
    { id: "tags", label: "Tags", selectionMode: "single", options: store.tags().map(tag => ({ id: tag.id ?? "", label: tag.name ?? "Unnamed tag", checked: tagId() === tag.id, onCheckedChange: checked => setTagId(checked ? tag.id ?? "" : "") })) },
  ]);
  const activeFilters = createMemo((): ActiveFilterPill[] => {
    const pills: ActiveFilterPill[] = [];
    if (status() === "active") pills.push({ id: "status", label: "Active", onRemove: () => setStatus(DEFAULT_STATUS) });
    if (status() === "completed") pills.push({ id: "status", label: "Completed", onRemove: () => setStatus(DEFAULT_STATUS) });
    if (pinned()) pills.push({ id: "pinned", label: "Pinned", onRemove: () => setPinned(false) });
    if (tagId()) pills.push({ id: "tag", label: store.tags().find(tag => tag.id === tagId())?.name ?? "Tag", onRemove: () => setTagId("") });
    return pills;
  });
  const cards = (keys: () => string[]) => (
            <For each={keys()}>{key => { const item = () => itemByKey().get(key); return <Show when={item()}><li
              ref={element => {
                if (!reorderable()) return;
                // Capture, so a click that ends a drag never reaches the card's own handler.
                const swallow = (event: MouseEvent) => { if (reorder.consumeClick()) { event.stopPropagation(); event.preventDefault(); } };
                element.addEventListener("click", swallow, true);
                const unregister = reorder.register(key, element);
                onCleanup(() => { element.removeEventListener("click", swallow, true); unregister(); });
              }}
              class="touch-none self-start"
              style={{ order: position(key) }}
              data-dragging={reorder.draggingId() === key ? "true" : "false"}
              data-lifted={reorder.liftedId() === key ? "true" : "false"}
              onPointerDown={event => { if (reorderable()) reorder.onPointerDown(key, event); }}>
              <Show when={item()?.folder} fallback={<Show when={item()?.row} keyed>{row => <Card class="group relative flex h-[224px] cursor-pointer overflow-hidden flex-col !p-0 transition-colors hover:bg-[var(--color-surface-hover)]">
                <AuroraCover palette={auroraForId(row.id)} seed={row.id} class="!h-2" />
                <div role="button" tabindex="0" data-row-id={row.id} draggable={!reorderable()} onDragStart={event => { event.dataTransfer?.setData("application/x-notes-item", JSON.stringify({ kind: "note", id: row.id })); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; }} aria-label={row.title} class="flex min-h-0 flex-1 flex-col gap-3 p-4 outline-none" onFocus={() => setActiveId(row.id)}
                  onClick={() => open(row.id)}
                  onKeyDown={event => { if (event.key === "Enter" && event.target === event.currentTarget) open(row.id); }}
                  onContextMenu={event => { event.preventDefault(); setMenu({ row, x: event.clientX, y: event.clientY }); }}>
                  <div class="flex shrink-0 items-center gap-2">
                    <span class="line-clamp-1 min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug text-[var(--color-text-primary)]">{row.title}</span>
                    {/* Selection and actions sit as one pair, centered on the title. */}
                    <div class="-my-1 -mr-1 flex shrink-0 items-center gap-1">
                      <span data-no-drag="" class="flex shrink-0" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                        <Checkbox shape="round" aria-label={`Select ${row.title}`} checked={selection().has(row.id)}
                          onCheckedChange={details => { const next = new Set(selection()); if (details.checked === true) next.add(row.id); else next.delete(row.id); setSelection(next); }} />
                      </span>
                      <Button variant="ghost" size="icon" data-no-drag="" aria-label={`Actions for ${row.title}`} aria-haspopup="menu" class="!h-7 !min-h-0 !w-7 !min-w-0 !shrink-0" onClick={event => {
                        event.stopPropagation();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setMenu({ row, x: bounds.right, y: bounds.bottom });
                      }} onKeyDown={event => event.stopPropagation()}><MoreHorizontal size={16} aria-hidden="true" /></Button>
                    </div>
                  </div>
                  <Show when={row.content}><p class="m-0 line-clamp-4 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">{markdownPreview(row.content)}</p></Show>
                  <div class="mt-auto flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--color-text-muted)]">
                    <span>{relativeTime(row.updatedAt ?? row.createdAt, now())}</span>
                    <Show when={mode() === "today" && group(row)}><span class="text-[var(--color-text-secondary)]">{group(row)}</span></Show>
                    <Show when={row.dueAt}><span class="inline-flex items-center gap-1"><CalendarClock size={12} aria-hidden="true" />{new Date(row.dueAt!).toLocaleDateString()}</span></Show>
                    <Show when={row.pinned}><span class="ml-auto inline-flex items-center"><Pin size={12} aria-label="Pinned" /></span></Show>
                  </div>
                </div>
              </Card>}</Show>}>
                {folder => folder().render({ get dropTarget() { return reorder.intoId() === key; }, get noteCount() { return noteCounts().get(folder().id) ?? 0; } })}
              </Show>
            </li></Show>}}</For>
  );
  const spaceKeys = () => domKeys().filter(key => key.startsWith("space:"));
  const noteKeys = () => domKeys().filter(key => !key.startsWith("space:"));
  return <div ref={element => { root = element; }} class="flex h-full min-h-0 flex-col gap-3">
    <PageToolbar.Root>
      <PageToolbar.Leading>
        {props.leading}
      </PageToolbar.Leading>
      <PageToolbar.Actions>
        <Show when={mode() !== "spaces"}>
          <SearchBar aria-label="Filter notes" placeholder="Filter notes" value={query()} onInput={setQuery} />
          <FilterPopover ariaLabel="Filters" active={filtersActive()} onClear={resetFilters} groups={filterGroups()} />
        </Show>
        {props.trailing}
      </PageToolbar.Actions>
    </PageToolbar.Root>
    <ActiveFilterBar items={activeFilters()} onClear={resetFilters} />
    <Show when={actionError()}><PageError title="Action failed" message={actionError()} /></Show>
    <For each={Object.entries(store.errors()).filter(([, value]) => Boolean(value))}>{([id, message]) => <div role="alert" class="flex items-center gap-2"><p>Note action failed: {message}</p><Button variant="secondary" onClick={() => open(id)}>Open note</Button></div>}</For>
    <Show when={mode() === "today" && store.scheduleError()}><p role="status">Scheduled notes unavailable: {store.scheduleError()}. Due notes are shown.</p></Show>
    <Show when={store.loadError()}><PageOffline title="Notes unavailable" message={store.loadError()} onRetry={() => void store.refresh()} /></Show>
    <Show when={store.loading() && !store.rows().length}><PageLoading label="Loading notes" /></Show>
    <Show when={!store.loadError() && (!store.loading() || store.rows().length)}>
      <Show when={mode() === "space" || displayRows().length || (props.folderItems?.length ?? 0) > 0} fallback={narrowed()
        ? <PageEmpty title="No matching notes" description="Create a note or change your filters." />
        : <div class="flex h-full min-h-[200px] w-full items-center justify-center p-8"><TemplateCardGrid label="Start from a template" items={templateItems()} /></div>}>
        <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-6 pt-6">
          <Show when={selection().size > 0}>
            <div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Selected notes">
              <span class="text-[13px] text-[var(--color-text-secondary)]">{selection().size} selected</span>
              <Button variant="secondary" disabled={busy()} onClick={() => void bulk("complete")}>Complete</Button>
              <Button variant="secondary" disabled={busy()} onClick={() => void bulk("pin")}>Pin</Button>
              <div class="w-40"><Select aria-label="Move selected notes to Space" value={bulkSpace()} onChange={setBulkSpace} options={[{ value: "", label: "Inbox", icon: <Inbox size={14} aria-hidden="true" /> }, ...store.spaces().map(space => ({ value: space.id ?? "", label: space.name ?? "Unnamed Space", icon: spaceMark(space.color, space.icon, space.id) }))]} /></div>
              <Button variant="secondary" disabled={busy()} onClick={() => void bulk("move")}>Move</Button>
              <Button variant="danger" disabled={busy()} onClick={() => setDeleteIds([...selection()])}>Delete</Button>
            </div>
          </Show>
          <Show when={mode() === "space"} fallback={<ul class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3 p-0" aria-label="Notes">
            {cards(domKeys)}
          </ul>}>
            <CollapsibleSection title="Spaces" icon={<Folder size={14} aria-hidden="true" />}>
              <ul class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3 p-0" aria-label="Spaces">
                {cards(spaceKeys)}
                <Show when={props.onCreateSpace}>
                  <li style={{ order: 100000 }}>
                    <Button variant="ghost" class={newCardClass} onClick={() => props.onCreateSpace?.()}>
                      <Plus size={24} aria-hidden="true" /><span>New Space</span>
                    </Button>
                  </li>
                </Show>
              </ul>
            </CollapsibleSection>
            <CollapsibleSection title="Notes" icon={<FileText size={14} aria-hidden="true" />}>
              <ul class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3 p-0" aria-label="Notes">
                {cards(noteKeys)}
                <li style={{ order: 100000 }}>
                  <Button variant="ghost" class={newCardClass} disabled={busy()} onClick={newNote}>
                    <Plus size={24} aria-hidden="true" /><span>New note</span>
                  </Button>
                </li>
              </ul>
            </CollapsibleSection>
          </Show>
        </div>
      </Show>
    </Show>
    <ContextMenu.Root open={menu() !== null} onOpenChange={open => { if (!open) setMenu(null); }} anchorPoint={menu() ? { x: menu()!.x, y: menu()!.y } : null}>
      <ContextMenu.Content>
        <ContextMenu.Item value="open" onSelect={() => { const row = menu()?.row; if (row) open(row.id); }}><ExternalLink size={14} aria-hidden="true" />Open</ContextMenu.Item>
        <ContextMenu.Item value="complete" onSelect={() => { const row = menu()?.row; if (row) void store.toggle(row.id, "status"); }}><Check size={14} aria-hidden="true" />{menu()?.row.status === "completed" ? "Mark as active" : "Complete"}</ContextMenu.Item>
        <ContextMenu.Item value="pin" onSelect={() => { const row = menu()?.row; if (row) void store.toggle(row.id, "pinned"); }}>{menu()?.row.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}{menu()?.row.pinned ? "Unpin" : "Pin"}</ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item value="delete" danger onSelect={() => { const row = menu()?.row; if (row) setDeleteIds([row.id]); }}><Delete size={14} aria-hidden="true" />Delete</ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
    <UndoNotice store={store} />
    <A11yDialog open={deleteIds().length > 0} title="Delete selected notes?" size="sm" onClose={() => setDeleteIds([])} footer={<><Button variant="secondary" onClick={() => setDeleteIds([])}>Cancel</Button><Button variant="danger" disabled={busy()} onClick={() => void remove()}>Delete</Button></>}>
      <p>Queue deletion of {deleteIds().length} notes. Undo is available for 8 seconds before the note and its related data are deleted.</p>
      <Show when={actionError()}><p role="alert">{actionError()}</p></Show>
    </A11yDialog>
  </div>;
}
function markdownPreview(markdown: string) {
  return markdown.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s*)?|\d+\.\s+)/gm, "")
    .replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
}
function relativeTime(timestamp: string | undefined, now: Date) {
  const time = timestamp ? new Date(timestamp).getTime() : NaN;
  if (!Number.isFinite(time)) return "Time unavailable";
  const seconds = Math.round((time - now.getTime()) / 1000);
  if (Math.abs(seconds) < 60) return "Just now";
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.trunc(seconds / size), unit);
  }
  return "Just now";
}
export function TodayPage() { return <NoteDetailHost><NoteCollection mode="today" /></NoteDetailHost>; }
export function InboxPage() { return <NoteDetailHost><NoteCollection mode="inbox" /></NoteDetailHost>; }
export function SpaceNotesPage(props: { spaceId: string; mode?: "spaces"; leading?: JSX.Element; trailing?: JSX.Element; onCreateSpace?: () => void; folderItems?: FolderItem[]; onReorderFolders?: NoteCollectionProps["onReorderFolders"]; canDropInto?: NoteCollectionProps["canDropInto"]; onDropInto?: NoteCollectionProps["onDropInto"] }) { return <NoteCollection mode={props.mode ?? "space"} spaceId={props.spaceId || undefined} leading={props.leading} trailing={props.trailing} onCreateSpace={props.onCreateSpace} folderItems={props.folderItems} onReorderFolders={props.onReorderFolders} canDropInto={props.canDropInto} onDropInto={props.onDropInto} />; }
