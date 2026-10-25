import { describe, expect, it } from "vitest";
import { buildRef, canPromote, readRef, referenceState, setReference, type StoreEntity } from "./references";
import { toDocument, serializeCanvas, type CanvasRecord } from "./model";
const entity: StoreEntity = { kind: "card", id: "store-id", title: "Store title", slug: "store-title" };
const canvas: CanvasRecord = { id: "c", projectId: "p", name: "Sketch", type: "free", agentVisible: false, scopeNodeId: "", updatedAt: "", layoutJson: "{}", graph: { nodes: [{ id: "a", kind: "note", label: "Local label", propsJson: '{"unknown":true}' }], edges: [] } };
describe("store references", () => {
  it("uses entity kind and real ID, preserves props and label, and removes the ref on unlink", () => {
    const doc = toDocument(canvas);
    const linked = setReference(doc, "a", buildRef(entity));
    expect(serializeCanvas(linked).graph.nodes[0]).toEqual({ ...canvas.graph.nodes[0], ref: { kind: "card", id: "store-id" } });
    expect(readRef(linked.nodes[0]!)).toEqual({ kind: "card", id: "store-id" });
    expect(serializeCanvas(setReference(linked, "a")).graph).toEqual(canvas.graph);
    expect(doc.nodes[0]?.metadata?.refJson).toBeUndefined();
  });
  it("syncs names by kind and ID, detects deletion, and recovers when data reloads", () => {
    const ref = buildRef(entity);
    expect(referenceState(ref, [entity]).title).toBe("Store title");
    expect(referenceState(ref, [{ ...entity, title: "Renamed" }]).title).toBe("Renamed");
    expect(referenceState(ref, [{ ...entity, kind: "fact" }]).trust).toBe("unverified");
    expect(referenceState(ref, []).title).toContain("Missing Work card");
    expect(referenceState(ref, [entity]).trust).toBe("referenced");
    expect(referenceState(undefined, [entity]).trust).toBe("unverified");
    expect(() => buildRef({ ...entity, id: "" })).toThrow("ID");
  });
  it("only promotes explicit unreferenced notes, text and free shapes", () => {
    for (const type of ["note", "text", "rectangle", "ellipse", "shape"]) expect(canPromote({ type })).toBe(true);
    expect(canPromote({ type: "component" })).toBe(false);
    expect(canPromote({ type: "note", metadata: { refJson: JSON.stringify(buildRef(entity)) } })).toBe(false);
  });
});
