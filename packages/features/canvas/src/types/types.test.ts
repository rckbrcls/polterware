import { describe, expect, it } from "vitest";
import { toDocument, type CanvasRecord, type CanvasType } from "../model";
import { canvasBehavior } from "./index";
import { colorToken } from "./brainstorm";
import { structureEntities } from "./architecture";
import { currentQuarter, dateDay, dateToX, itemTimed, laneLayout, snapLanes } from "./roadmap";
import { flowChecks } from "./flow";
import { properties } from "./shared";

const definition = (type: string, nodeKinds: string[], edgeKinds: string[] = []): CanvasType => ({ type, label: type, nodeKinds, edgeKinds, rules: [], unrestricted: false });
const record: CanvasRecord = { id: "c", projectId: "p", name: "Canvas", type: "roadmap", agentVisible: false, updatedAt: "", scopeNodeId: "", layoutJson: "{}", graph: { nodes: [
  { id: "a", kind: "lane", label: "Build", propsJson: "{}" },
  { id: "b", kind: "lane", label: "Ship", propsJson: "{}" },
  { id: "work", kind: "item", label: "Work", propsJson: '{"lane":"a","start":"2026-10-01","end":"2026-10-15","future":42}' },
  { id: "ship", kind: "milestone", label: "Release", propsJson: '{"lane":"b","start":"2026-10-20"}' },
  { id: "note", kind: "note", label: "Annotation", propsJson: "{}" },
], edges: [] } };

describe("canvas type registry", () => {
  it("keeps palettes constrained by the live definition, including future server changes", () => {
    const flow = canvasBehavior(definition("flow", ["step", "decision", "start", "end", "note", "text"], ["next"]));
    expect(flow.palette()).not.toContain("subprocess");
    expect(flow.edges()).toEqual(["next"]);
    expect(flow.variant("decision")).toBe("decision");
    expect(flow.variant("start")).toBe("terminal");
    expect(flow.variant("end")).toBe("terminal");
    expect(canvasBehavior(definition("ideas", ["idea"])).palette()).not.toContain("group");
    expect(canvasBehavior(definition("roadmap", ["item"])).defaults("item", new Date("2026-10-01Z"))).toEqual({ quarter: "2026-Q4" });
    for (const type of ["brainstorm", "ideas"]) {
      const behavior = canvasBehavior(definition(type, ["idea", "group"]));
      expect(behavior.variant("idea")).toBe("sticky");
      expect(behavior.variant("group")).toBe("frame");
      expect(behavior.fields("idea").map((field) => field.key)).toEqual(["color"]);
    }
  });
  it("preserves free behavior and falls back for unknown future ids safely", () => {
    const free = canvasBehavior({ ...definition("free", ["note", "text"]), unrestricted: true });
    expect(free.palette()).toEqual(["rectangle", "ellipse", "note", "text"]);
    expect(free.variant("ellipse")).toBe("ellipse");
    expect(free.edgeStyle("relates").arrow).toBe(false);
    for (const id of ["future", "__proto__", "constructor"]) {
      const future = canvasBehavior(definition(id, ["future_node"], ["future_edge"]));
      expect(future.palette()).toEqual(["future_node"]);
      expect(future.edges()).toEqual(["future_edge"]);
      expect(future.fields("future_node")).toEqual([]);
    }
  });
  it("accepts only semantic color tags and lists loaded Structure levels", () => {
    expect(colorToken("red")).toBe("var(--color-danger)");
    expect(colorToken("#fff")).toBe("var(--color-text-muted)");
    expect(colorToken("__proto__")).toBe("var(--color-text-muted)");
    expect(structureEntities([
      { kind: "node", id: "a", level: "system", title: "A" }, { kind: "node", id: "b", level: "domain", title: "B" },
      { kind: "node", id: "c", level: "component", title: "C" }, { kind: "node", id: "d", level: "other", title: "D" },
      { kind: "card", id: "e", title: "E" },
    ]).map((entity) => entity.id)).toEqual(["a", "b", "c"]);
  });
});

describe("roadmap layout", () => {
  it("maps UTC dates deterministically and rejects invalid calendar dates", () => {
    expect(dateToX("2026-03-10", "2026-03-08")).toBe(256);
    expect(dateToX("2026-03-07", "2026-03-08")).toBe(232);
    expect(dateDay("2024-02-29")).toBeDefined();
    for (const value of ["2026-02-29", "2026-04-31", "bad", "2026-10-01T00:00:00Z", null]) expect(dateDay(value)).toBeUndefined();
    expect(dateToX("bad", "2026-10-01")).toBeUndefined();
    expect(currentQuarter(new Date("2026-01-01Z"))).toBe("2026-Q1");
  });
  it("derives time geometry, snaps lane rows, preserves annotations and is idempotent", () => {
    const input = toDocument(record); const result = laneLayout(input);
    const node = (id: string) => result.nodes.find((node) => node.id === id)!;
    expect(node("work")).toMatchObject({ x: 240, y: 48, width: 120, height: 100 });
    expect(node("ship")).toMatchObject({ x: 392, y: 240 });
    expect(node("a").height).toBe(168);
    expect(node("b").y).toBe(192);
    expect(node("note")).toEqual(input.nodes.find((node) => node.id === "note"));
    expect(result.nodes.map((node) => properties(node))).toEqual(input.nodes.map((node) => properties(node)));
    expect(laneLayout(result)).toEqual(result);
    expect(input.nodes.find((node) => node.id === "work")?.x).not.toBe(240);
  });
  it("updates lane membership on drop and keeps untimed items stable", () => {
    const doc = laneLayout(toDocument(record));
    const moved = { ...doc, nodes: doc.nodes.map((node) => node.id === "work" ? { ...node, y: 240 } : node) };
    const result = snapLanes(moved, ["work"]);
    expect(properties(result.nodes.find((node) => node.id === "work")!)).toMatchObject({ lane: "b", future: 42 });
    const untimed = { ...record, graph: { nodes: [{ id: "q", kind: "item", label: "Quarter", propsJson: '{"quarter":"2026-Q4","lane":"missing"}' }], edges: [] } };
    expect(laneLayout(toDocument(untimed)).nodes[0]).toMatchObject({ x: 240, y: 48 });
  });
  it("mirrors the server timing presence rule without adding date restrictions", () => {
    expect(itemTimed({ quarter: "  " })).toBe(false);
    expect(itemTimed({ start: "2026-01-01" })).toBe(false);
    expect(itemTimed({ start: "legacy", end: "value" })).toBe(true);
    expect(itemTimed({ quarter: 0 })).toBe(true);
    expect(itemTimed({ quarter: false })).toBe(true);
    expect(itemTimed({ start: null, end: "value" })).toBe(false);
  });
});

describe("flow advice", () => {
  it("counts only outgoing next edges and clears advice at two arrows", () => {
    const doc = toDocument({ ...record, type: "flow", graph: { nodes: [{ id: "d", kind: "decision", label: "Ready?", propsJson: "{}" }, { id: "s", kind: "step", label: "Work", propsJson: "{}" }], edges: [
      { id: "in", from: "s", to: "d", kind: "next", propsJson: "{}" }, { id: "out", from: "d", to: "s", kind: "next", propsJson: "{}" },
    ] } });
    expect(flowChecks(doc)).toEqual(["Decision “Ready?” has fewer than two outgoing arrows."]);
    expect(flowChecks({ ...doc, relationships: [...doc.relationships, { ...doc.relationships[1]!, id: "second" }] })).toEqual([]);
  });
});
