export const MIN_RADIUS_M = 25;
export const MAX_RADIUS_M = 5000;
export const DEFAULT_RADIUS_M = 200;
export const DEFAULT_EVENT = "enter";
export const WORLD_BOUNDS = { south: -85, west: -180, north: 85, east: 180 };
export const TILE_NOTICE = "Map tiles are downloaded from OpenFreeMap. Your viewport is visible to them.";
export const PLACE_NOTICE = "Places do not trigger notifications in v1.";

export type Honesty = "live" | "queued" | "failed" | "unavailable";
export type PlaceJSON = {
  noteId?: string;
  name?: string;
  lat?: number;
  lng?: number;
  radiusM?: number;
  event?: string;
  active?: boolean;
  updatedAt?: string;
};
export type NoteJSON = {
  id?: string;
  title?: string;
  content?: string;
  status?: string;
  rev?: string;
  place?: PlaceJSON;
};
export type SettingsJSON = {
  mapOnline?: boolean;
  mapProvider?: string;
  mapGeocoding?: boolean;
};
export type PlaceDraft = {
  name: string;
  lat: string;
  lng: string;
  radiusM: number;
  event: "enter" | "exit";
};
export type MapPlaceRow = {
  noteId: string;
  title: string;
  name: string;
  lat: number;
  lng: number;
  radiusM?: number;
  event: string;
};

export function revisionString(rev: string | number | bigint | undefined): string {
  if (typeof rev === "string" && rev !== "") return rev;
  if (typeof rev === "bigint") return rev.toString();
  if (typeof rev === "number" && Number.isFinite(rev)) return Math.trunc(rev).toString();
  return "0";
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function honestyLabel(state: Honesty): string {
  if (state === "live") return "Live";
  if (state === "queued") return "Queued";
  if (state === "failed") return "Failed";
  return "Unavailable";
}

export function honestyTone(state: Honesty): "ok" | "syncing" | "danger" | "muted" {
  if (state === "live") return "ok";
  if (state === "queued") return "syncing";
  if (state === "failed") return "danger";
  return "muted";
}

export function clampRadius(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RADIUS_M;
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(value)));
}

export function parseCoordinate(value: string, kind: "lat" | "lng"): number | undefined {
  const next = Number(value);
  if (!Number.isFinite(next)) return undefined;
  if (kind === "lat" && (next < -90 || next > 90)) return undefined;
  if (kind === "lng" && (next < -180 || next > 180)) return undefined;
  return next;
}

export function draftFromPlace(place?: PlaceJSON | null): PlaceDraft {
  return {
    name: place?.name ?? "",
    lat: place && Number.isFinite(place.lat) ? String(place.lat) : "",
    lng: place && Number.isFinite(place.lng) ? String(place.lng) : "",
    radiusM: clampRadius(place?.radiusM ?? DEFAULT_RADIUS_M),
    event: place?.event === "exit" ? "exit" : "enter",
  };
}

export function placeFromDraft(noteId: string, draft: PlaceDraft): PlaceJSON | undefined {
  const lat = parseCoordinate(draft.lat, "lat");
  const lng = parseCoordinate(draft.lng, "lng");
  if (lat === undefined || lng === undefined) return undefined;
  return {
    noteId,
    name: draft.name.trim() || undefined,
    lat,
    lng,
    radiusM: clampRadius(draft.radiusM),
    event: draft.event,
    active: true,
  };
}

export function geocodingEnabled(settings?: SettingsJSON | null): boolean {
  return settings?.mapGeocoding === true;
}
