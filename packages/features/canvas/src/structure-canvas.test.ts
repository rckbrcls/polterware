import { describe, expect, it } from "vitest";
import { drawStructure, isStructureCanvas, type StructureSource } from "./structure-canvas";

const tree: StructureSource[] = [
  { id: "app", parentId: "", level: "system", title: "App" },
  { id: "core", parentId: "app", level: "domain", title: "Core" },
  { id: "api", parentId: "core", level: "component", title: "API" },
  { id: "db", parentId: "core", level: "component", title: "DB" },
  { id: "cli", parentId: "app", level: "component", title: "CLI" },
  { id: "old", parentId: "app", level: "component", title: "Old", status: "removed" },
  { id: "docs", parentId: "", level: "system", title: "Docs" },
];

type Rect = { x: number; y: number; width: number; height: number };
const rects = (layoutJson: string) => (JSON.parse(layoutJson) as { nodes: Record<string, Rect> }).nodes;
const inside = (inner: Rect, outer: Rect) => inner.x >= outer.x && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

describe("drawStructure", () => {
  it("draws every live node once, citing its Structure node, parents before children", () => {
    const { graph, layoutJson } = drawStructure(tree);
    expect(graph.nodes.map((node) => node.id)).toEqual(["structure-app", "structure-cli", "structure-core", "structure-api", "structure-db", "structure-docs"]);
    expect(graph.nodes[0]).toMatchObject({ kind: "system", label: "App", ref: { kind: "node", id: "app" } });
    expect(graph.edges).toEqual([]);
    expect(isStructureCanvas({ layoutJson })).toBe(true);
  });

  it("places each node inside its parent and stacks systems apart", () => {
    const nodes = rects(drawStructure(tree).layoutJson);
    expect(inside(nodes["structure-core"]!, nodes["structure-app"]!)).toBe(true);
    expect(inside(nodes["structure-api"]!, nodes["structure-core"]!)).toBe(true);
    expect(inside(nodes["structure-cli"]!, nodes["structure-app"]!)).toBe(true);
    expect(inside(nodes["structure-cli"]!, nodes["structure-core"]!)).toBe(false);
    expect(nodes["structure-docs"]!.y).toBeGreaterThan(nodes["structure-app"]!.y + nodes["structure-app"]!.height);
  });

  it("is the same drawing every time", () => {
    expect(drawStructure(tree)).toEqual(drawStructure(tree));
  });

  it("keeps hand-drawn items and edges between nodes still drawn on a redraw", () => {
    const first = drawStructure(tree);
    const previous = {
      graph: {
        nodes: [...first.graph.nodes, { id: "note-1", kind: "note", label: "Ask about caching", propsJson: "{}" }, { id: "structure-gone", kind: "component", label: "Gone", propsJson: "{}", ref: { kind: "node", id: "gone" } }],
        edges: [
          { id: "e1", from: "structure-cli", to: "structure-api", kind: "calls", propsJson: "{}" },
          { id: "e2", from: "note-1", to: "structure-db", kind: "relates", propsJson: "{}" },
          { id: "e3", from: "structure-gone", to: "structure-api", kind: "uses", propsJson: "{}" },
        ],
      },
      layoutJson: JSON.stringify({ ...JSON.parse(first.layoutJson), nodes: { ...rects(first.layoutJson), "note-1": { x: 900, y: 10, width: 180, height: 100 } } }),
    };
    const { graph, layoutJson } = drawStructure(tree, previous);
    expect(graph.nodes.map((node) => node.id)).toContain("note-1");
    expect(graph.nodes.map((node) => node.id)).not.toContain("structure-gone");
    expect(graph.edges.map((edge) => edge.id)).toEqual(["e1", "e2"]);
    expect(rects(layoutJson)["note-1"]).toEqual({ x: 900, y: 10, width: 180, height: 100 });
  });
});
