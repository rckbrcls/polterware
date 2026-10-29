import { component, silhouette } from "../components";
import { allowedBehavior, genericBehavior, type CanvasBehavior } from "./shared";
import type { CanvasType } from "../model";

const unarrowed = new Set(["relates"]);
const dashed = new Set(["depends_on", "contains"]);

/** The one generalist canvas: semantic components, Structure nodes, drawing shapes, notes and text. */
export const canvasDefaults: CanvasBehavior = {
  ...genericBehavior, structureReferences: true,
  variant: (kind) => kind === "note" ? "sticky" : component(kind) ? "component" : genericBehavior.variant(kind),
  edgeStyle: (kind) => ({ arrow: !unarrowed.has(kind), dashed: dashed.has(kind) }),
  edgeFields: () => [{ key: "label", label: "Label", kind: "text" }],
  fields: () => [],
  defaults: (kind) => kind === "note" ? { color: "yellow" }
    : kind === "frame" ? { style: { fill: "none", dashed: true, textAlign: "left", bold: true } } : {},
  initialGeometry: (kind) => kind === "frame" ? { width: 440, height: 300, zIndex: -1 }
    : kind === "note" ? { width: 200, height: 160 }
    : silhouette(kind)?.geometry ?? {},
};
export function canvasBehavior(definition: CanvasType) {
  return allowedBehavior(canvasDefaults, definition);
}
/** Frames sit behind edges and other shapes. */
export const backdrop = (kind: string) => kind === "frame";
