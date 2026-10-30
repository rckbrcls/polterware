import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => Object.defineProperty(window, "matchMedia", { configurable: true, writable: true,
  value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }));
import type { CanvasType } from "../model";
import { backdrop, canvasBehavior } from "./index";
import { colorToken } from "../style";
import { structureEntities } from "../references";
import { COMPONENTS, FAMILIES, component, family, silhouette, structureKind } from "../components";
import { componentIcons } from "../component-icons";
import { SHAPES, freeform, kindLabel, paletteGroups, paletteLabel } from "../shapes";

const shapes = SHAPES.map((item) => item.kind);
const components = COMPONENTS.map((item) => item.kind);
const definition = (nodeKinds: string[], edgeKinds: string[] = ["relates"]): CanvasType => ({ type: "canvas", label: "Canvas", nodeKinds, edgeKinds, rules: [], unrestricted: false });
const canvas = definition([...components, "domain", "component", ...shapes, "note", "text"], ["relates", "flows", "calls", "depends_on", "contains"]);

describe("generalist canvas behavior", () => {
  it("keeps the palette constrained by the live definition, including future server changes", () => {
    const behavior = canvasBehavior(definition(["database", "note", "future_node"], ["future_edge"]));
    expect(behavior.palette()).toEqual(["database", "note", "future_node"]);
    expect(behavior.edges()).toEqual(["future_edge"]);
    expect(behavior.structureReferences).toBe(true);
  });
  it("renders components as cards, notes as sticky notes, and styles edges by kind", () => {
    const behavior = canvasBehavior(canvas);
    expect(behavior.variant("database")).toBe("component");
    expect(behavior.variant("note")).toBe("sticky");
    expect(behavior.variant("text")).toBe("text");
    expect(behavior.variant("rectangle")).toBe("card");
    expect(behavior.defaults("note")).toEqual({ color: "yellow" });
    // A note's color and body are edited in the inspector's Text tab, not as generic fields.
    expect(behavior.fields("note")).toEqual([]);
    expect(behavior.edgeStyle("relates")).toEqual({ arrow: false, dashed: false });
    expect(behavior.edgeStyle("calls")).toEqual({ arrow: true, dashed: false });
    expect(behavior.edgeStyle("depends_on")).toEqual({ arrow: true, dashed: true });
    expect(behavior.edgeFields("service").map((field) => field.key)).toEqual(["label"]);
    expect(behavior.initialGeometry?.("frame")).toMatchObject({ zIndex: -1 });
    expect(backdrop("frame")).toBe(true); expect(backdrop("database")).toBe(false);
  });
  it("groups components, Structure, the drawing library, annotations and newer kinds", () => {
    const groups = paletteGroups([...canvas.nodeKinds, "spaceship"]);
    expect(groups.map((group) => group.id)).toEqual(["components", "general", "flowchart", "annotations", "other"]);
    // One generic component per family; the type is picked in the inspector.
    expect(groups.find((group) => group.id === "components")!.kinds).toEqual(FAMILIES.map((item) => item.kind));
    expect(paletteGroups(["database", "cache"]).find((group) => group.id === "components")!.kinds).toEqual(["database"]);
    expect(paletteGroups(["cache", "stream"]).find((group) => group.id === "components")!.kinds).toEqual(["cache", "stream"]);
    // Structure nodes are added from real project nodes, never as blank tiles.
    expect(groups.flatMap((group) => group.kinds).some(structureKind)).toBe(false);
    expect(groups.find((group) => group.id === "annotations")!.kinds).toEqual(["note", "text"]);
    expect(groups.find((group) => group.id === "other")!.kinds).toEqual(["spaceship"]);
    expect(groups.flatMap((group) => group.id === "general" || group.id === "flowchart" ? group.kinds : [])).toEqual(shapes);
  });
  it("separates meaning from drawing: components are not freeform and only Structure kinds need a ref", () => {
    expect(shapes.every(freeform)).toBe(true);
    expect(components.some(freeform)).toBe(false);
    expect(components.some(structureKind)).toBe(false);
    expect(["domain", "component"].every(structureKind)).toBe(true);
    expect(structureKind("system")).toBe(false);
    expect(component("cache")?.technologies).toContain("Redis");
    expect(paletteLabel("database")).toBe("Storage");
    expect(paletteLabel("llm")).toBe("AI");
    // Moved types follow their new family; new types mirror canvas.ComponentKinds.
    expect(["auth", "monitoring", "scheduler", "agent", "mcp", "dataset"].map((kind) => family(kind)?.id)).toEqual(["security", "observability", "workflow", "ai", "ai", "document"]);
    // Every type has a family, and each family's default type is one of its own.
    expect(components.every((kind) => family(kind))).toBe(true);
    expect(FAMILIES.every((item) => family(item.kind)?.id === item.id)).toBe(true);
    expect(silhouette("domain")?.id).toBe("compute");
    expect(kindLabel("frontend")).toBe("Web app");
    expect(kindLabel("depends_on")).toBe("Depends on");
    expect(new Set(components).size).toBe(components.length);
    expect(Object.keys(componentIcons).sort()).toEqual([...components].sort());
  });
  it("accepts only semantic color tags and lists loaded Structure levels", () => {
    expect(colorToken("red")).toBe("var(--color-danger)");
    expect(colorToken("#fff")).toBe("var(--color-text-muted)");
    expect(colorToken("__proto__")).toBe("var(--color-text-muted)");
    expect(structureEntities([
      { kind: "node", id: "a", level: "system", title: "A" }, { kind: "node", id: "b", level: "domain", title: "B" },
      { kind: "node", id: "c", level: "component", title: "C" }, { kind: "node", id: "d", level: "other", title: "D" },
      { kind: "card", id: "e", title: "E" },
    ]).map((entity) => entity.id)).toEqual(["b", "c"]);
  });
});
