import { describe, expect, it } from "vitest";
import { commit, createHistory, historyUndo, historyRedo, hitTest, layoutSync, moveNodes, screenToDocument, setNodePositions, updateNode, zoomAt } from "@polterware/frontend-canvas";
import { connectNodes, edgePalette, insertNode, nodePalette, readCanvas, readTypes, removeSelection, resizeNode, serializeCanvas, toDocument, type CanvasRecord, type CanvasType } from "./model";
import { SHAPES } from "./shapes";

const free: CanvasType = { type: "free", label: "Free", nodeKinds: ["note", "text"], edgeKinds: [], rules: [], unrestricted: true };
const brainstorm: CanvasType = { type: "brainstorm", label: "Brainstorm", nodeKinds: ["idea", "group", "note", "text"], edgeKinds: ["relates", "contains"], rules: [], unrestricted: false };
const record: CanvasRecord = { id: "canvas", projectId: "project", name: "Sketch", type: "free", agentVisible: false,
  scopeNodeId: "", updatedAt: "", graph: { nodes: [], edges: [] }, layoutJson: "{}" };
function twoNodes() {
  let doc = insertNode(toDocument(record), free, "rectangle", { x: 0, y: 0 }, "a");
  return insertNode(doc, free, "ellipse", { x: 300, y: 100 }, "b");
}
describe("canvas graph and layout", () => {
  it("builds palettes from the server definition and allows free edges", () => {
    expect(nodePalette(free)).toEqual([...SHAPES.map((item) => item.kind), "note", "text"]);
    expect(nodePalette(brainstorm)).toEqual(brainstorm.nodeKinds);
    expect(edgePalette(brainstorm)).toEqual(["relates", "contains"]);
    expect(() => insertNode(twoNodes(), brainstorm, "ellipse", { x: 0, y: 0 }, "bad")).toThrow("not allowed");
    expect(connectNodes(twoNodes(), free, "a", "b", "custom_relation", "ab").relationships[0]?.type).toBe("custom_relation");
    expect(() => connectNodes(twoNodes(), brainstorm, "a", "b", "next", "ab")).toThrow("allowed edge");
    expect(() => connectNodes(twoNodes(), free, "missing", "b", "relates", "ab")).toThrow("existing nodes");
  });
  it("round-trips semantic properties, references, and unknown layout without mixing geometry into the graph", () => {
    const original = { ...record, graph: { nodes: [{ id: "a", kind: "note", label: "Evidence", propsJson: '{"nested":{"value":42}}', ref: { kind: "fact", id: "fact-1" } }], edges: [] },
      layoutJson: '{"groups":["group-1"],"nodes":{"a":{"x":120,"y":50,"width":200,"height":80,"future":true}},"viewport":{"x":8,"y":9,"zoom":1.2}}' };
    const doc = toDocument(original);
    expect(doc.nodes[0]).toMatchObject({ x: 120, y: 50, width: 200, height: 80 });
    const serialized = serializeCanvas(doc, original.layoutJson);
    expect(serialized.graph).toEqual(original.graph);
    expect(JSON.parse(serialized.layoutJson)).toMatchObject({ groups: ["group-1"], nodes: { a: { x: 120, future: true } }, viewport: { zoom: 1.2 } });
    expect(serialized.graph.nodes[0]).not.toHaveProperty("x");
    expect(toDocument({ ...record, ...serialized }).nodes).toEqual(doc.nodes);
  });
  it("keeps graph geometry separate when moving, resizing, arranging and deleting", () => {
    const connected = connectNodes(twoNodes(), free, "a", "b", "relates", "ab");
    const before = serializeCanvas(connected).graph;
    let doc = moveNodes(connected, new Map([["a", { dx: 25, dy: -12 }]]));
    doc = resizeNode(doc, "a", -10, 10);
    expect(doc.nodes[0]).toMatchObject({ x: 25, y: -12, width: 80, height: 48 });
    const layout = layoutSync({ nodes: doc.nodes, mode: "horizontal" });
    doc = setNodePositions(doc, new Map(layout.nodes.map((node) => [node.id, node])));
    expect(serializeCanvas(doc).graph).toEqual(before);
    doc = removeSelection(doc, { nodeIds: ["a"], relationshipIds: [], boundaryIds: [] });
    expect(doc.nodes.map((node) => node.id)).toEqual(["b"]);
    expect(doc.relationships).toEqual([]);
    expect(Object.keys(JSON.parse(serializeCanvas(doc).layoutJson).nodes)).toEqual(["b"]);
  });
  it("uses library viewport and hit testing with an invariant zoom focal point", () => {
    const doc = twoNodes(); const focal = { x: 70, y: 80 };
    const next = zoomAt(doc.viewport, focal, 2);
    expect(screenToDocument(next, focal)).toEqual(screenToDocument(doc.viewport, focal));
    expect(hitTest(doc, { x: 30, y: 30 }, { showPorts: false })).toEqual({ kind: "node", id: "a" });
  });
  it("undoes a grouped label edit and redoes it without losing edge semantics", () => {
    const doc = connectNodes(twoNodes(), free, "a", "b", "custom", "ab");
    const first = commit(createHistory(), doc, updateNode(doc, "a", { name: "First" }), "eventually");
    const second = commit(first.history, first.doc, updateNode(first.doc, "a", { name: "Second" }), "immediately");
    const undone = historyUndo(second.history, second.doc);
    expect(serializeCanvas(undone.doc).graph).toEqual(serializeCanvas(doc).graph);
    const redone = historyRedo(undone.history, undone.doc);
    expect(redone.doc.nodes[0]?.name).toBe("Second");
    expect(serializeCanvas(redone.doc).graph.edges[0]).toEqual({ id: "ab", from: "a", to: "b", kind: "custom", propsJson: "{}" });
  });
  it("surfaces malformed stored layout rather than silently replacing it", () => {
    expect(() => toDocument({ ...record, layoutJson: "not json" })).toThrow();
    expect(() => readCanvas({})).toThrow("no canvas");
    expect(readCanvas({ id: "canvas" }).graph).toEqual({ nodes: [], edges: [] });
    expect(readTypes({ types: [free] })).toEqual([free]);
    expect(readTypes({})).toEqual([]);
  });
});
