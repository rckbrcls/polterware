import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { Button, CollapsibleSection, Network, Search, SearchBar } from "@polterware/frontend-design-system";
import { paletteLabel, paletteSearchText, type PaletteGroup } from "./shapes";
import { NodeSample } from "./samples";
import { structureEntities, type StoreEntity } from "./references";

export const SHAPE_MIME = "application/x-polter-shape";
export const ENTITY_MIME = "application/x-polter-entity";
const LEVELS = [["domain", "Domains"], ["component", "Components"]] as const;

/** One library entry: the kind drawn as it lands on the canvas, with its name below; click adds it, drag drops it. */
function LibraryTile(props: { label: string; name?: string; drag?: { type: string; value: string }; onAdd: () => void; children: JSX.Element }) {
  return <div role="listitem"><Button variant="ghost" class="pw-canvas-library-tile" aria-label={props.label} draggable={!!props.drag}
    onDragStart={(event: DragEvent) => { if (!props.drag) return; event.dataTransfer?.setData(props.drag.type, props.drag.value); if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy"; }}
    onClick={props.onAdd}>
    <span class="pw-canvas-library-art">{props.children}</span>
    <span class="pw-canvas-library-name">{props.name ?? props.label}</span>
  </Button></div>;
}

export function ShapeLibrary(props: {
  groups: readonly PaletteGroup[];
  onAdd: (kind: string) => void;
  entities?: readonly StoreEntity[]; onAddEntity?: (entity: StoreEntity) => void;
}) {
  const [query, setQuery] = createSignal("");
  // Technology names match too, so "redis" finds Cache.
  const matches = (kind: string) => paletteSearchText(kind).includes(query().trim().toLowerCase());
  const groups = createMemo(() => props.groups.map((group) => ({ ...group, kinds: group.kinds.filter(matches) })).filter((group) => group.kinds.length));
  const structure = createMemo(() => structureEntities(props.entities ?? []).filter((entity) => `${entity.title} ${entity.level}`.toLowerCase().includes(query().trim().toLowerCase())));
  return <div class="pw-canvas-panel-root" aria-label="Shape library">
    <div class="pw-canvas-panel-head"><SearchBar class="!w-full !max-w-none" aria-label="Search shapes" placeholder="Search shapes" value={query()} onInput={setQuery} /></div>
    <div class="pw-canvas-panel-body pw-scroll-fade">
      <For each={groups()}>{(group) => <CollapsibleSection title={group.title}>
        <div class="pw-canvas-tiles" role="list" aria-label={group.title}>
          <For each={group.kinds}>{(kind) => <LibraryTile label={paletteLabel(kind)} drag={{ type: SHAPE_MIME, value: kind }} onAdd={() => props.onAdd(kind)}><NodeSample kind={kind} /></LibraryTile>}</For>
        </div>
      </CollapsibleSection>}</For>
      <Show when={props.onAddEntity}><CollapsibleSection title="Project structure" icon={<Network size={14} />}>
        {/* The project's own Structure nodes, drawn as the linked card each becomes and grouped by level. */}
        <For each={LEVELS}>{([level, title]) => <Show when={structure().some((entity) => entity.level === level)}>
          <p class="pw-canvas-library-group">{title}</p>
          <div class="pw-canvas-tiles" role="list" aria-label={`Structure ${title.toLowerCase()}`}>
            <For each={structure().filter((entity) => entity.level === level)}>{(entity) => <LibraryTile label={`Add ${level}: ${entity.title}`} name={entity.title}
              drag={{ type: ENTITY_MIME, value: entity.id }} onAdd={() => props.onAddEntity!(entity)}><NodeSample kind={level} title={entity.title} id={entity.id} /></LibraryTile>}</For>
          </div>
        </Show>}</For>
        <Show when={!structure().length}><p role="status" class="pw-canvas-panel-note px-2">No matching domain or component nodes.</p></Show>
      </CollapsibleSection></Show>
      <Show when={query() && !groups().length && !structure().length}><p role="status" class="pw-canvas-panel-note flex items-center gap-2 px-1"><Search size={14} />No shapes match “{query()}”.</p></Show>
    </div>
  </div>;
}
