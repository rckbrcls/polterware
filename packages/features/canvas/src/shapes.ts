import type { ArchNode } from "@polterware/frontend-canvas";
import { COMPONENTS, FAMILIES, component, family, structureKind } from "./components";
import { diamond, ellipse, rect, rounded, stadium } from "./outlines";

export type ShapeGroup = "General" | "Flowchart";
export type ShapeDefinition = {
  kind: string; label: string; group: ShapeGroup;
  /** An SVG path in a w×h box at the origin; open subpaths are stroke-only details. */
  path: (w: number, h: number) => string;
  geometry?: Partial<Pick<ArchNode, "width" | "height">>;
  labelBelow?: boolean;
  labelTop?: boolean;
  /** Line drawings: filling would close their open strokes into solid areas. */
  strokeOnly?: boolean;
};

/** Mirrors canvas.ShapeKinds in backend/domains/canvas/model.go, in palette order. */
export const SHAPES: readonly ShapeDefinition[] = [
  { kind: "rectangle", label: "Rectangle", group: "General", path: rect },
  { kind: "rounded", label: "Rounded rectangle", group: "General", path: rounded },
  { kind: "square", label: "Square", group: "General", path: rect, geometry: { width: 120, height: 120 } },
  { kind: "ellipse", label: "Ellipse", group: "General", path: ellipse },
  { kind: "circle", label: "Circle", group: "General", path: ellipse, geometry: { width: 120, height: 120 } },
  { kind: "diamond", label: "Diamond", group: "General", path: diamond, geometry: { width: 160, height: 120 } },
  { kind: "triangle", label: "Triangle", group: "General", path: (w, h) => `M${w / 2} 0L${w} ${h}H0Z`, geometry: { width: 140, height: 120 } },
  { kind: "hexagon", label: "Hexagon", group: "General", path: (w, h) => { const s = w * 0.2; return `M${s} 0H${w - s}L${w} ${h / 2}L${w - s} ${h}H${s}L0 ${h / 2}Z`; } },
  { kind: "parallelogram", label: "Parallelogram", group: "General", path: (w, h) => { const s = w * 0.2; return `M${s} 0H${w}L${w - s} ${h}H0Z`; } },
  { kind: "trapezoid", label: "Trapezoid", group: "General", path: (w, h) => { const s = w * 0.2; return `M${s} 0H${w - s}L${w} ${h}H0Z`; } },
  { kind: "cylinder", label: "Cylinder", group: "General", geometry: { width: 120, height: 140 }, path: (w, h) => {
    const ry = Math.min(h * 0.15, 16);
    return `M0 ${ry}A${w / 2} ${ry} 0 0 1 ${w} ${ry}V${h - ry}A${w / 2} ${ry} 0 0 1 0 ${h - ry}ZM0 ${ry}A${w / 2} ${ry} 0 0 0 ${w} ${ry}`;
  } },
  { kind: "cloud", label: "Cloud", group: "General", path: (w, h) =>
    `M${w * 0.25} ${h * 0.85}A${w * 0.2} ${h * 0.25} 0 0 1 ${w * 0.18} ${h * 0.38}A${w * 0.25} ${h * 0.3} 0 0 1 ${w * 0.55} ${h * 0.18}A${w * 0.22} ${h * 0.25} 0 0 1 ${w * 0.86} ${h * 0.42}A${w * 0.18} ${h * 0.22} 0 0 1 ${w * 0.78} ${h * 0.85}Z` },
  { kind: "document", label: "Document", group: "General", path: (w, h) => `M0 0H${w}V${h * 0.85}Q${w * 0.75} ${h * 0.7} ${w / 2} ${h * 0.85}T0 ${h * 0.85}Z` },
  { kind: "actor", label: "Actor", group: "General", labelBelow: true, strokeOnly: true, geometry: { width: 60, height: 110 }, path: (w, h) => {
    const r = Math.min(w, h) * 0.18; const cx = w / 2;
    return `M${cx - r} ${r}A${r} ${r} 0 1 0 ${cx + r} ${r}A${r} ${r} 0 1 0 ${cx - r} ${r}ZM${cx} ${2 * r}V${h * 0.65}M0 ${h * 0.4}H${w}M0 ${h}L${cx} ${h * 0.65}L${w} ${h}`;
  } },
  { kind: "callout", label: "Callout", group: "General", path: (w, h) => `M0 0H${w}V${h * 0.75}H${w * 0.45}L${w * 0.25} ${h}L${w * 0.3} ${h * 0.75}H0Z` },
  { kind: "frame", label: "Frame", group: "General", path: rounded, labelTop: true, geometry: { width: 440, height: 300 } },
  { kind: "process", label: "Process", group: "Flowchart", path: rect },
  { kind: "terminator", label: "Terminator", group: "Flowchart", path: stadium, geometry: { width: 180, height: 72 } },
  { kind: "predefined", label: "Predefined process", group: "Flowchart", path: (w, h) => `${rect(w, h)}M${w * 0.1} 0V${h}M${w * 0.9} 0V${h}` },
  { kind: "manual-input", label: "Manual input", group: "Flowchart", path: (w, h) => `M0 ${h * 0.25}L${w} 0V${h}H0Z` },
  { kind: "delay", label: "Delay", group: "Flowchart", path: (w, h) => `M0 0H${w * 0.6}A${w * 0.4} ${h / 2} 0 0 1 ${w * 0.6} ${h}H0Z` },
  { kind: "display", label: "Display", group: "Flowchart", path: (w, h) => `M${w * 0.15} 0H${w * 0.8}A${w * 0.2} ${h / 2} 0 0 1 ${w * 0.8} ${h}H${w * 0.15}L0 ${h / 2}Z` },
];
const byKind = new Map(SHAPES.map((shape) => [shape.kind, shape]));
export function shape(kind: string): ShapeDefinition | undefined { return byKind.get(kind); }
export const annotation = (kind: string) => kind === "note" || kind === "text";
/** Drawing shapes, notes and text carry no meaning and skip structural rules (canvas.isFreeform). */
export const freeform = (kind: string) => annotation(kind) || byKind.has(kind);

