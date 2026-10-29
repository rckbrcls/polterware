import { Show, type JSX } from "solid-js";
import type { ArchNode } from "@polterware/frontend-canvas";
import { Box, Boxes, IconTile, Layers, type HugeiconComponent } from "@polterware/frontend-design-system";
import { componentIcons } from "./component-icons";
import { component, silhouette, structureKind } from "./components";
import { roundedBy } from "./outlines";
import { kindLabel, shape, type ShapeDefinition } from "./shapes";
import { fillTextToken, fillToken, readStyle, strokeToken, type ShapeStyle } from "./style";
import { propertyText, type NodeVariant } from "./types/shared";

const structureIcons: Readonly<Record<string, HugeiconComponent>> = { system: Boxes, domain: Layers, component: Box };
/** The sign a semantic card carries: its component type or its Structure level. */
export function nodeIcon(kind: string): HugeiconComponent | undefined { return componentIcons[kind] ?? structureIcons[kind]; }

/** One selection frame for every node kind: a rounded info-colored rim just outside the node. */
function SelectionFrame(props: { node: ArchNode }) {
  return <rect class="pw-canvas-selection" rx="8" ry="8" x={props.node.x - 3} y={props.node.y - 3} width={props.node.width + 6} height={props.node.height + 6} />;
}

/**
 * Components and Structure nodes are drawn in their family's silhouette as a flat face with one thin line: a cylinder
 * for storage, a hexagon for the edge, a dashed line for what is outside. The type is the icon tile; the subtitle names it and its technology.
 */
function SemanticCard(props: { node: ArchNode; selected: boolean; children: JSX.Element }) {
  const style = () => readStyle(props.node);
  const outline = () => silhouette(props.node.type)!;
  const inset = () => outline().inset(props.node.width, props.node.height);
  const technology = () => propertyText(props.node, "technology");
  const icon = () => nodeIcon(props.node.type) ?? Box;
  const subtitle = () => [component(props.node.type)?.label ?? kindLabel(props.node.type), technology()].filter(Boolean).join(" · ");
  return <g data-node-id={props.node.id} data-variant={structureKind(props.node.type) ? "structure" : "component"} data-kind={props.node.type} data-family={outline().id}>
    <ShapeSurface node={props.node} definition={outline()} style={style()} dashed={outline().dashed} />
    <Show when={outline().marks}>{(marks) => <path transform={`translate(${props.node.x} ${props.node.y})`} d={marks()(props.node.width, props.node.height)}
      fill={style().stroke === "neutral" ? "var(--tone-neutral-rim)" : strokeToken(style().stroke)} />}</Show>
    <foreignObject x={props.node.x + inset().left} y={props.node.y + inset().top}
      width={Math.max(0, props.node.width - inset().left - inset().right)} height={Math.max(0, props.node.height - inset().top - inset().bottom)}>
      <div class="pw-canvas-node-card" style={{ color: fillTextToken(style().fill) }}>
        <IconTile size={28} tone="architecture" brand={[technology(), props.node.type]} seed={props.node.id} class={outline().round ? "pw-icon-tile--circle" : undefined}>{icon()({ size: 16 })}</IconTile>
        <div class="pw-canvas-node-card-text">
          {props.children}
          <span class="pw-canvas-node-card-sub">{subtitle()}</span>
        </div>
      </div>
    </foreignObject>
    <Show when={props.selected}><SelectionFrame node={props.node} /></Show>
  </g>;
}

/**
 * Every outline, drawing shape or component silhouette, is a face just above the background with one thin line,
 * details included. A chosen fill, line color, width or pattern replaces those; `dashed` breaks the line by default.
 * The line keeps its width on screen, so a scaled-down drawing (zoom, gallery tile, minimap) does not lose it.
 */
