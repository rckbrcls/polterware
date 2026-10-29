import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import {
  Button, ChevronLeft, ConnectIcon, Heading02Icon, IconTile, PageEmpty, PageToolbar, SearchBar, StickyNote,
} from "@polterware/frontend-design-system";
import { COMPONENTS, GLYPH, family, silhouette, structureKind } from "./components";
import { edgePalette, nodePalette, type CanvasType } from "./model";
import { nodeIcon } from "./node-renderer";
import { EdgeSample, NodeSample } from "./samples";
import { SHAPES, kindLabel, paletteGroups, paletteLabel, paletteSearchText, shape } from "./shapes";
import { canvasDefaults } from "./types";

/** Every kind the canvas knows: the static libraries plus whatever the core reports. */
export function galleryKinds(types: readonly CanvasType[]) {
  const nodes = new Set([...COMPONENTS.map((item) => item.kind), "system", "domain", "component", ...SHAPES.map((item) => item.kind), "note", "text"]);
  const edges = new Set(["relates"]);
  for (const type of types) {
    nodePalette(type).forEach((kind) => nodes.add(kind));
    edgePalette(type).forEach((kind) => edges.add(kind));
  }
  return { nodes: [...nodes], edges: [...edges] };
}

/** The icon a kind shows in its tile: a small drawing of a library shape or component family, or its sign. */
function KindGlyph(props: { kind: string }) {
  const outline = () => {
    const library = shape(props.kind);
    if (library) return { d: library.path(14, library.labelBelow ? 14 : 11), box: "-1 -1 16 16" };
    const outer = structureKind(props.kind) ? undefined : silhouette(props.kind);
    return outer && { d: outer.path(GLYPH.width, GLYPH.height), box: `-3 -3 ${GLYPH.width + 6} ${GLYPH.height + 6}` };
  };
  const icon = () => outline() ? undefined : nodeIcon(props.kind);
  return <Show when={icon()} fallback={<Show when={outline()} fallback={props.kind === "note" ? <StickyNote size={14} /> : props.kind === "text" ? <Heading02Icon size={14} /> : <ConnectIcon size={14} />}>
    {(definition) => <svg width="14" height="14" viewBox={definition().box} aria-hidden="true"><path d={definition().d} fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" /></svg>}
  </Show>}>{(Icon) => Icon()({ size: 14 })}</Show>;
}

/** One kind drawn straight on the canvas grid, with its name underneath. */
function Tile(props: { kind: string; label: string; detail?: string; children: JSX.Element }) {
  return <li class="pw-canvas-gallery-tile">
    <div class="pw-canvas-gallery-art-box">{props.children}</div>
    <div class="pw-canvas-gallery-meta">
      <IconTile size={24} tone="architecture" seed={props.kind} class="shrink-0"><KindGlyph kind={props.kind} /></IconTile>
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-[13px] font-medium text-[var(--color-text-primary)]">{props.label}</span>
        <span class="truncate text-[11px] text-[var(--color-text-muted)]">{props.detail ?? props.kind}</span>
      </div>
    </div>
  </li>;
}

function Section(props: { title: string; count: number; children: JSX.Element }) {
  return <section aria-label={props.title} class="pw-canvas-gallery-section">
    <h2 class="pw-canvas-gallery-heading">{props.title}<span>{props.count}</span></h2>
    {props.children}
  </section>;
}

/** A reference sheet of every library entry, component family, annotation and connection kind, drawn by the real renderer. */
export function ShapeGallery(props: { types: readonly CanvasType[]; onBack: () => void }) {
  const [query, setQuery] = createSignal("");
  const kinds = createMemo(() => galleryKinds(props.types));
  const needle = () => query().trim().toLowerCase();
  const groups = createMemo(() => paletteGroups(kinds().nodes).map((group) => ({ ...group, kinds: group.kinds.filter((kind) => paletteSearchText(kind).includes(needle())) })).filter((group) => group.kinds.length));
  // A family's generic component takes any of its types in the inspector; the tile counts them.
  const types = (kind: string) => {
    const count = COMPONENTS.filter((item) => item.family === family(kind)?.id && kinds().nodes.includes(item.kind)).length;
    return count ? `${count} ${count === 1 ? "type" : "types"}` : undefined;
  };
  const edges = createMemo(() => kinds().edges.filter((kind) => `connection ${kind} ${kindLabel(kind)}`.toLowerCase().includes(needle())));
  // The sample is drawn as a directed connection, the common case.
  const sampleEdge = () => kinds().edges.find((kind) => canvasDefaults.edgeStyle(kind).arrow && !canvasDefaults.edgeStyle(kind).dashed) ?? kinds().edges[0]!;
  return <div class="flex h-full min-h-0 flex-col">
    <PageToolbar.Root>
      <PageToolbar.Leading>
        <Button variant="texture" size="icon" aria-label="Canvases" onClick={props.onBack}><ChevronLeft size={14} /></Button>
        <span class="text-[14px] font-medium text-[var(--color-text-primary)]">Shape gallery</span>
      </PageToolbar.Leading>
      <PageToolbar.Actions>
        <SearchBar placeholder="Search shapes" value={query()} onInput={setQuery} aria-label="Search shapes" />
      </PageToolbar.Actions>
    </PageToolbar.Root>
    <div class="pw-canvas-surface min-h-0 flex-1 overflow-auto pw-scroll-fade">
      <Show when={groups().length || edges().length} fallback={<PageEmpty title="No matches" mood="lost" />}>
        <div class="pw-canvas-gallery">
          <For each={groups()}>{(group) => <Section title={group.title} count={group.kinds.length}>
            <ul role="list" aria-label={group.title} class="pw-canvas-gallery-grid">
              <For each={group.kinds}>{(kind) => <Tile kind={kind} label={paletteLabel(kind)} detail={types(kind)}><NodeSample kind={kind} /></Tile>}</For>
            </ul>
          </Section>}</For>
          {/* One connection; its kind is picked in the inspector, like a component's type. */}
          <Show when={edges().length}><Section title="Connections" count={1}>
            <ul role="list" aria-label="Connections" class="pw-canvas-gallery-grid">
              <Tile kind="connection" label="Connection" detail={`${kinds().edges.length} kinds`}><EdgeSample kind={sampleEdge()} /></Tile>
            </ul>
          </Section></Show>
        </div>
      </Show>
    </div>
  </div>;
}
