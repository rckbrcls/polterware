import { describe, expect, it } from "vitest";
import {
  RESULT_WINDOW, SEARCH_QUERY_MAX_LENGTH, buildSearchRequest, EMPTY_FILTERS, indexHonesty, parseSnippet, rememberRecent, routeSearchQuery, windowHits, writeJson,
} from "./model";

describe("FTS5 snippet markers", () => {
  it("splits core <b> markers without treating other markup as HTML", () => {
    expect(parseSnippet("Get <b>milk</b> from the store")).toEqual([
      { text: "Get ", highlight: false },
      { text: "milk", highlight: true },
      { text: " from the store", highlight: false },
    ]);
    expect(parseSnippet(`alert <img src=x onerror=alert(1)> then <b>safe</b>`)).toEqual([
      { text: "alert <img src=x onerror=alert(1)> then ", highlight: false },
      { text: "safe", highlight: true },
    ]);
  });
});

describe("SearchNotesRequest mapping", () => {
  it("sends space, descendants, tags, status, limit, and v1.2 date filters as RFC 3339 strings", () => {
    const now = new Date(2026, 9, 4, 15, 0, 0);
    const request = buildSearchRequest("milk", {
      ...EMPTY_FILTERS, spaceId: "space-1", includeDescendants: true, tagIds: ["tag-1"], status: "active", due: "today", updated: "last7",
    }, now, 50);
    expect(request).toMatchObject({
      query: "milk", spaceId: "space-1", includeDescendants: true, tagIds: ["tag-1"], status: "active", limit: 50,
    });
    expect(request.dueFrom).toMatch(/^2026-10-04T/);
    expect(request.dueTo).toMatch(/^2026-10-0[45]T/);
    expect(typeof request.dueFrom).toBe("string");
    expect(typeof request.updatedFrom).toBe("string");
  });
});

describe("10k-note UI window", () => {
  it("keeps windowing and snippet work under 100 ms", () => {
    const hits = Array.from({ length: 10_000 }, (_, index) => ({
      noteId: `note-${index}`, title: `Note ${index}`, snippet: `before <b>match</b> ${index}`, matchedIn: ["content"],
    }));
    const start = performance.now();
    const visible = windowHits(hits, RESULT_WINDOW);
    const parts = visible.map(hit => parseSnippet(hit.snippet));
    const elapsed = performance.now() - start;
    expect(visible).toHaveLength(RESULT_WINDOW);
    expect(parts[0]?.some(part => part.highlight)).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });
});

describe("index honesty", () => {
  it("uses Status.ftsDocuments and Search notice for degraded or rebuilding copy", () => {
    expect(indexHonesty(0, "", "live").label).toBe("Index empty");
    expect(indexHonesty(12, "Index rebuild in progress", "live")).toMatchObject({ label: "Index rebuilding", tone: "degraded" });
    expect(indexHonesty(12, "", "live")).toMatchObject({ label: "Live", detail: "FTS5 text search only." });
  });
});

describe("local-only recent searches", () => {
  it("stores recents and swallows quota errors", () => {
    expect(rememberRecent(["eggs"], "milk")).toEqual(["milk", "eggs"]);
    expect(() => writeJson({ setItem: () => { throw new Error("quota"); } }, "pwnotes.search.recent", ["milk"])).not.toThrow();
  });
});

describe("deep-link search query", () => {
  it("trims and rejects empty or over-long q values", () => {
    expect(routeSearchQuery("  packaging  ")).toBe("packaging");
    expect(routeSearchQuery("   ")).toBeUndefined();
    expect(routeSearchQuery(null)).toBeUndefined();
    expect(routeSearchQuery("x".repeat(SEARCH_QUERY_MAX_LENGTH))).toHaveLength(SEARCH_QUERY_MAX_LENGTH);
    expect(routeSearchQuery("x".repeat(SEARCH_QUERY_MAX_LENGTH + 1))).toBeUndefined();
  });
});
