import type { ArchitectureDocument } from "@polterware/frontend-canvas";
import { genericBehavior, type CanvasBehavior } from "./shared";

/** Advisory only: the core does not impose a minimum decision out-degree. */
export function flowChecks(doc: ArchitectureDocument): string[] {
  return doc.nodes.filter((node) => node.type === "decision" && doc.relationships.filter((edge) =>
    edge.sourceNodeId === node.id && edge.type === "next").length < 2)
    .map((node) => `Decision “${node.name || node.id}” has fewer than two outgoing arrows.`);
}
export const flow: CanvasBehavior = {
  ...genericBehavior,
  variant: (kind) => kind === "decision" ? "decision" : kind === "start" || kind === "end" ? "terminal" : genericBehavior.variant(kind),
  edgeStyle: () => ({ arrow: true }), hints: flowChecks,
  edgeFields: (sourceKind) => sourceKind === "decision" ? [{ key: "label", label: "Arrow label", kind: "text" }] : [],
  initialGeometry: (kind) => kind === "decision" ? { width: 240, height: 180 } : {},
};
