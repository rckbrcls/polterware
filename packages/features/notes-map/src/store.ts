import { createSignal } from "solid-js";
import { DEFAULT_MAP_CENTER } from "@polterware/frontend-map";
import { browserBridge, type MapBridge } from "./bridge";
import { WORLD_BOUNDS, errorText, geocodingEnabled, type Honesty, type MapPlaceRow, type PlaceJSON, type SettingsJSON } from "./model";

export type MapBoundsQuery = { south: number; west: number; north: number; east: number };
const NOTE_PAGE_SIZE = 500;
const MAX_NOTE_PAGES = 20;

export function createMapStore(getBridge: () => MapBridge = browserBridge) {
  const [places, setPlaces] = createSignal<MapPlaceRow[]>([]);
  const [bounds, setBounds] = createSignal<MapBoundsQuery>(WORLD_BOUNDS);
  const [center, setCenter] = createSignal(DEFAULT_MAP_CENTER);
  const [zoom, setZoom] = createSignal(11);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [geocoding, setGeocoding] = createSignal(false);
  const [loadState, setLoadState] = createSignal<Honesty>("queued");
  const [saveState, setSaveState] = createSignal<Honesty>("live");
  const [loadError, setLoadError] = createSignal("");
  const [saveError, setSaveError] = createSignal("");
  let unsubscribe: (() => void) | undefined;
  let users = 0;
  let io = Promise.resolve();
  let fitted = false;
  let generation = 0;

  async function loadSettings(bridge: MapBridge, current: number): Promise<SettingsJSON | undefined> {
    const result = await bridge.settings.get({}) as { settings?: SettingsJSON };
    const settings = result.settings;
    if (current !== generation) return;
    setGeocoding(geocodingEnabled(settings));
    return settings;
  }

  async function loadNoteTitles(bridge: MapBridge, current: number) {
    const titles = new Map<string, string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_NOTE_PAGES; page++) {
      const response = await bridge.notes.list({ hasPlace: true, limit: NOTE_PAGE_SIZE, ...(cursor ? { cursor } : {}) }) as {
        notes?: { id?: string; title?: string }[]; nextCursor?: string;
      };
      if (current !== generation) return titles;
      for (const row of response.notes ?? []) titles.set(row.id ?? "", row.title ?? "");
      if (!response.nextCursor) return titles;
      if (cursors.has(response.nextCursor)) throw new Error("Map note query returned a repeated cursor.");
      cursors.add(response.nextCursor);
      cursor = response.nextCursor;
    }
    throw new Error("Map note query exceeds 10000 notes.");
  }

  async function loadPlaces(next = bounds()) {
    const current = ++generation;
    // Keep the map mounted while it refreshes places for new bounds; only a cold load shows the loading state.
    if (loadState() !== "live") setLoadState("queued");
    setLoadError("");
    try {
      const bridge = getBridge();
      await loadSettings(bridge, current);
      if (current !== generation) return;
      const [placeResponse, titles] = await Promise.all([
        bridge.places.listInBounds(next) as Promise<{ places?: PlaceJSON[] }>,
        loadNoteTitles(bridge, current),
      ]);
      if (current !== generation) return;
      const rows = (placeResponse.places ?? []).map(place => ({
        noteId: place.noteId ?? "",
        title: titles.get(place.noteId ?? "") || place.name || "Untitled place",
        name: place.name ?? "",
        lat: place.lat ?? 0,
        lng: place.lng ?? 0,
        radiusM: place.radiusM,
        event: place.event || "enter",
      })).filter(row => row.noteId);
      setPlaces(rows);
      setBounds(next);
      if (!fitted && rows[0]) {
        setCenter({ lat: rows[0].lat, lng: rows[0].lng });
        fitted = true;
      }
      setLoadState("live");
    } catch (error) {
      if (current !== generation) return;
      const message = errorText(error);
      setLoadError(message);
      setLoadState(message.toLowerCase().includes("unavailable") || message.toLowerCase().includes("unreachable") ? "unavailable" : "failed");
    }
  }

  const store = {
    places, bounds, center, zoom, selectedId, geocoding, loadState, saveState, loadError, saveError,
    markers: () => places().map(place => ({ id: place.noteId, lat: place.lat, lng: place.lng, radius: place.radiusM })),
    connect() {
      users += 1;
      if (users === 1) {
        try {
          unsubscribe = getBridge().onChange(event => {
            if (event.resync || event.changes.some(change => ["place", "places", "note", "notes", "settings"].includes(change.entity))) {
              io = io.catch(() => undefined).then(() => loadPlaces(bounds()));
            }
          });
        } catch (error) {
          setLoadState("unavailable");
          setLoadError(errorText(error));
        }
        void loadPlaces(WORLD_BOUNDS);
      }
      return () => {
        users = Math.max(0, users - 1);
        if (users === 0) { generation++; unsubscribe?.(); unsubscribe = undefined; }
      };
    },
    reload: () => loadPlaces(bounds()),
    setBounds(next: MapBoundsQuery, nextZoom?: number) {
      if (nextZoom !== undefined) setZoom(nextZoom);
      io = io.catch(() => undefined).then(() => loadPlaces(next));
    },
    select(id: string | null) {
      setSelectedId(id);
      const row = places().find(place => place.noteId === id);
      if (row) setCenter({ lat: row.lat, lng: row.lng });
    },
    flush: () => io,
    dispose() { generation++; unsubscribe?.(); unsubscribe = undefined; users = 0; },
  };
  return store;
}

export type MapStore = ReturnType<typeof createMapStore>;
export const mapStore = createMapStore();
