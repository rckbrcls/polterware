import type { DescMessage, DescMethodUnary, MessageShape as ContractMessage } from "@bufbuild/protobuf";
import type {
  SpaceSchema, SpaceService, SearchHitSchema, SearchNotesRequestSchema, SearchService, TagSchema, TagService,
} from "@polterware/notes-contracts";

/** Protobuf JSON: int64 is a decimal string, timestamps are RFC 3339. */
type Wire<T> = T extends { $typeName: "google.protobuf.Timestamp" } ? string
  : T extends bigint ? string
  : T extends readonly (infer V)[] ? Wire<V>[]
  : T extends object ? { [K in keyof T as K extends "$typeName" ? never : K]?: Wire<T[K]> }
  : T;
export type JsonOf<S extends DescMessage> = Wire<ContractMessage<S>>;
export type Namespace<S extends { method: object }> = {
  [K in keyof S["method"]]: S["method"][K] extends DescMethodUnary
    ? (input?: Wire<ContractMessage<S["method"][K]["input"]>>) => Promise<Wire<ContractMessage<S["method"][K]["output"]>>> : never;
};

export type SearchHitJSON = JsonOf<typeof SearchHitSchema>;
export type SearchRequestJSON = JsonOf<typeof SearchNotesRequestSchema>;
export type SpaceJSON = JsonOf<typeof SpaceSchema>;
export type TagJSON = JsonOf<typeof TagSchema>;
export type SearchServiceNS = Namespace<typeof SearchService>;
export type SpaceServiceNS = Namespace<typeof SpaceService>;
export type TagServiceNS = Namespace<typeof TagService>;

export type Honesty = "live" | "queued" | "failed" | "unavailable";
export type DuePreset = "any" | "overdue" | "today" | "next7" | "month" | "custom";
export type UpdatedPreset = "any" | "today" | "last7" | "last30" | "custom";
export type SearchFilters = {
  spaceId: string;
  includeDescendants: boolean;
  tagIds: string[];
  status: string;
  due: DuePreset;
  dueFrom: string;
  dueTo: string;
  updated: UpdatedPreset;
  updatedFrom: string;
  updatedTo: string;
};
export type SnippetPart = { text: string; highlight: boolean };
export type IndexHonesty = { tone: "ok" | "degraded" | "syncing" | "danger" | "muted"; label: string; detail: string };

export const RESULT_WINDOW = 50;
export const SEARCH_LIMIT = 50;
export const RECENT_LIMIT = 8;
export const DEBOUNCE_MS = 180;
export const RECENT_KEY = "pwnotes.search.recent";
export const SEARCH_QUERY_MAX_LENGTH = 512;
export const SNIPPET_OPEN = "<b>";
export const SNIPPET_CLOSE = "</b>";

export const EMPTY_FILTERS: SearchFilters = {
  spaceId: "", includeDescendants: true, tagIds: [], status: "active",
  due: "any", dueFrom: "", dueTo: "", updated: "any", updatedFrom: "", updatedTo: "",
};

export type SearchBridge = {
  search: SearchServiceNS;
  spaces: SpaceServiceNS;
  tags: TagServiceNS;
  onChange(callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void): () => void;
  app: { openDeepLink(url: string): Promise<void> };
};

export function honestyTone(state: Honesty): "ok" | "syncing" | "danger" | "muted" {
  if (state === "live") return "ok";
  if (state === "queued") return "syncing";
  if (state === "failed") return "danger";
  return "muted";
}
export function honestyLabel(state: Honesty): string {
  if (state === "live") return "Live";
  if (state === "queued") return "Queued";
  if (state === "failed") return "Failed";
  return "Unavailable";
}

/** FTS5 snippet markers are `<b>`/`</b>`. Treat everything else as text; never parse HTML. */
export function parseSnippet(raw: string | undefined): SnippetPart[] {
  let rest = raw ?? "";
  let highlight = false;
  const parts: SnippetPart[] = [];
  while (rest.length > 0) {
    const token = highlight ? SNIPPET_CLOSE : SNIPPET_OPEN;
    const index = rest.indexOf(token);
    if (index < 0) {
      parts.push({ text: rest, highlight });
      break;
    }
    if (index > 0) parts.push({ text: rest.slice(0, index), highlight });
    rest = rest.slice(index + token.length);
    highlight = !highlight;
  }
  return parts.length > 0 ? parts : [{ text: "", highlight: false }];
}

export function windowHits<T>(hits: readonly T[], limit = RESULT_WINDOW): T[] {
  return hits.slice(0, Math.max(0, limit));
}

export function localDayStamp(year: number, month: number, day: number, end = false): string {
  const date = end
    ? new Date(year, month, day, 23, 59, 59, 999)
    : new Date(year, month, day, 0, 0, 0, 0);
  return date.toISOString();
}
export function ymdStamp(value: string, end = false): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  return localDayStamp(Number(match[1]), Number(match[2]) - 1, Number(match[3]), end);
}

