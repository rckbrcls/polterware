import { For, Show, createEffect, createMemo, createSignal, createUniqueId, on } from "solid-js";
import { pointsToRoundedSvgPath } from "@polterware/frontend-canvas";
import {
  ChevronDown,
  PageContent,
  PageEmpty,
  animateCollapse,
  prefersReducedMotion,
  type CollapseControls,
} from "@polterware/frontend-design-system";
import { AtlasStatusMark, type AtlasCanvasNode } from "./atlas-canvas";
import { buildRelations, filterRelations, type NodeRelations, type RelationFilters } from "./relations-model";
import "./relations-list.css";

const CARD_W = 200;
const CARD_H = 48;
const ROW_GAP = 12;
const COL_GAP = 72;
const COL_STEP = CARD_W + COL_GAP;
const FLOW_WIDTH = CARD_W * 3 + COL_GAP * 2;

function columnY(count: number, height: number, index: number): number {
  const total = count * CARD_H + (count - 1) * ROW_GAP;
  return (height - total) / 2 + index * (CARD_H + ROW_GAP);
}

/** Every domain or component with a relation, each as a collapsible flow. */
export function RelationsList(props: {
  nodes: readonly AtlasCanvasNode[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  filters: RelationFilters;
}) {
  const all = createMemo(() => buildRelations(props.nodes));
  const rows = createMemo(() => filterRelations(all(), props.filters));
  return (
    <PageContent class="p-0">
      <Show
        when={rows().length > 0}
        fallback={
          <Show
            when={all().length > 0}
            fallback={
              <PageEmpty
                title="No relations yet."
                description="Connect two components on the map. Their relation shows up here."
              />
            }
          >
            <PageEmpty title="No matching relations." description="Change the search or clear the filters." />
          </Show>
        }
      >
        <div class="atlas-relations">
          <For each={rows()}>
            {(row) => <RelationsSection row={row} selectedId={props.selectedId} onSelect={props.onSelect} />}
          </For>
        </div>
      </Show>
    </PageContent>
  );
}

function countLabel(row: NodeRelations): string {
  const parts: string[] = [];
  if (row.uses.length > 0) parts.push(`${row.uses.length} uses`);
  if (row.usedBy.length > 0) parts.push(`${row.usedBy.length} used by`);
  return parts.join(" · ");
}

function RelationsSection(props: {
  row: NodeRelations;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = createSignal(true);
  const bodyId = `atlas-relations-${createUniqueId()}`;
  let body: HTMLDivElement | undefined;
  let running: CollapseControls | undefined;

  createEffect(
    on(
      open,
      (isOpen) => {
        if (body) running = animateCollapse(body, isOpen, { previous: running });
      },
      { defer: true },
    ),
  );

  const node = () => props.row.node;

  return (
    <section class="atlas-relations__section card-texture-framed" aria-label={node().title}>
      <h2 class="atlas-relations__heading">
        <button
          type="button"
          class="atlas-relations__node"
          aria-expanded={open()}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
        >
          <AtlasStatusMark status={node().status} />
          <span class="atlas-relations__title">{node().title}</span>
          <span class="atlas-relations__meta">{countLabel(props.row)}</span>
          <ChevronDown size={14} class="atlas-relations__toggle" data-expanded={open()} aria-hidden />
        </button>
      </h2>
      <div id={bodyId} class="atlas-relations__body" ref={body} data-state="open">
        <RelationsFlow row={props.row} selectedId={props.selectedId} onSelect={props.onSelect} />
      </div>
    </section>
  );
}

type Edge = { id: string; d: string };

/** Used by → node → uses, laid out on fixed geometry so the edges need no measuring. */
function RelationsFlow(props: {
  row: NodeRelations;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const geometry = createMemo(() => {
    const { node, uses, usedBy } = props.row;
    const rows = Math.max(uses.length, usedBy.length, 1);
    const height = rows * CARD_H + (rows - 1) * ROW_GAP;
    const centerY = (height - CARD_H) / 2;
    const left = usedBy.map((other, index) => ({ node: other, y: columnY(usedBy.length, height, index) }));
    const right = uses.map((other, index) => ({ node: other, y: columnY(uses.length, height, index) }));
    const edges: Edge[] = [
      ...left.map((entry) => ({
        id: `${entry.node.id}->${node.id}`,
        d: elbow(CARD_W, entry.y + CARD_H / 2, COL_STEP, centerY + CARD_H / 2),
      })),
      ...right.map((entry) => ({
        id: `${node.id}->${entry.node.id}`,
        d: elbow(COL_STEP + CARD_W, centerY + CARD_H / 2, COL_STEP * 2, entry.y + CARD_H / 2),
      })),
    ];
    return { height, centerY, left, right, edges };
  });
  const flow = () => !prefersReducedMotion();

  return (
    <div class="atlas-relations__scroll">
      <div class="atlas-relations__captions" style={{ width: `${FLOW_WIDTH}px` }} aria-hidden>
        <span style={{ width: `${CARD_W}px` }}>Used by</span>
        <span style={{ width: `${CARD_W}px` }}>Node</span>
        <span style={{ width: `${CARD_W}px` }}>Uses</span>
      </div>
      <div class="atlas-relations__flow" style={{ width: `${FLOW_WIDTH}px`, height: `${geometry().height}px` }}>
        <svg
          class="atlas-relations__edges"
          width={FLOW_WIDTH}
          height={geometry().height}
          viewBox={`0 0 ${FLOW_WIDTH} ${geometry().height}`}
          aria-hidden
        >
          <defs>
            <marker
              id="atlas-relations-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>
          <For each={geometry().edges}>
            {(edge) => <path class="atlas-relations__edge" d={edge.d} marker-end="url(#atlas-relations-arrow)" />}
          </For>
        </svg>
        <Show when={flow()}>
          <For each={geometry().edges}>
            {(edge, index) => (
              <span
                class="atlas-relations__dot"
                aria-hidden
                style={{
                  "offset-path": `path("${edge.d}")`,
                  "animation-delay": `${-(index() % 4) * 0.6}s`,
                }}
              />
            )}
          </For>
        </Show>
        <For each={geometry().left}>
          {(entry) => (
            <RelationCard node={entry.node} x={0} y={entry.y} selectedId={props.selectedId} onSelect={props.onSelect} />
          )}
        </For>
        <RelationCard
          node={props.row.node}
          x={COL_STEP}
          y={geometry().centerY}
          selectedId={props.selectedId}
          onSelect={props.onSelect}
        />
        <For each={geometry().right}>
          {(entry) => (
            <RelationCard
              node={entry.node}
              x={COL_STEP * 2}
              y={entry.y}
              selectedId={props.selectedId}
              onSelect={props.onSelect}
            />
          )}
        </For>
      </div>
    </div>
  );
}

function elbow(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (x1 + x2) / 2;
  return pointsToRoundedSvgPath([
    { x: x1, y: y1 },
    { x: mid, y: y1 },
    { x: mid, y: y2 },
    { x: x2, y: y2 },
  ]);
}

function RelationCard(props: {
  node: AtlasCanvasNode;
  x: number;
  y: number;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      class="atlas-relations__card card-texture-framed"
      data-selected={props.selectedId === props.node.id ? "true" : undefined}
      style={{ transform: `translate(${props.x}px, ${props.y}px)`, width: `${CARD_W}px`, height: `${CARD_H}px` }}
      data-detail-opener
      data-detail-target-id={props.node.id}
      onClick={() => props.onSelect(props.node.id)}
    >
      <AtlasStatusMark status={props.node.status} />
      <span class="atlas-relations__card-body">
        <span class="atlas-relations__card-title">{props.node.title}</span>
        <span class="atlas-relations__card-meta">{props.node.level}</span>
      </span>
    </button>
  );
}
