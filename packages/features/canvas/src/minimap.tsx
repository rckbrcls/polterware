import { For, Index, Show, createMemo } from "solid-js";
import { documentBounds, pointsToSvgPath, resolveRelationshipRoute, type ArchNode } from "@polterware/frontend-canvas";
import { toDocument, type CanvasRecord, type CanvasType } from "./model";
import { CanvasNode } from "./node-renderer";
import { canvasBehavior } from "./types";
import { readRef, referenceState, type StoreEntity } from "./references";

const MARGIN = 48;

/** A read-only miniature of the canvas: the same nodes, edges, and dotted grid, scaled to fit. */
export function CanvasMinimap(props: { canvas: CanvasRecord; definition?: CanvasType; entities?: readonly StoreEntity[] }) {
  const view = createMemo(() => {
    if (!props.definition) return undefined;
    try {
      const behavior = canvasBehavior(props.definition);
      const base = toDocument(props.canvas);
      const doc = behavior.layout?.(base) ?? base;
      if (!doc.nodes.length) return undefined;
      const bounds = documentBounds(doc);
      return { doc, behavior, box: { x: bounds.minX - MARGIN, y: bounds.minY - MARGIN, width: bounds.maxX - bounds.minX + MARGIN * 2, height: bounds.maxY - bounds.minY + MARGIN * 2 } };
    } catch { return undefined; }
  });
  const gridId = () => `canvas-mini-grid-${props.canvas.id}`;
  const arrowId = () => `canvas-mini-arrow-${props.canvas.id}`;
  return <svg class="block h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true"
    viewBox={view() ? `${view()!.box.x} ${view()!.box.y} ${view()!.box.width} ${view()!.box.height}` : "0 0 320 160"}>
    <defs>
      <pattern id={gridId()} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--color-border-default)" /></pattern>
      <marker id={arrowId()} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker>
    </defs>
    <rect x={view()?.box.x ?? 0} y={view()?.box.y ?? 0} width={view()?.box.width ?? 320} height={view()?.box.height ?? 160} fill={`url(#${gridId()})`} />
    <Show when={view()}>{(value) => {
      const renderNode = (node: () => ArchNode) => {
        const ref = () => readRef(node());
        return <CanvasNode node={node()} variant={value().behavior.variant(node().type)} selected={false} roadmap={props.canvas.type === "roadmap"}>
          <span class="break-words text-center text-sm text-[var(--color-text-primary)]">{ref() ? referenceState(ref(), props.entities ?? []).title : node().name}</span>
        </CanvasNode>;
      };
      const isBackdrop = (node: ArchNode) => ["lane", "frame"].includes(value().behavior.variant(node.type));
      return <>
        <Index each={value().doc.nodes.filter(isBackdrop)}>{renderNode}</Index>
        <For each={value().doc.relationships}>{(edge) => {
          const source = () => value().doc.nodes.find((n) => n.id === edge.sourceNodeId);
          const target = () => value().doc.nodes.find((n) => n.id === edge.targetNodeId);
          const route = () => source() && target() ? resolveRelationshipRoute(source()!, target()!) : [];
          const style = () => value().behavior.edgeStyle(edge.type);
          return <path d={pointsToSvgPath(route())} fill="none" stroke="var(--color-text-muted)" stroke-width="2" stroke-dasharray={style().dashed ? "6 4" : undefined} marker-end={style().arrow ? `url(#${arrowId()})` : undefined} />;
        }}</For>
        <Index each={value().doc.nodes.filter((node) => !isBackdrop(node))}>{renderNode}</Index>
      </>;
    }}</Show>
  </svg>;
}
