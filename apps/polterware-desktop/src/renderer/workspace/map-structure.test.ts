import { describe, expect, it } from "vitest";
import { mapStructure, mapStructureHistory } from "./map-records";

describe("mapStructure", () => {
  it("maps nodes and drift slugs, dropping unknown levels and statuses", () => {
    const structure = mapStructure({
      nodes: [
        {
          id: "n1",
          parentId: "",
          level: "domain",
          slug: "core",
          path: "core",
          title: "Core",
          intent: "Local authority",
          decisions: ["Decision 0008"],
          invariants: [{ id: "i1", text: "One core process" }],
          status: "in_progress",
          childCount: 1,
          featureCount: 2,
          openQuestions: 0,
          repo: "api",
          folder: "src/core",
          migrationFrom: "REST",
          migrationTo: "Connect",
          deploys: [{ id: "deploy-1", environmentId: "prod", environment: "Production", provider: "aws", resource: "api-prod" }],
        },
        { id: "n2", level: "folder", status: "proposed", title: "Dropped" },
        { id: "n3", level: "domain", status: "mystery", title: "Dropped" },
      ],
    });

    expect(structure.nodes).toHaveLength(1);
    expect(structure.nodes[0]).toMatchObject({
      id: "n1",
      path: "core",
      status: "in_progress",
      childCount: 1,
      featureCount: 2,
      decisions: ["Decision 0008"],
      repo: "api",
      folder: "src/core",
      migrationFrom: "REST",
      migrationTo: "Connect",
    });
    expect(structure.nodes[0]?.invariants).toEqual([{ id: "i1", text: "One core process" }]);
    expect(structure.nodes[0]?.deploys).toEqual([{ id: "deploy-1", environmentId: "prod", environment: "Production", provider: "aws", resource: "api-prod" }]);
  });

  it("returns an empty structure for an empty response", () => {
    expect(mapStructure({})).toEqual({ nodes: [], historical: false });
  });

  it("flags a replayed past graph", () => {
    expect(mapStructure({ historical: true }).historical).toBe(true);
  });

  it("maps the change batches that touched the Structure", () => {
    const entries = mapStructureHistory({
      entries: [{ batchId: "b2", at: "2026-09-02T10:00:00Z", nodeOps: 3, summary: "core/import" }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ batchId: "b2", nodeOps: 3, summary: "core/import" });
  });
});
