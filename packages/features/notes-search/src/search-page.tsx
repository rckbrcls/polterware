import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { NoteDetailHost, useNotesShell } from "@polterware/feature-notes-shell/feature";
import {
  ActiveFilterBar, Button, DataTable, DatePicker, Field, FilterChip, FilterChipGroup, FilterPopover, Input,
  PageContent, PageEmpty, PageError, PageHeader, PageLoading, PageOffline, PageToolbar, Search as SearchIcon,
  SearchBar, StatusChip, parseDate,
} from "@polterware/frontend-design-system";
import { matchedInLabel, type DuePreset, type SearchFilters, type SearchHitJSON, type UpdatedPreset } from "./model";
import { HighlightedSnippet, hitLabel } from "./snippet";
import { searchStore, type SearchStore } from "./store";

const STATUS_CHIPS = [
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "", label: "All" },
];
const DUE_OPTIONS: { id: DuePreset; label: string }[] = [
  { id: "any", label: "Any due date" }, { id: "overdue", label: "Overdue" }, { id: "today", label: "Due today" },
  { id: "next7", label: "Next 7 days" }, { id: "month", label: "This month" }, { id: "custom", label: "Custom due range" },
];
const UPDATED_OPTIONS: { id: UpdatedPreset; label: string }[] = [
  { id: "any", label: "Any update" }, { id: "today", label: "Updated today" }, { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" }, { id: "custom", label: "Custom updated range" },
];

function dueLabel(filters: SearchFilters): string {
  return DUE_OPTIONS.find(option => option.id === filters.due)?.label ?? "Due";
}
function updatedLabel(filters: SearchFilters): string {
  return UPDATED_OPTIONS.find(option => option.id === filters.updated)?.label ?? "Updated";
}
function pickDue(store: SearchStore, next: DuePreset) {
  store.setFilters({ due: next, dueFrom: next === "custom" ? store.filters().dueFrom : "", dueTo: next === "custom" ? store.filters().dueTo : "" });
}
function pickUpdated(store: SearchStore, next: UpdatedPreset) {
  store.setFilters({ updated: next, updatedFrom: next === "custom" ? store.filters().updatedFrom : "", updatedTo: next === "custom" ? store.filters().updatedTo : "" });
}

export function SearchPage(props: { store?: SearchStore }) {
  const store = props.store ?? searchStore;
  const shell = useNotesShell();
  const [name, setName] = createSignal("");
  let root: HTMLDivElement | undefined;
  onMount(() => onCleanup(store.connect()));
  createEffect(() => {
    store.applyRouteQuery(shell.searchParams().get("q"));
  });
  const honesty = createMemo(() => store.honesty());
  const activeFilters = createMemo(() => {
    const filters = store.filters();
    const items: { id: string; label: string; onRemove: () => void }[] = [];
    if (filters.spaceId) {
      const space = store.spaces().find(item => item.id === filters.spaceId);
      items.push({ id: "space", label: space?.name ? `Space: ${space.name}` : "Space", onRemove: () => store.setFilters({ spaceId: "" }) });
    }
    for (const id of filters.tagIds) {
      const tag = store.tags().find(item => item.id === id);
      items.push({ id: `tag-${id}`, label: tag?.name ? `Tag: ${tag.name}` : "Tag", onRemove: () => store.setFilters({ tagIds: filters.tagIds.filter(value => value !== id) }) });
    }
    if (filters.due !== "any") items.push({ id: "due", label: dueLabel(filters), onRemove: () => store.setFilters({ due: "any", dueFrom: "", dueTo: "" }) });
    if (filters.updated !== "any") items.push({ id: "updated", label: updatedLabel(filters), onRemove: () => store.setFilters({ updated: "any", updatedFrom: "", updatedTo: "" }) });
    return items;
  });
  function open(id: string | null) { if (id) shell.openNote(id); }
  function onKeyDown(event: KeyboardEvent) {
    if (event.isComposing) return;
    const editing = event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]");
    const rows = store.visibleHits();
    if (event.key === "Escape") {
      event.preventDefault();
      if (store.activeId()) { store.setActiveId(null); return; }
      store.setQuery("");
      return;
    }
    if (editing) return;
    if (event.key === "/") {
      event.preventDefault();
      root?.querySelector<HTMLInputElement>('[role="searchbox"]')?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!rows.length) return;
      const index = Math.max(0, rows.findIndex(hit => hit.noteId === store.activeId()));
      const next = event.key === "ArrowDown" ? Math.min(rows.length - 1, index + 1) : Math.max(0, index <= 0 ? 0 : index - 1);
      store.setActiveId(rows[next]?.noteId ?? null);
    } else if (event.key === "Enter") {
      event.preventDefault();
      open(store.activeId() ?? rows[0]?.noteId ?? null);
    }
  }
  return (
    <NoteDetailHost><div ref={root} data-search-page class="flex h-full min-h-0 flex-col" onKeyDown={onKeyDown}>
      <PageHeader
        title="Search"
        subtitle={<StatusChip tone={honesty().tone} label={honesty().label} />}
      />
      <PageToolbar.Root>
        <PageToolbar.Leading>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <SearchBar aria-label="Search notes" placeholder="Search notes" value={store.query()} onInput={value => store.setQuery(value)} />
            <FilterChipGroup aria-label="Status" value={store.filters().status} items={STATUS_CHIPS} onChange={status => store.setFilters({ status })} />
            <FilterPopover
              ariaLabel="Filter by Space" triggerLabel="Space" active={Boolean(store.filters().spaceId)} onClear={() => store.setFilters({ spaceId: "", includeDescendants: true })}
              groups={[
                { id: "descendants", label: "Include child Spaces", inline: true, options: [{ id: "descendants", label: "Include child Spaces", checked: store.filters().includeDescendants, onCheckedChange: checked => store.setFilters({ includeDescendants: checked }) }] },
                { id: "spaces", label: "Spaces", selectionMode: "single", options: store.spaces().map(space => ({ id: space.id ?? "", label: space.name ?? "Unnamed Space", checked: store.filters().spaceId === space.id, onCheckedChange: checked => store.setFilters({ spaceId: checked ? space.id ?? "" : "" }) })) },
              ]}
            />
            <FilterPopover
              ariaLabel="Filter by tag" triggerLabel="Tags" active={store.filters().tagIds.length > 0} onClear={() => store.setFilters({ tagIds: [] })}
              groups={[{ id: "tags", label: "Tags", selectionMode: "multiple", options: store.tags().map(tag => ({ id: tag.id ?? "", label: tag.name ?? "Unnamed tag", checked: store.filters().tagIds.includes(tag.id ?? ""), onCheckedChange: checked => store.setFilters({ tagIds: checked ? [...store.filters().tagIds, tag.id ?? ""] : store.filters().tagIds.filter(id => id !== tag.id) }) })) }]}
            />
            <FilterPopover
              ariaLabel="Filter by due date" triggerLabel="Due" active={store.filters().due !== "any"} onClear={() => store.setFilters({ due: "any", dueFrom: "", dueTo: "" })}
              groups={[{ id: "due", label: "Due", selectionMode: "single", options: DUE_OPTIONS.map(option => ({
                id: option.id, label: option.label, checked: store.filters().due === option.id,
                onCheckedChange: checked => { if (checked) pickDue(store, option.id); },
              })) }]}
            />
            <FilterPopover
              ariaLabel="Filter by updated date" triggerLabel="Updated" active={store.filters().updated !== "any"} onClear={() => store.setFilters({ updated: "any", updatedFrom: "", updatedTo: "" })}
              groups={[{ id: "updated", label: "Updated", selectionMode: "single", options: UPDATED_OPTIONS.map(option => ({
                id: option.id, label: option.label, checked: store.filters().updated === option.id,
                onCheckedChange: checked => { if (checked) pickUpdated(store, option.id); },
              })) }]}
            />
          </div>
        </PageToolbar.Leading>
        <PageToolbar.Actions>
          <Field label="Save filters" for="notes-search-save">
            <Input id="notes-search-save" size="sm" placeholder="Name" value={name()} onInput={event => setName(event.currentTarget.value)} />
          </Field>
          <Button variant="secondary" size="sm" onClick={() => { store.saveFilters(name()); setName(""); }}>Save filters</Button>
        </PageToolbar.Actions>
      </PageToolbar.Root>
      <ActiveFilterBar items={activeFilters()} onClear={store.filtersOn() ? () => store.clearFilters() : undefined} />
      <Show when={store.filters().due === "custom" || store.filters().updated === "custom"}>
        <div class="flex flex-wrap items-end gap-3 px-4 py-2">
          <Show when={store.filters().due === "custom"}>
            <DatePicker label="Due from" value={store.filters().dueFrom ? [parseDate(store.filters().dueFrom)] : []} onValueChange={details => store.setFilters({ dueFrom: details.value[0]?.toString() ?? "" })} />
            <DatePicker label="Due to" value={store.filters().dueTo ? [parseDate(store.filters().dueTo)] : []} onValueChange={details => store.setFilters({ dueTo: details.value[0]?.toString() ?? "" })} />
          </Show>
          <Show when={store.filters().updated === "custom"}>
            <DatePicker label="Updated from" value={store.filters().updatedFrom ? [parseDate(store.filters().updatedFrom)] : []} onValueChange={details => store.setFilters({ updatedFrom: details.value[0]?.toString() ?? "" })} />
            <DatePicker label="Updated to" value={store.filters().updatedTo ? [parseDate(store.filters().updatedTo)] : []} onValueChange={details => store.setFilters({ updatedTo: details.value[0]?.toString() ?? "" })} />
          </Show>
        </div>
      </Show>
      <PageContent>
        <p class="px-4 pt-3 text-[13px] text-[var(--color-text-muted)]" role="status">{honesty().detail}</p>
        <Show when={store.saved().length}>
          <div class="flex flex-wrap items-center gap-2 px-4 pt-3" role="group" aria-label="Saved filters">
            <For each={store.saved()}>{item => (
              <FilterChip selected={false} aria-label={`Apply saved filter ${item.name}`} onClick={() => store.applySaved(item.id)}>
                {item.name}
              </FilterChip>
            )}</For>
          </div>
        </Show>
        <Show when={store.loadState() === "unavailable"}>
          <PageOffline title="Search unavailable" message={store.loadError() || "The local core is unreachable."} onRetry={() => void store.reload()} />
        </Show>
        <Show when={store.loadState() === "failed"}>
          <PageError title="Search failed" message={store.loadError()} onRetry={() => void store.reload()} />
        </Show>
        <Show when={store.searchState() === "failed" || store.searchState() === "unavailable"}>
          <PageError title={store.searchState() === "unavailable" ? "Search unavailable" : "Search failed"} message={store.searchError()} onRetry={() => void store.reload()} />
        </Show>
        <Show when={store.searchState() === "queued"}><PageLoading label="Searching notes" /></Show>
        <Show when={store.loadState() !== "unavailable" && store.loadState() !== "failed" && store.searchState() !== "failed" && store.searchState() !== "unavailable"}>
          <Show when={store.emptyQuery()}>
            <PageEmpty title="Search notes" description="Search words in titles, content, checklists, tags, and Spaces.">
              <Show when={store.recent().length}>
                <div class="flex flex-wrap justify-center gap-2" role="group" aria-label="Recent searches">
                  <For each={store.recent()}>{item => <FilterChip onClick={() => store.applyRecent(item)}>{item}</FilterChip>}</For>
                </div>
              </Show>
            </PageEmpty>
          </Show>
          <Show when={store.noResults()}>
            <PageEmpty title="No results" description="Try another query or clear your filters." />
          </Show>
          <Show when={store.visibleHits().length}>
            <DataTable.Root rows={store.visibleHits()} getRowId={row => row.noteId ?? ""} activeRowId={store.activeId() ?? undefined} onActiveRowChange={id => store.setActiveId(id)} estimateRowHeight={56} columnWidthsKey="search">
              <DataTable.Table aria-label="Search results">
                <DataTable.Header>
                  <DataTable.ColumnHeader id="title" sortable={false}>Note</DataTable.ColumnHeader>
                  <DataTable.ColumnHeader id="snippet" sortable={false}>Snippet</DataTable.ColumnHeader>
                  <DataTable.ColumnHeader id="matched" sortable={false}>Matched in</DataTable.ColumnHeader>
                </DataTable.Header>
                <DataTable.Body>{(row: SearchHitJSON) => (
                  <DataTable.Row row={row} rowId={row.noteId ?? ""} aria-label={hitLabel(row)} onActivate={() => open(row.noteId ?? null)}>
                    <DataTable.PrimaryCell leading={<SearchIcon size={16} />} title={row.title || "Untitled note"} />
                    <DataTable.Cell wrap><HighlightedSnippet snippet={row.snippet} class="text-[13px] text-[var(--color-text-secondary)]" /></DataTable.Cell>
                    <DataTable.Cell>{matchedInLabel(row.matchedIn)}</DataTable.Cell>
                  </DataTable.Row>
                )}</DataTable.Body>
              </DataTable.Table>
            </DataTable.Root>
          </Show>
        </Show>
      </PageContent>
    </div></NoteDetailHost>
  );
}