function ShapeSurface(props: { node: ArchNode; definition: Pick<ShapeDefinition, "path" | "strokeOnly">; style: ShapeStyle; dashed?: boolean }) {
  const d = () => props.definition.path(props.node.width, props.node.height);
  // Only closed subpaths are filled: an open detail such as a cylinder's lid would close against its chord and punch a hole.
  const outline = () => d().split(/(?=M)/).filter((part) => /Z\s*$/i.test(part)).join("");
  const face = () => props.definition.strokeOnly ? "none" : props.style.fill === "neutral" ? "var(--color-surface)" : fillToken(props.style.fill);
  const line = () => props.style.stroke === "neutral" ? "var(--tone-neutral-rim)" : strokeToken(props.style.stroke);
  return <g transform={`translate(${props.node.x} ${props.node.y})`}>
    <path data-face d={outline()} fill={face()} />
    <path d={d()} fill="none" stroke={line()} stroke-width={props.style.strokeWidth} stroke-dasharray={props.style.dashed || props.dashed ? "6 4" : undefined}
      stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </g>;
}

const noteColor = (node: ArchNode) => propertyText(node, "color") || "yellow";
/** A sticky note: a borderless face in the note's color with its bottom-right corner folded up, creased in the note's ink. */
function StickyNoteSurface(props: { node: ArchNode }) {
  const fold = () => Math.min(18, props.node.width / 5, props.node.height / 5);
  const body = () => {
    const { width: w, height: h } = props.node; const f = fold(); const r = Math.min(4, f / 2);
    return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - f}L${w - f} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
  };
  const flap = () => { const { width: w, height: h } = props.node; const f = fold(); return `M${w} ${h - f}H${w - f}V${h}Z`; };
  return <g data-note transform={`translate(${props.node.x} ${props.node.y})`}>
    <path data-face d={body()} fill={fillToken(noteColor(props.node))} />
    <path d={flap()} fill={fillToken(noteColor(props.node))} stroke={fillTextToken(noteColor(props.node))} stroke-width="1" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </g>;
}

/** Drawing shapes draw their outline path; components and Structure nodes draw the semantic card. */
export function CanvasNode(props: { node: ArchNode; variant: NodeVariant; selected: boolean; children: JSX.Element }) {
  const outline = () => shape(props.node.type);
  const style = () => readStyle(props.node);
  const semantic = () => !!component(props.node.type) || structureKind(props.node.type);
  return <Show when={!semantic()} fallback={<SemanticCard node={props.node} selected={props.selected}>{props.children}</SemanticCard>}>
    <Show when={outline()} fallback={<g data-node-id={props.node.id} data-variant={props.variant}>
      <Show when={props.variant === "sticky"} fallback={<Show when={props.variant !== "text"}><ShapeSurface node={props.node} definition={{ path: roundedBy(8) }} style={style()} /></Show>}>
        <StickyNoteSurface node={props.node} />
      </Show>
      <foreignObject x={props.node.x} y={props.node.y} width={props.node.width} height={props.node.height}>
        <Show when={props.variant === "sticky"} fallback={<div class="flex h-full flex-col items-center justify-center gap-1 p-3">{props.children}</div>}>
          {/* The label is the note's title; the body is its own property. */}
          <div class="pw-canvas-note" style={{ color: fillTextToken(noteColor(props.node)) }}>
            <div class="pw-canvas-note-title">{props.children}</div>
            <Show when={propertyText(props.node, "body")}>{(body) => <p class="pw-canvas-note-body">{body()}</p>}</Show>
          </div>
        </Show>
      </foreignObject>
      <Show when={props.selected}><SelectionFrame node={props.node} /></Show>
    </g>}>{(definition) => <g data-node-id={props.node.id} data-variant="shape" data-shape={props.node.type}>
      <ShapeSurface node={props.node} definition={definition()} style={style()} />
      <Show when={props.selected}><SelectionFrame node={props.node} /></Show>
      <foreignObject x={props.node.x} y={definition().labelBelow ? props.node.y + props.node.height + 4 : props.node.y}
        width={props.node.width} height={definition().labelBelow ? 32 : props.node.height} overflow="visible">
        <div class="flex h-full flex-col gap-1 p-2" classList={{ "justify-start": definition().labelTop, "justify-center": !definition().labelTop }}
          style={{ color: definition().labelBelow ? "var(--color-text-primary)" : fillTextToken(style().fill) }}>
          {props.children}
        </div>
      </foreignObject>
    </g>}</Show>
  </Show>;
}
