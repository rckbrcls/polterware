import { describe, expect, it } from "vitest";
import { mapAtlas, mapAtlasHistory } from "./map-records";

describe("mapAtlas", () => {
  it("maps nodes and drift slugs, dropping unknown levels and statuses", () => {
    const atlas = mapAtlas({
      nodes: [
        {
          id: "n1",
          parentId: "",
          level: "system",
          slug: "core",
          path: "core",
          title: "Core",
          intent: "Local authority",
          decisions: ["ADR 0008"],
          invariants: [{ id: "i1", text: "One core process" }],
          status: "in_progress",
          childCount: 1,
          featureCount: 2,
          openQuestions: 0,
          repo: "api",
          folder: "src/core",
          migrationFrom: "REST",
          migrationTo: "Connect",
        },
        { id: "n2", level: "folder", status: "proposed", title: "Dropped" },
        { id: "n3", level: "domain", status: "mystery", title: "Dropped" },
      ],
      driftSlugs: ["git-import"],
    });

    expect(atlas.nodes).toHaveLength(1);
    expect(atlas.nodes[0]).toMatchObject({
      id: "n1",
      path: "core",
      status: "in_progress",
      childCount: 1,
      featureCount: 2,
      decisions: ["ADR 0008"],
      repo: "api",
      folder: "src/core",
      migrationFrom: "REST",
      migrationTo: "Connect",
    });
    expect(atlas.nodes[0]?.invariants).toEqual([{ id: "i1", text: "One core process" }]);
    expect(atlas.driftSlugs).toEqual(["git-import"]);
  });

  it("returns an empty atlas for an empty response", () => {
    expect(mapAtlas({})).toEqual({ nodes: [], driftSlugs: [], historical: false });
  });

  it("flags a replayed past graph", () => {
    expect(mapAtlas({ historical: true }).historical).toBe(true);
  });

  it("maps the change batches that touched the Atlas", () => {
    const entries = mapAtlasHistory({
      entries: [{ batchId: "b2", at: "2026-09-02T10:00:00Z", nodeOps: 3, summary: "core/import" }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ batchId: "b2", nodeOps: 3, summary: "core/import" });
  });
});
