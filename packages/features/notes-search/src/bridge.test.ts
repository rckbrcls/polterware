import { describe, expect, it, vi } from "vitest";
import { SearchNotesRequestSchema } from "@polterware/notes-contracts";
import { fromJson, toJson } from "@bufbuild/protobuf";
import { createSearchBridge, type SearchWireBridge } from "./bridge";

describe("protobuf JSON search bridge", () => {
  it("sends RFC 3339 date filters and validates SearchService.Search output", async () => {
    const search = vi.fn(async (input?: unknown) => {
      expect(input).toMatchObject({
        query: "milk", spaceId: "space-1", includeDescendants: true, tagIds: ["tag-1"], status: "active", limit: 50,
        dueFrom: "2026-10-04T00:00:00.000Z", dueTo: "2026-10-04T23:59:59.999Z",
      });
      return { hits: [{ noteId: "note-milk", title: "Buy milk", score: 0.1, snippet: "Get <b>milk</b>", matchedIn: ["content"] }], notice: "" };
    });
    const bridge = createSearchBridge({
      search: { search, status: async () => ({ ftsDocuments: 3 }) },
      spaces: { list: async () => ({ spaces: [] }) },
      tags: { list: async () => ({ tags: [] }) },
      onChange: () => () => {},
      app: { openDeepLink: async () => {} },
    } as unknown as SearchWireBridge);
    const result = await bridge.search.search({
      query: "milk", spaceId: "space-1", includeDescendants: true, tagIds: ["tag-1"], status: "active", limit: 50,
      dueFrom: "2026-10-04T00:00:00.000Z", dueTo: "2026-10-04T23:59:59.999Z",
    });
    expect(result.hits?.[0]?.noteId).toBe("note-milk");
    expect(search).toHaveBeenCalledOnce();
  });

  it("round-trips SearchNotesRequest timestamps as RFC 3339 strings", () => {
    const json = toJson(SearchNotesRequestSchema, fromJson(SearchNotesRequestSchema, {
      query: "milk", dueFrom: "2026-10-04T00:00:00.000Z", updatedTo: "2026-10-04T23:59:59.999Z", limit: 50,
    }));
    expect(json).toMatchObject({ query: "milk", limit: 50 });
    expect(String((json as { dueFrom: string }).dueFrom)).toContain("2026-10-04");
  });
});
