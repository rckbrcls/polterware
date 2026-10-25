import type { ArchitectureDocument } from "@polterware/frontend-canvas";
import { annotation, genericBehavior, properties, propertyText, withProperties, type CanvasBehavior } from "./shared";

const DAY = 86_400_000;
export const ROADMAP_TIME_X = 240;
export function dateDay(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return;
  return time / DAY;
}
export function dateToX(value: unknown, origin: string, pixelsPerDay = 8): number | undefined {
  const day = dateDay(value); const first = dateDay(origin);
  return day === undefined || first === undefined ? undefined : ROADMAP_TIME_X + (day - first) * pixelsPerDay;
}
export function currentQuarter(now = new Date()): string {
  return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
}
/** Match itemTimed/propSet in validate.go, preserving values from other clients. */
export function itemTimed(props: Record<string, unknown>): boolean {
  const set = (value: unknown) => value !== undefined && value !== null && (typeof value !== "string" || !!value.trim());
  return set(props.quarter) || (set(props.start) && set(props.end));
}

/** Stable lane order and UTC dates keep layout deterministic across time zones. */
export function laneLayout(doc: ArchitectureDocument): ArchitectureDocument {
  const lanes = doc.nodes.filter((node) => node.type === "lane");
  const members = doc.nodes.filter((node) => node.type === "item" || node.type === "milestone");
  const dates = members.flatMap((node) => [propertyText(node, "start"), propertyText(node, "end")]).filter((value) => dateDay(value) !== undefined).sort();
  const origin = dates[0];
  const rows = new Map<string, { y: number; height: number; count: number }>();
  let y = 0;
  for (const id of [...lanes.map((node) => node.id), ""]) {
    const count = members.filter((node) => {
      const lane = propertyText(node, "lane");
      return (lanes.some((item) => item.id === lane) ? lane : "") === id;
    }).length;
    const height = Math.max(160, 56 + count * 112);
    rows.set(id, { y, height, count: 0 }); y += height + 24;
  }
  const positions = new Map(members.map((node) => {
    const lane = propertyText(node, "lane");
    const row = rows.get(lane) ?? rows.get("")!;
    const start = origin ? dateToX(propertyText(node, "start"), origin) : undefined;
    const end = origin ? dateToX(propertyText(node, "end"), origin) : undefined;
    const width = start !== undefined && end !== undefined ? Math.max(80, end - start + 8) : node.width;
    const x = start ?? (end === undefined ? Math.max(ROADMAP_TIME_X, node.x) : end - width + 8);
    const next = { ...node, x, y: row.y + 48 + row.count++ * 112, width, height: 100, zIndex: Math.max(1, node.zIndex) };
    return [node.id, next] as const;
  }));
  const width = Math.max(960, ...[...positions.values()].map((node) => node.x + node.width + 32));
  return { ...doc, nodes: doc.nodes.map((node) => node.type === "lane"
    ? { ...node, x: 0, y: rows.get(node.id)!.y, width, height: rows.get(node.id)!.height, zIndex: -1 }
    : positions.get(node.id) ?? node) };
}

/** Dropping onto a lane updates the semantic membership before snapping. */
export function snapLanes(doc: ArchitectureDocument, movedIds: readonly string[]): ArchitectureDocument {
  const lanes = laneLayout(doc).nodes.filter((node) => node.type === "lane");
  return laneLayout({ ...doc, nodes: doc.nodes.map((node) => {
    if (!movedIds.includes(node.id) || (node.type !== "item" && node.type !== "milestone")) return node;
    const lane = lanes.find((lane) => node.y + node.height / 2 >= lane.y && node.y + node.height / 2 < lane.y + lane.height);
    return withProperties(node, { ...properties(node), lane: lane?.id ?? "" });
  }) });
}
export const roadmap: CanvasBehavior = {
  ...genericBehavior, layout: laneLayout, drop: snapLanes,
  variant: (kind) => kind === "lane" ? "lane" : kind === "milestone" ? "milestone" : genericBehavior.variant(kind),
  edgeStyle: (kind) => ({ arrow: true, dashed: kind === "depends_on" }),
  fields: (kind) => annotation(kind) ? [] : [
    ...(kind === "lane" ? [] : [{ key: "lane", label: "Lane", kind: "lane" } as const,
      { key: "start", label: "Start date", kind: "date" } as const, { key: "end", label: "End date", kind: "date" } as const,
      { key: "quarter", label: "Quarter", kind: "text" } as const]),
    { key: "status", label: "Status", kind: "text" },
  ],
  defaults: (kind, now) => kind === "item" ? { quarter: currentQuarter(now) } : {},
};
