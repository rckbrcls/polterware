import type { CanvasGraph, CanvasRecord, GraphEdge, GraphNode } from "./model";

/** Marks a canvas drawn from the Structure tree, in its layout. */
export const STRUCTURE_CANVAS_SOURCE = "structure";
export const STRUCTURE_CANVAS_NAME = "Structure";

/** One Structure node as the drawing needs it; the store's order is the drawing's order. */
export type StructureSource = { id: string; parentId: string; level: string; title: string; status?: string };

type Rect = { x: number; y: number; width: number; height: number };
type Box = { node: StructureSource; width: number; height: number; children: Placed[] };
type Placed = { box: Box; x: number; y: number };

const CARD = { width: 220, height: 64 };
const EMPTY_GROUP = { width: 260, height: 120 };
/** Room for a group's own icon tile and title above its children. */
const PAD = { top: 64, side: 20, bottom: 20 };
const GAP = 16;
const COLUMNS = 3;

const canvasId = (nodeId: string) => `structure-${nodeId}`;

/** Children in rows of up to COLUMNS, each row as tall as its tallest child. */
function measure(node: StructureSource, children: Map<string, StructureSource[]>): Box {
  const kids = children.get(node.id) ?? [];
  if (node.level === "component") return { node, ...CARD, children: [] };
  if (!kids.length) return { node, ...EMPTY_GROUP, children: [] };
  // Loose components first, then domains, each in the store's order.
  const boxes = [...kids.filter((kid) => kid.level === "component"), ...kids.filter((kid) => kid.level !== "component")].map((kid) => measure(kid, children));
  const placed: Placed[] = [];
  let y = PAD.top;
  let width = 0;
  for (let start = 0; start < boxes.length; start += COLUMNS) {
    const row = boxes.slice(start, start + COLUMNS);
    let x = PAD.side;
    for (const box of row) {
      placed.push({ box, x, y });
      x += box.width + GAP;
    }
    width = Math.max(width, x - GAP + PAD.side);
    y += Math.max(...row.map((box) => box.height)) + GAP;
  }
  return { node, width, height: y - GAP + PAD.bottom, children: placed };
}

function flatten(box: Box, x: number, y: number, out: Array<{ node: StructureSource; rect: Rect }>) {
  out.push({ node: box.node, rect: { x, y, width: box.width, height: box.height } });
  for (const child of box.children) flatten(child.box, x + child.x, y + child.y, out);
}

function previousLayout(raw: string | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

/** Whether the canvas was drawn from the Structure tree. */
export function isStructureCanvas(canvas: Pick<CanvasRecord, "layoutJson">): boolean {
  return previousLayout(canvas.layoutJson).source === STRUCTURE_CANVAS_SOURCE;
}

/**
 * Draws the Structure tree as a canvas, the same way every time: the project's loose components
 * and then its domains in rows of three, and each domain as a group holding its components in rows
 * of three. Every drawn node cites its Structure node, so its title, kind,
 * and technology follow the tree. Redrawing keeps the edges between nodes that are still drawn and
 * every item someone added by hand; nodes that left the tree leave the drawing.
 */
export function drawStructure(nodes: readonly StructureSource[], previous?: Pick<CanvasRecord, "graph" | "layoutJson">): Pick<CanvasRecord, "graph" | "layoutJson"> {
  const live = nodes.filter((node) => node.status !== "removed");
  const known = new Set(live.map((node) => node.id));
  const children = new Map<string, StructureSource[]>();
  for (const node of live) {
    if (node.parentId && known.has(node.parentId)) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
    else if (!node.parentId) children.set("", [...(children.get("") ?? []), node]);
  }

  const drawn: Array<{ node: StructureSource; rect: Rect }> = [];
  // The project is not drawn: its children sit where a group's would, moved to the origin.
  const project = measure({ id: "", parentId: "", level: "project", title: "" }, children);
  for (const child of project.children) flatten(child.box, child.x - PAD.side, child.y - PAD.top, drawn);

  const drawnIds = new Set(drawn.map((item) => canvasId(item.node.id)));
  const layout = previousLayout(previous?.layoutJson);
  const previousRects = layout.nodes && typeof layout.nodes === "object" ? layout.nodes as Record<string, unknown> : {};
  // Hand-drawn items stay where they are; generated nodes of a removed Structure node go.
  const kept: GraphNode[] = (previous?.graph.nodes ?? []).filter((node) => !node.id.startsWith("structure-"));
  const ids = new Set([...drawnIds, ...kept.map((node) => node.id)]);
  const edges: GraphEdge[] = (previous?.graph.edges ?? []).filter((edge) => ids.has(edge.from) && ids.has(edge.to));

  const graph: CanvasGraph = {
    // Parents come first, so a group is painted under what it holds.
    nodes: [
      ...drawn.map(({ node }): GraphNode => ({ id: canvasId(node.id), kind: node.level, label: node.title, propsJson: "{}", ref: { kind: "node", id: node.id } })),
      ...kept,
    ],
    edges,
  };
  const width = Math.max(0, ...drawn.map((item) => item.rect.x + item.rect.width));
  const height = Math.max(0, ...drawn.map((item) => item.rect.y + item.rect.height));
  const zoom = drawn.length ? Math.min(1, Math.max(0.25, Math.min(1200 / width, 800 / height))) : 1;
  return {
    graph,
    layoutJson: JSON.stringify({
      ...layout, version: 1, source: STRUCTURE_CANVAS_SOURCE,
      viewport: { x: 40, y: 40, zoom: Math.round(zoom * 100) / 100 },
      nodes: {
        ...Object.fromEntries(kept.filter((node) => previousRects[node.id]).map((node) => [node.id, previousRects[node.id]])),
        ...Object.fromEntries(drawn.map(({ node, rect }) => [canvasId(node.id), rect])),
      },
    }),
  };
}
