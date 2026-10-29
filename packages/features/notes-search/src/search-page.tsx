import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { NoteDetailHost, notesSavedFiltersApi, useNotesShell } from "@polterware/feature-notes-shell/feature";
import {
  ActiveFilterBar, DataTable, DatePicker, FilterChip, FilterChipGroup, FilterPopover,
  PageContent, PageEmpty, PageError, PageHeader, PageLoading, PageOffline, PageToolbar, Search as SearchIcon,
  SearchBar, StatusChip, createSavedFilters, parseDate, pushToast, type FilterClause,
} from "@polterware/frontend-design-system";
import { clausesToFilters, filtersToClauses, searchFilterFields } from "./filter-clauses";
import { matchedInLabel, type SearchFilters, type SearchHitJSON } from "./model";
import { HighlightedSnippet, hitLabel } from "./snippet";
import { searchStore, type SearchStore } from "./store";

const STATUS_CHIPS = [
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "", label: "All" },
];
export function SearchPage(props: { store?: SearchStore }) {
  const store = props.store ?? searchStore;
  const shell = useNotesShell();
  let root: HTMLDivElement | undefined;
  onMount(() => onCleanup(store.connect()));
  createEffect(() => {
    store.applyRouteQuery(shell.searchParams().get("q"));
  });
  const honesty = createMemo(() => store.honesty());
  const fields = createMemo(() => searchFilterFields(store.spaces(), store.tags()));
  const clauses = createMemo(() => filtersToClauses(store.filters()));
  const setClauses = (next: FilterClause[]) => store.setFilters(clausesToFilters(next, store.filters()));
  const savedApi = notesSavedFiltersApi("notes.search");
  const saved = createSavedFilters({
    api: () => savedApi,
    clauses,
    extra: () => ({ query: store.query(), filters: store.filters() }),
    onApply: (next, extra) => {
      const stored = extra?.filters as Partial<SearchFilters> | undefined;
      store.setFilters(stored ? { ...stored, tagIds: [...(stored.tagIds ?? [])] } : clausesToFilters(next, store.filters()));
      if (typeof extra?.query === "string") store.setQuery(extra.query);
    },
    onError: message => pushToast(`Saved filters failed: ${message}`, "danger"),
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
            <FilterPopover ariaLabel="Search filters" shortcut fields={fields()} clauses={clauses()} onClausesChange={setClauses} saved={saved()} />
          </div>
        </PageToolbar.Leading>
      </PageToolbar.Root>
      <ActiveFilterBar fields={fields()} clauses={clauses()} onClausesChange={setClauses} saved={saved()} />
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
            <PageEmpty title="Search notes">
              <Show when={store.recent().length}>
                <div class="flex flex-wrap justify-center gap-2" role="group" aria-label="Recent searches">
                  <For each={store.recent()}>{item => <FilterChip onClick={() => store.applyRecent(item)}>{item}</FilterChip>}</For>
                </div>
              </Show>
            </PageEmpty>
          </Show>
          <Show when={store.noResults()}>
            <PageEmpty title="No results" />
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
