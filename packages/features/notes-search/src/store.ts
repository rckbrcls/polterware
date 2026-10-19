import { batch, createSignal } from "solid-js";
import { browserBridge } from "./bridge";
import {
  DEBOUNCE_MS, EMPTY_FILTERS, RECENT_KEY, SAVED_KEY, RESULT_WINDOW, buildSearchRequest, errorText, filtersActive,
  honestyLabel, indexHonesty, isUnavailable, readJson, rememberRecent, routeSearchQuery, windowHits, writeJson,
  type Honesty, type SavedFilter, type SearchBridge, type SearchFilters, type SearchHitJSON, type SpaceJSON, type TagJSON,
} from "./model";

export function createSearchStore(
  getBridge: () => SearchBridge = browserBridge,
  options: { debounceMs?: number; now?: () => Date; storage?: Pick<Storage, "getItem" | "setItem"> } = {},
) {
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;
  const storage = options.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const now = () => options.now?.() ?? new Date();
  const [query, setQueryValue] = createSignal("");
  const [filters, setFiltersValue] = createSignal<SearchFilters>({ ...EMPTY_FILTERS });
  const [hits, setHits] = createSignal<SearchHitJSON[]>([]);
  const [visibleHits, setVisibleHits] = createSignal<SearchHitJSON[]>([]);
  const [notice, setNotice] = createSignal("");
  const [ftsDocuments, setFtsDocuments] = createSignal<number | undefined>(undefined);
  const [spaces, setSpaces] = createSignal<SpaceJSON[]>([]);
  const [tags, setTags] = createSignal<TagJSON[]>([]);
  const [recent, setRecent] = createSignal<string[]>([]);
  const [saved, setSaved] = createSignal<SavedFilter[]>([]);
  const [loadState, setLoadState] = createSignal<Honesty>("queued");
  const [searchState, setSearchState] = createSignal<Honesty>("live");
  const [loadError, setLoadError] = createSignal("");
  const [searchError, setSearchError] = createSignal("");
  const [searched, setSearched] = createSignal(false);
  const [activeId, setActiveId] = createSignal<string | null>(null);
  let commandGeneration = 0;
  let generation = 0, timer: ReturnType<typeof setTimeout> | undefined, unsubscribe: (() => void) | undefined, users = 0;

  function persistRecent(items: string[]) { if (storage) writeJson(storage, RECENT_KEY, items); }
  function persistSaved(items: SavedFilter[]) { if (storage) writeJson(storage, SAVED_KEY, items); }

  async function loadMeta(): Promise<void> {
    setLoadState("queued"); setLoadError("");
    try {
      const [status, spaceList, tagList] = await Promise.all([
        getBridge().search.status({}),
        getBridge().spaces.list({}).catch(() => ({ spaces: [] as SpaceJSON[] })),
        getBridge().tags.list({}).catch(() => ({ tags: [] as TagJSON[] })),
      ]);
      batch(() => {
        setFtsDocuments(status.ftsDocuments);
        setSpaces(spaceList.spaces ?? []);
        setTags(tagList.tags ?? []);
        setLoadState("live");
      });
    } catch (error) {
      setLoadError(errorText(error));
      setLoadState(isUnavailable(error) ? "unavailable" : "failed");
    }
  }

  async function run(text = query(), nextFilters = filters()): Promise<void> {
    const current = ++generation;
    const trimmed = text.trim();
    if (!trimmed) {
      batch(() => {
        setHits([]); setVisibleHits([]); setNotice(""); setSearched(false); setSearchError(""); setSearchState("live"); setActiveId(null);
      });
      return;
    }
    setSearchState("queued"); setSearchError("");
    try {
      const result = await getBridge().search.search(buildSearchRequest(trimmed, nextFilters, now()));
      if (generation !== current) return;
      const nextHits = result.hits ?? [];
      const remembered = rememberRecent(recent(), trimmed);
      batch(() => {
        setHits(nextHits);
        setVisibleHits(windowHits(nextHits, RESULT_WINDOW));
        setNotice(result.notice ?? "");
        setSearched(true);
        setSearchState("live");
        setRecent(remembered);
        setActiveId(windowHits(nextHits, RESULT_WINDOW)[0]?.noteId ?? null);
      });
      persistRecent(remembered);
    } catch (error) {
      if (generation !== current) return;
      batch(() => {
        setSearchError(errorText(error));
        setSearchState(isUnavailable(error) ? "unavailable" : "failed");
        setHits([]); setVisibleHits([]); setSearched(true);
      });
    }
  }

  function schedule() {
    generation += 1;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void run(); }, debounceMs);
  }

  const store = {
    query, filters, hits, visibleHits, notice, ftsDocuments, spaces, tags, recent, saved,
    loadState, searchState, loadError, searchError, searched, activeId,
    emptyQuery: () => !query().trim() && !searched(),
    noResults: () => searched() && searchState() === "live" && visibleHits().length === 0,
    filtersOn: () => filtersActive(filters()),
    honesty: () => indexHonesty(ftsDocuments(), notice(), loadState() === "live" ? searchState() : loadState()),
    statusLabel: () => honestyLabel(loadState() === "live" ? searchState() : loadState()),
    setQuery(value: string) { setQueryValue(value); schedule(); },
    applyRouteQuery(raw: string | null | undefined) {
      const next = routeSearchQuery(raw);
      if (next === undefined || next === query()) return;
      setQueryValue(next);
      schedule();
    },
    setFilters(patch: Partial<SearchFilters>) {
      setFiltersValue(current => ({ ...current, ...patch }));
      if (query().trim()) schedule();
    },
    async commandQuery(text: string): Promise<SearchHitJSON[]> {
      const ticket = ++commandGeneration;
      generation += 1;
      await new Promise(resolve => setTimeout(resolve, debounceMs));
      if (ticket !== commandGeneration) return [];
      await run(text, EMPTY_FILTERS);
      if (ticket !== commandGeneration) return [];
      if (searchState() !== "live") throw new Error(searchError() || "Search unavailable.");
      return visibleHits();
    },
    openHit(id: string) { return getBridge().app.openDeepLink(`pwnotes://note/${encodeURIComponent(id)}`); },
    setActiveId,
    applyRecent(value: string) { setQueryValue(value); void run(value, filters()); },
    saveFilters(name: string) {
      const label = name.trim();
      if (!label) return;
      const snapshot: SavedFilter = { id: `saved-${Date.now()}`, name: label, filters: { ...filters(), tagIds: [...filters().tagIds] } };
      const next = [snapshot, ...saved().filter(item => item.name !== label)];
      setSaved(next); persistSaved(next);
    },
    applySaved(id: string) {
      const item = saved().find(entry => entry.id === id);
      if (!item) return;
      setFiltersValue({ ...item.filters, tagIds: [...item.filters.tagIds] });
      if (query().trim()) schedule();
    },
    removeSaved(id: string) {
      const next = saved().filter(item => item.id !== id);
      setSaved(next); persistSaved(next);
    },
    clearFilters() {
      setFiltersValue({ ...EMPTY_FILTERS });
      if (query().trim()) schedule();
    },
    connect() {
      users += 1;
      if (users === 1) {
        if (storage) {
          setRecent(readJson(storage, RECENT_KEY, [] as string[]));
          setSaved(readJson(storage, SAVED_KEY, [] as SavedFilter[]));
        }
        try {
          unsubscribe = getBridge().onChange(event => {
            if (event.resync || event.changes.some(change => change.entity === "note" || change.entity === "space" || change.entity === "tag")) {
              void loadMeta().then(() => run());
            }
          });
        } catch (error) {
          setLoadState("unavailable");
          setLoadError(errorText(error) || "Polterware Notes bridge unavailable. Open this page in Polterware Notes Desktop.");
        }
        void loadMeta();
      }
      return () => {
        users = Math.max(0, users - 1);
        if (users === 0) { unsubscribe?.(); unsubscribe = undefined; if (timer) clearTimeout(timer); generation += 1; }
      };
    },
    reload: () => { void loadMeta(); return run(); },
    flush: () => { if (timer) { clearTimeout(timer); timer = undefined; } return run(); },
    dispose() { commandGeneration += 1; unsubscribe?.(); unsubscribe = undefined; users = 0; if (timer) clearTimeout(timer); generation += 1; },
  };
  return store;
}

export const searchStore = createSearchStore();
export type SearchStore = ReturnType<typeof createSearchStore>;
