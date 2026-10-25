import { Show, type JSX } from "solid-js";
import type { ArchNode } from "@polterware/frontend-canvas";
import { Card, StatusChip, StickyNote } from "@polterware/frontend-design-system";
import { colorToken } from "./types/brainstorm";
import { propertyText, type NodeVariant } from "./types/shared";

export function CanvasNode(props: { node: ArchNode; variant: NodeVariant; selected: boolean; roadmap: boolean; children: JSX.Element }) {
  const diamond = () => props.variant === "decision" || props.variant === "milestone";
  const round = () => props.variant === "ellipse" || props.variant === "terminal";
  const geometric = () => diamond() || round();
  const stroke = () => props.selected ? "var(--color-text-primary)" : "var(--color-border-subtle)";
  return <g data-node-id={props.node.id} data-variant={props.variant}>
    <Show when={diamond()}><polygon points={`${props.node.x + props.node.width / 2},${props.node.y} ${props.node.x + props.node.width},${props.node.y + props.node.height / 2} ${props.node.x + props.node.width / 2},${props.node.y + props.node.height} ${props.node.x},${props.node.y + props.node.height / 2}`} fill="var(--color-surface-subtle)" stroke={stroke()} /></Show>
    <Show when={round()}><ellipse cx={props.node.x + props.node.width / 2} cy={props.node.y + props.node.height / 2} rx={props.node.width / 2} ry={props.node.height / 2} fill="var(--color-surface-subtle)" stroke={stroke()} /></Show>
    <foreignObject x={props.node.x} y={props.node.y} width={props.node.width} height={props.node.height}>
      <div class="h-full" classList={{ "pw-canvas-selected": props.selected && (!geometric() || props.variant === "ellipse"), "pw-canvas-text": props.variant === "text" }}>
        <Show when={!geometric() && props.variant !== "text"} fallback={<div class="flex h-full flex-col items-center justify-center gap-1 p-3" classList={{ "pw-canvas-diamond-content": diamond() }}>
          <Show when={props.roadmap && propertyText(props.node, "status")}><StatusChip tone="muted" label={propertyText(props.node, "status")} /></Show>
          {props.children}
        </div>}>
          <Card variant={props.variant === "sticky" ? "texture" : "rings"} class={`flex h-full flex-col items-center justify-center gap-1 !p-3 ${props.variant === "frame" || props.variant === "lane" ? "pw-canvas-frame" : ""}`}>
            <Show when={props.variant === "sticky"}><StickyNote size={14} style={{ color: colorToken(propertyText(props.node, "color")) }} /></Show>
            <Show when={props.node.type === "note" && props.variant !== "sticky"}><StickyNote size={14} /></Show>
            <Show when={props.roadmap && propertyText(props.node, "status")}><StatusChip tone="muted" label={propertyText(props.node, "status")} /></Show>
            {props.children}
          </Card>
        </Show>
      </div>
    </foreignObject>
  </g>;
}
