import type { ArchNode, Relationship } from "@polterware/frontend-canvas";
import { edgePalette, nodePalette, type CanvasType } from "../model";

export type NodeVariant = "card" | "text" | "sticky" | "component";
export type InspectorField = { key: string; label: string; kind: "text" | "color" };
export type CanvasBehavior = {
  palette: typeof nodePalette;
  edges: typeof edgePalette;
  variant: (kind: string) => NodeVariant;
  edgeStyle: (kind: string) => { arrow: boolean; dashed?: boolean };
  edgeFields: (sourceKind: string) => readonly InspectorField[];
  fields: (kind: string) => readonly InspectorField[];
  defaults: (kind: string) => Record<string, unknown>;
  initialGeometry?: (kind: string) => Partial<Pick<ArchNode, "width" | "height" | "zIndex">>;
  structureReferences?: boolean;
};
export const genericBehavior: CanvasBehavior = {
  palette: nodePalette, edges: edgePalette,
  variant: (kind) => kind === "text" ? "text" : "card",
  edgeStyle: () => ({ arrow: false }), edgeFields: () => [], fields: () => [], defaults: () => ({}),
};
export { annotation, freeform } from "../shapes";
export function properties(item: Pick<ArchNode | Relationship, "metadata">): Record<string, unknown> {
  const value: unknown = JSON.parse(String(item.metadata?.propsJson || "{}"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected canvas properties to be an object.");
  return value as Record<string, unknown>;
}
export function withProperties<T extends Pick<ArchNode | Relationship, "metadata">>(item: T, props: Record<string, unknown>): T {
  return { ...item, metadata: { ...item.metadata, propsJson: JSON.stringify(props) } };
}
export function propertyText(item: Pick<ArchNode | Relationship, "metadata">, key: string): string {
  const value = properties(item)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
/** Definitions remain authoritative, including additions reported by a newer core. */
export function allowedBehavior(behavior: CanvasBehavior, definition: CanvasType) {
  return { ...behavior, palette: () => behavior.palette(definition), edges: () => behavior.edges(definition) };
}
