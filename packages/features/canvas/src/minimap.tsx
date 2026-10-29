import { For, Index, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { documentBounds, pointsToSvgPath, resolveRelationshipRoute, type ArchNode } from "@polterware/frontend-canvas";
import { toDocument, type CanvasRecord, type CanvasType } from "./model";
import { CanvasNode } from "./node-renderer";
import { backdrop, canvasBehavior } from "./types";
import { readRef, referenceState, type StoreEntity } from "./references";

const MARGIN = 48;
/** The editor grid step and dot at 100%; the miniature draws them in document units, so they scale with the map. */
const GRID = 24;

/**
 * A read-only miniature of the canvas: the same shapes, connections and dotted grid, scaled to fit the host.
 * `reserveBottom` keeps that many pixels at the bottom free of content, for chrome floating over the grid.
 */
export function CanvasMinimap(props: { canvas: CanvasRecord; definition?: CanvasType; entities?: readonly StoreEntity[]; reserveBottom?: number }) {
  const view = createMemo(() => {
    if (!props.definition) return undefined;
    try {
      const behavior = canvasBehavior(props.definition);
      const doc = toDocument(props.canvas);
      if (!doc.nodes.length) return undefined;
      const bounds = documentBounds(doc);
      return { doc, behavior, box: { x: bounds.minX - MARGIN, y: bounds.minY - MARGIN, width: bounds.maxX - bounds.minX + MARGIN * 2, height: bounds.maxY - bounds.minY + MARGIN * 2 } };
    } catch { return undefined; }
  });
  const arrowId = () => `canvas-mini-arrow-${props.canvas.id}`;
  const gridId = () => `canvas-mini-grid-${props.canvas.id}`;
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  let host!: SVGSVGElement;
  onMount(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height }); });
    observer.observe(host);
    onCleanup(() => observer.disconnect());
  });
  // The viewBox spans the whole host, so the grid reaches every edge; the content fits the area above the reserve.
  const viewBox = createMemo(() => {
    const box = view()?.box ?? { x: 0, y: 0, width: 320, height: 160 };
    const { width, height } = size();
    const free = height - (props.reserveBottom ?? 0);
    if (!width || free <= 0) return box;
    const scale = Math.min(width / box.width, free / box.height);
    return { x: box.x - (width / scale - box.width) / 2, y: box.y - (free / scale - box.height) / 2, width: width / scale, height: height / scale };
  });
  return <svg ref={host} class="block h-full w-full" preserveAspectRatio="xMidYMin meet" aria-hidden="true"
    viewBox={`${viewBox().x} ${viewBox().y} ${viewBox().width} ${viewBox().height}`}>
    <defs>
      <pattern id={gridId()} width={GRID} height={GRID} patternUnits="userSpaceOnUse"><circle cx={GRID / 2} cy={GRID / 2} r="1" fill="var(--color-border-default)" /></pattern>
      <marker id={arrowId()} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker>
    </defs>
    <rect x={viewBox().x} y={viewBox().y} width={viewBox().width} height={viewBox().height} fill="var(--color-app-background)" />
    <rect x={viewBox().x} y={viewBox().y} width={viewBox().width} height={viewBox().height} fill={`url(#${gridId()})`} />
    <Show when={view()}>{(value) => {
      const renderNode = (node: () => ArchNode) => {
        const ref = () => readRef(node());
        return <CanvasNode node={node()} variant={value().behavior.variant(node().type)} selected={false}>
          <span class="break-words text-center text-sm text-[var(--color-text-primary)]">{ref() ? referenceState(ref(), props.entities ?? []).title : node().name}</span>
        </CanvasNode>;
      };
      return <>
        <Index each={value().doc.nodes.filter((node) => backdrop(node.type))}>{renderNode}</Index>
        <For each={value().doc.relationships}>{(edge) => {
          const source = () => value().doc.nodes.find((n) => n.id === edge.sourceNodeId);
          const target = () => value().doc.nodes.find((n) => n.id === edge.targetNodeId);
          const route = () => source() && target() ? resolveRelationshipRoute(source()!, target()!) : [];
          const style = () => value().behavior.edgeStyle(edge.type);
          return <g class="pw-canvas-edge"><path d={pointsToSvgPath(route())} fill="none" stroke-width="2" stroke-dasharray={style().dashed ? "6 4" : undefined} marker-end={style().arrow ? `url(#${arrowId()})` : undefined} /></g>;
        }}</For>
        <Index each={value().doc.nodes.filter((node) => !backdrop(node.type))}>{renderNode}</Index>
      </>;
    }}</Show>
  </svg>;
}
