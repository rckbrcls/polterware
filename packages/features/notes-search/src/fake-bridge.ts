import { vi } from "vitest";
import type { SpaceJSON, SearchBridge, SearchHitJSON, SearchRequestJSON, TagJSON } from "./model";

export type SearchFixture = SearchHitJSON & {
  spaceId?: string;
  tagIds?: string[];
  status?: string;
  dueAt?: string;
  updatedAt?: string;
};

export const SEARCH_FIXTURES: SearchFixture[] = [
  {
    noteId: "note-milk", title: "Buy milk", score: 0.1, snippet: "Get <b>milk</b> from the store", matchedIn: ["content"],
    spaceId: "space-1", tagIds: ["tag-1"], status: "active", dueAt: "2026-10-04T12:00:00.000Z", updatedAt: "2026-10-04T08:00:00.000Z",
  },
  {
    noteId: "note-eggs", title: "Boil eggs", score: 1.2, snippet: "Breakfast <b>eggs</b>", matchedIn: ["title", "content"],
    spaceId: "space-1", tagIds: [], status: "active", dueAt: "2026-10-10T12:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z",
  },
  {
    noteId: "note-done", title: "Done milk run", score: 2, snippet: "Completed the <b>milk</b> run", matchedIn: ["content"],
    spaceId: "space-2", tagIds: ["tag-1"], status: "completed", dueAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-02T08:00:00.000Z",
  },
];

function inRange(value: string | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

export function filterFixtures(rows: readonly SearchFixture[], input: SearchRequestJSON = {}): SearchHitJSON[] {
  const query = (input.query ?? "").trim().toLowerCase();
  if (!query) return [];
  const descendants = new Set(["space-1", "space-1-child"]);
  return rows.filter(row => {
    const haystack = `${row.title ?? ""} ${row.snippet ?? ""}`.toLowerCase();
    if (!haystack.includes(query.replace(/["*]/g, ""))) return false;
    if (input.status && row.status !== input.status) return false;
    if (input.spaceId) {
      const allowed = input.includeDescendants && input.spaceId === "space-1" ? descendants : new Set([input.spaceId]);
      if (!allowed.has(row.spaceId ?? "")) return false;
    }
    if (input.tagIds?.length && !input.tagIds.some(id => row.tagIds?.includes(id))) return false;
    if (!inRange(row.dueAt, input.dueFrom, input.dueTo)) return false;
    if (!inRange(row.updatedAt, input.updatedFrom, input.updatedTo)) return false;
    return true;
  }).slice(0, input.limit && input.limit > 0 ? input.limit : 50).map(row => ({
    noteId: row.noteId, title: row.title, score: row.score, snippet: row.snippet, matchedIn: row.matchedIn,
  }));
}

export function fakeBridge(options: {
  hits?: SearchFixture[];
  spaces?: SpaceJSON[];
  tags?: TagJSON[];
  ftsDocuments?: number;
  notice?: string;
  fail?: "search" | "status" | "unavailable";
} = {}) {
  const hits = structuredClone(options.hits ?? SEARCH_FIXTURES);
  const spaces = options.spaces ?? [{ id: "space-1", name: "Home" }, { id: "space-2", name: "Work" }];
  const tags = options.tags ?? [{ id: "tag-1", name: "Errands" }];
  let listener: Parameters<SearchBridge["onChange"]>[0] | undefined;
  const bridge: SearchBridge = {
    search: {
      search: vi.fn(async (input?: SearchRequestJSON) => {
        if (options.fail === "search") throw new Error("Search failed.");
        if (options.fail === "unavailable") throw new Error("The local core is unreachable.");
        return { hits: filterFixtures(hits, input), notice: options.notice ?? "" };
      }),
      status: vi.fn(async () => {
        if (options.fail === "status") throw new Error("Index status unavailable.");
        if (options.fail === "unavailable") throw new Error("The local core is unreachable.");
        return { ftsDocuments: options.ftsDocuments ?? hits.length };
      }),
      reindex: vi.fn(async () => ({ notes: hits.length })),
    },
    spaces: {
      list: vi.fn(async () => ({ spaces })),
      get: vi.fn(async () => ({})), create: vi.fn(async () => ({})), update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})), reorder: vi.fn(async () => ({})),
    },
    tags: {
      list: vi.fn(async () => ({ tags })),
      create: vi.fn(async () => ({})), update: vi.fn(async () => ({})), delete: vi.fn(async () => ({})), merge: vi.fn(async () => ({})),
    },
    onChange: vi.fn(callback => { listener = callback; return () => { listener = undefined; }; }),
    app: { openDeepLink: vi.fn(async () => {}) },
  };
  return { bridge, hits, emit: () => listener?.({ resync: false, changes: [{ entity: "note", id: "note-milk", op: "update" }] }) };
}