export type PaletteGroup = { id: string; title: string; kinds: string[] };
/**
 * One generic component per family, then the drawing library and annotations; kinds a newer core adds fall into Other.
 * System, domain and component nodes come only from the library's Project structure list, already linked to a real node.
 */
export function paletteGroups(palette: readonly string[]): PaletteGroup[] {
  const known = (kind: string) => freeform(kind) || !!component(kind) || structureKind(kind);
  const library = (group: ShapeGroup) => SHAPES.filter((item) => item.group === group && palette.includes(item.kind)).map((item) => item.kind);
  // A family's default type stands for it, or its first type the canvas allows.
  const components = FAMILIES.flatMap((item) => {
    const kinds = COMPONENTS.filter((entry) => entry.family === item.id && palette.includes(entry.kind)).map((entry) => entry.kind);
    return kinds.length ? [kinds.includes(item.kind) ? item.kind : kinds[0]!] : [];
  });
  return [
    { id: "components", title: "Components", kinds: components },
    { id: "general", title: "General", kinds: library("General") },
    { id: "flowchart", title: "Flowchart", kinds: library("Flowchart") },
    { id: "annotations", title: "Annotations", kinds: palette.filter(annotation) },
    { id: "other", title: "Other", kinds: palette.filter((kind) => !known(kind)) },
  ].filter((group) => group.kinds.length > 0);
}
/** Library entries: a component type is offered as its family's generic component. */
export function paletteLabel(kind: string): string { return family(kind)?.label ?? kindLabel(kind); }
/** Search text for a library entry; a family matches each of its types and technologies, so "redis" finds Storage. */
export function paletteSearchText(kind: string): string {
  const items = COMPONENTS.filter((item) => item.family === component(kind)?.family);
  return `${kind} ${paletteLabel(kind)} ${items.map((item) => `${item.kind} ${item.label} ${item.technologies.join(" ")}`).join(" ")}`.toLowerCase();
}
export function kindLabel(kind: string): string {
  const label = shape(kind)?.label ?? component(kind)?.label ?? kind.replace(/[-_]/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
