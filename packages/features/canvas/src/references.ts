import type { ArchitectureDocument } from "@polterware/frontend-canvas";
import type { GraphNode } from "./model";

export type RefKind = "card" | "decision" | "fact" | "node" | "evidence";
/** A store record the canvas can reference. Structure nodes carry their component kind and technology. */
export type StoreEntity = { kind: RefKind; id: string; title: string; slug?: string; level?: string; componentKind?: string; tech?: string };
/** What a canvas node shows from the Structure node it references. */
export type LinkedFacts = { kind?: string; tech?: string };
export type CanvasRef = NonNullable<GraphNode["ref"]>;
export const kindLabel = (kind: string) => ({ card: "Work card", decision: "Decision", fact: "Fact", node: "Structure", evidence: "Evidence" })[kind] ?? kind;
export function buildRef(entity: StoreEntity): CanvasRef {
  if (!entity.id.trim()) throw new Error("A store entity ID is required.");
  return { kind: entity.kind, id: entity.id };
}
export function readRef(node: { metadata?: Record<string, unknown> }): CanvasRef | undefined {
  return node.metadata?.refJson ? JSON.parse(String(node.metadata.refJson)) as CanvasRef : undefined;
}
export function referenceState(ref: CanvasRef | undefined, entities: readonly StoreEntity[]) {
  const entity = ref && entities.find((entity) => entity.kind === ref.kind && entity.id === ref.id);
  return entity ? { trust: "referenced" as const, title: entity.title, entity }
    : { trust: "unverified" as const, title: ref ? `Missing ${kindLabel(ref.kind)} (${ref.id})` : "Unverified", entity: undefined };
}
export function setReference(doc: ArchitectureDocument, id: string, ref?: CanvasRef): ArchitectureDocument {
  return { ...doc, nodes: doc.nodes.map((node) => {
    if (node.id !== id) return node;
    const { refJson: _previous, ...metadata } = node.metadata ?? {};
    return { ...node, metadata: { ...metadata, ...(ref ? { refJson: JSON.stringify(ref) } : {}) } };
  }) };
}
export function canPromote(node: { type: string; metadata?: Record<string, unknown> }) {
  return !readRef(node) && ["note", "text", "rectangle", "ellipse", "shape"].includes(node.type);
}
/** A referenced Structure node's kind and technology win over the canvas props, like its title wins over the label. */
export function linkedFacts(node: { metadata?: Record<string, unknown> }, entities: readonly StoreEntity[]): LinkedFacts | undefined {
  const ref = readRef(node);
  if (ref?.kind !== "node") return undefined;
  const entity = entities.find((item) => item.kind === "node" && item.id === ref.id);
  if (!entity?.componentKind && !entity?.tech) return undefined;
  return { kind: entity.componentKind || undefined, tech: entity.tech || undefined };
}
export function structureEntities(entities: readonly StoreEntity[]): StoreEntity[] {
  return entities.filter((entity) => entity.kind === "node" && ["system", "domain", "component"].includes(entity.level ?? ""));
}
