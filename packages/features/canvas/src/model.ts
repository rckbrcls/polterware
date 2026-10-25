import {
  createEmptyDocument, docAddNode, updateNode, addRelationship, deleteSelection,
  type ArchitectureDocument, type Point, type SelectionState,
} from "@polterware/frontend-canvas";

/** Wire shape from CanvasService: semantic props never contain geometry. */
export type GraphNode = { id: string; kind: string; label: string; propsJson: string; ref?: { kind: string; id: string } };
export type GraphEdge = { id: string; from: string; to: string; kind: string; propsJson: string };
export type CanvasGraph = { nodes: GraphNode[]; edges: GraphEdge[] };
export type CanvasRecord = {
  id: string; projectId: string; name: string; type: string; agentVisible: boolean;
  graph: CanvasGraph; layoutJson: string; scopeNodeId: string; updatedAt: string;
};
export type CanvasType = {
  type: string; label: string; nodeKinds: string[]; edgeKinds: string[];
  rules: string[]; unrestricted: boolean;
};
export type CanvasPatch = Partial<Pick<CanvasRecord, "name" | "agentVisible" | "graph" | "layoutJson">>;
export type CanvasPort = {
  list(projectId: string): Promise<CanvasRecord[]>;
  get(projectId: string, id: string): Promise<CanvasRecord>;
  types(): Promise<CanvasType[]>;
  create(projectId: string, name: string, type: string): Promise<CanvasRecord>;
  update(projectId: string, id: string, patch: CanvasPatch): Promise<CanvasRecord>;
  remove(projectId: string, id: string): Promise<void>;
  promote?(projectId: string, input: import("./promotion").PromotionInput): Promise<import("./references").StoreEntity>;
};

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a canvas JSON object.");
  return value as ObjectValue;
}
function jsonObject(raw: string): ObjectValue { return object(JSON.parse(raw || "{}")); }
function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
export function readCanvas(value: unknown): CanvasRecord {
  const item = object(value);
  if (typeof item.id !== "string" || !item.id) throw new Error("The core returned no canvas.");
  const graph = item.graph ? object(item.graph) : {};
  return {
    id: item.id, projectId: String(item.projectId ?? ""), name: String(item.name ?? ""),
    type: String(item.type ?? ""), agentVisible: item.agentVisible === true,
    graph: {
      nodes: Array.isArray(graph.nodes) ? graph.nodes.map((value) => {
        const node = object(value);
        const ref = node.ref ? object(node.ref) : undefined;
        return { id: String(node.id), kind: String(node.kind), label: String(node.label ?? ""),
          propsJson: String(node.propsJson || "{}"), ...(ref ? { ref: { kind: String(ref.kind), id: String(ref.id) } } : {}) };
      }) : [],
      edges: Array.isArray(graph.edges) ? graph.edges.map((value) => {
        const edge = object(value);
        return { id: String(edge.id), from: String(edge.from), to: String(edge.to), kind: String(edge.kind), propsJson: String(edge.propsJson || "{}") };
      }) : [],
    },
    layoutJson: String(item.layoutJson || "{}"), scopeNodeId: String(item.scopeNodeId ?? ""), updatedAt: String(item.updatedAt ?? ""),
  };
}
export function readTypes(value: unknown): CanvasType[] {
  const response = object(value);
  if (!Array.isArray(response.types)) return [];
  const strings = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
  return response.types.map((value) => {
    const type = object(value);
    return { type: String(type.type), label: String(type.label), nodeKinds: strings(type.nodeKinds),
      edgeKinds: strings(type.edgeKinds), rules: strings(type.rules), unrestricted: type.unrestricted === true };
  });
}

export function nodePalette(type: CanvasType): string[] {
  return [...new Set([...(type.unrestricted ? ["rectangle", "ellipse"] : []), ...type.nodeKinds])];
}
export function edgePalette(type: CanvasType): string[] {
  return type.unrestricted ? [...new Set(["relates", ...type.edgeKinds])] : type.edgeKinds;
}