export function dueRange(filters: SearchFilters, now: Date): { from?: string; to?: string } {
  if (filters.due === "custom") return { from: ymdStamp(filters.dueFrom), to: ymdStamp(filters.dueTo, true) };
  const year = now.getFullYear(), month = now.getMonth(), day = now.getDate();
  if (filters.due === "overdue") return { to: localDayStamp(year, month, day) };
  if (filters.due === "today") return { from: localDayStamp(year, month, day), to: localDayStamp(year, month, day, true) };
  if (filters.due === "next7") {
    const end = new Date(year, month, day + 6);
    return { from: localDayStamp(year, month, day), to: localDayStamp(end.getFullYear(), end.getMonth(), end.getDate(), true) };
  }
  if (filters.due === "month") {
    const last = new Date(year, month + 1, 0).getDate();
    return { from: localDayStamp(year, month, 1), to: localDayStamp(year, month, last, true) };
  }
  return {};
}
export function updatedRange(filters: SearchFilters, now: Date): { from?: string; to?: string } {
  if (filters.updated === "custom") return { from: ymdStamp(filters.updatedFrom), to: ymdStamp(filters.updatedTo, true) };
  const year = now.getFullYear(), month = now.getMonth(), day = now.getDate();
  if (filters.updated === "today") return { from: localDayStamp(year, month, day), to: localDayStamp(year, month, day, true) };
  if (filters.updated === "last7") {
    const start = new Date(year, month, day - 6);
    return { from: localDayStamp(start.getFullYear(), start.getMonth(), start.getDate()), to: localDayStamp(year, month, day, true) };
  }
  if (filters.updated === "last30") {
    const start = new Date(year, month, day - 29);
    return { from: localDayStamp(start.getFullYear(), start.getMonth(), start.getDate()), to: localDayStamp(year, month, day, true) };
  }
  return {};
}

export function buildSearchRequest(query: string, filters: SearchFilters, now: Date, limit = SEARCH_LIMIT): SearchRequestJSON {
  const due = dueRange(filters, now);
  const updated = updatedRange(filters, now);
  const request: SearchRequestJSON = { query, includeDescendants: filters.includeDescendants, limit };
  if (filters.spaceId) request.spaceId = filters.spaceId;
  if (filters.tagIds.length) request.tagIds = filters.tagIds;
  if (filters.status) request.status = filters.status;
  if (due.from) request.dueFrom = due.from;
  if (due.to) request.dueTo = due.to;
  if (updated.from) request.updatedFrom = updated.from;
  if (updated.to) request.updatedTo = updated.to;
  return request;
}

export function filtersActive(filters: SearchFilters): boolean {
  return Boolean(filters.spaceId || filters.tagIds.length || (filters.status && filters.status !== "active")
    || filters.due !== "any" || filters.updated !== "any");
}

export function indexHonesty(ftsDocuments: number | undefined, notice: string, state: Honesty): IndexHonesty {
  if (state === "queued") return { tone: "syncing", label: "Queued", detail: "Checking the text index." };
  if (state === "unavailable") return { tone: "muted", label: "Unavailable", detail: "Search cannot reach the local core." };
  if (state === "failed") return { tone: "danger", label: "Failed", detail: "Text search failed." };
  const text = notice.trim();
  if (/rebuild/i.test(text)) return { tone: "degraded", label: "Index rebuilding", detail: text };
  if (ftsDocuments === 0) {
    return { tone: "degraded", label: "Index empty", detail: text || "The FTS5 text index has no documents. Results may be incomplete." };
  }
  if (text) return { tone: "degraded", label: "Degraded", detail: text };
  return { tone: "ok", label: "Live", detail: "FTS5 text search only." };
}

export function matchedInLabel(values: readonly string[] | undefined): string {
  const labels: Record<string, string> = { title: "Title", content: "Content", checklist: "Checklist", tags: "Tags", space: "Space" };
  return (values ?? []).map(value => labels[value] ?? value).join(" · ");
}

export function readJson<T>(storage: Pick<Storage, "getItem">, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
export function writeJson(storage: Pick<Storage, "setItem">, key: string, value: unknown): void {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* Session-only. */ }
}
export function rememberRecent(items: readonly string[], query: string, limit = RECENT_LIMIT): string[] {
  const next = query.trim();
  if (!next) return [...items];
  return [next, ...items.filter(item => item !== next)].slice(0, limit);
}
export function routeSearchQuery(raw: string | null | undefined): string | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed.length > SEARCH_QUERY_MAX_LENGTH) return undefined;
  return trimmed;
}
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function isUnavailable(error: unknown): boolean {
  return /unreach|unavailable|offline|disconnected/i.test(errorText(error));
}