/** Adapt the service's property graph to the library's generic document model. */
export function toDocument(canvas: CanvasRecord): ArchitectureDocument {
  const layout = jsonObject(canvas.layoutJson);
  const positions = layout.nodes ? object(layout.nodes) : {};
  const viewport = layout.viewport ? object(layout.viewport) : {};
  const doc = createEmptyDocument({ id: canvas.id, systemId: canvas.projectId });
  doc.viewport = { x: finite(viewport.x, 40), y: finite(viewport.y, 40), zoom: Math.min(2.5, Math.max(0.25, finite(viewport.zoom, 1))) };
  doc.nodes = canvas.graph.nodes.map((node, index) => {
    const position = positions[node.id] ? object(positions[node.id]) : {};
    return {
      id: node.id, name: node.label, type: node.kind, origin: "manual", state: "unknown",
      x: finite(position.x, (index % 4) * 220), y: finite(position.y, Math.floor(index / 4) * 150),
      width: Math.max(80, finite(position.width, 180)), height: Math.max(48, finite(position.height, 100)),
      zIndex: index, metadata: { propsJson: node.propsJson, ...(node.ref ? { refJson: JSON.stringify(node.ref) } : {}) },
    };
  });
  doc.relationships = canvas.graph.edges.map((edge) => ({
    id: edge.id, sourceNodeId: edge.from, targetNodeId: edge.to, type: edge.kind,
    direction: "forward", metadata: { propsJson: edge.propsJson },
  }));
  return doc;
}

/** Keep unknown layout fields and reference/props payloads when editing existing canvases. */
export function serializeCanvas(doc: ArchitectureDocument, originalLayout = "{}"): Pick<CanvasRecord, "graph" | "layoutJson"> {
  const previous = jsonObject(originalLayout);
  const previousNodes = previous.nodes ? object(previous.nodes) : {};
  return {
    graph: {
      nodes: doc.nodes.map((node) => ({
        id: node.id, kind: node.type, label: node.name, propsJson: String(node.metadata?.propsJson || "{}"),
        ...(node.metadata?.refJson ? { ref: JSON.parse(String(node.metadata.refJson)) as GraphNode["ref"] } : {}),
      })),
      edges: doc.relationships.map((edge) => ({ id: edge.id, from: edge.sourceNodeId, to: edge.targetNodeId,
        kind: edge.type, propsJson: String(edge.metadata?.propsJson || "{}") })),
    },
    layoutJson: JSON.stringify({ ...previous, version: 1, viewport: doc.viewport,
      nodes: Object.fromEntries(doc.nodes.map((node) => [node.id, {
        ...(previousNodes[node.id] ? object(previousNodes[node.id]) : {}),
        x: node.x, y: node.y, width: node.width, height: node.height,
      }])) }),
  };
}

export function insertNode(doc: ArchitectureDocument, type: CanvasType, kind: string, point: Point, id: string): ArchitectureDocument {
  if (!nodePalette(type).includes(kind)) throw new Error(`Shape ${kind} is not allowed on this canvas.`);
  return docAddNode(doc, { id, name: kind === "note" ? "New note" : "New " + kind, type: kind,
    origin: "manual", state: "unknown", ...point, width: 180, height: 100, zIndex: doc.nodes.length,
    metadata: { propsJson: "{}" } });
}
export function connectNodes(doc: ArchitectureDocument, type: CanvasType, from: string, to: string, kind: string, id: string): ArchitectureDocument {
  if (!kind.trim() || (!type.unrestricted && !type.edgeKinds.includes(kind))) throw new Error("Choose an allowed edge type.");
  if (!doc.nodes.some((n) => n.id === from) || !doc.nodes.some((n) => n.id === to)) throw new Error("Choose two existing nodes.");
  const next = addRelationship(doc, { sourceNodeId: from, targetNodeId: to, type: kind.trim() });
  return { ...next, relationships: next.relationships.map((edge, index) => index === next.relationships.length - 1
    ? { ...edge, id, metadata: { propsJson: "{}" } } : edge) };
}
export function resizeNode(doc: ArchitectureDocument, id: string, width: number, height: number): ArchitectureDocument {
  return updateNode(doc, id, { width: Math.max(80, width), height: Math.max(48, height) });
}
export function removeSelection(doc: ArchitectureDocument, selection: SelectionState): ArchitectureDocument {
  return deleteSelection(doc, selection);
}
