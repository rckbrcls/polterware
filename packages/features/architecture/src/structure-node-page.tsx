import { For, Show, type JSX } from "solid-js";
import {
  Button, Cloud, DataTable, DetailPanel, EntityMenuButton, GitBranch, IconTile, InformationCircle, Plus, RailGroup, RailPage, StatusChip,
  type EntityAction,
} from "@polterware/frontend-design-system";
import type { StructureKind, StructureNode } from "./structure-tree";

export type StructureCounts = { work: number; decisions: number; facts: number };

function plural(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/** "2 cards / 1 decision / 3 facts", leaving out the empty ones; empty when there are none. */
export function recordsLabel(counts: StructureCounts | undefined): string {
  if (!counts) return "";
  return [
    counts.work ? plural(counts.work, "card") : "",
    counts.decisions ? plural(counts.decisions, "decision") : "",
    counts.facts ? plural(counts.facts, "fact") : "",
  ].filter(Boolean).join(" / ");
}

/**
 * One Structure node as a page (`RailPage`), like a Linear project: its description and its
 * children (with Add child) and deploys in the column, its properties in the rail, and its
 * actions in the header. Every value left empty is left out.
 */
export function StructureNodePage(props: {
  node: StructureNode;
  /** The node's ancestors, root first, for the trail. */
  ancestors: readonly StructureNode[];
  children: readonly StructureNode[];
  counts: Readonly<Record<string, StructureCounts>>;
  icon: (level: StructureKind, size: number) => JSX.Element;
  levelLabel: (node: StructureNode) => string;
  checkout: string;
  uses: readonly string[];
  actions: readonly EntityAction[];
  isProviderConnected: (provider: string) => boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
  /** Leave out for a component, which has no children. */
  onAddChild?: () => void;
}) {
  return (
    <RailPage
      trail={[{ label: "Structure", onSelect: props.onBack }, ...props.ancestors.map((node) => ({ label: node.title, onSelect: () => props.onOpen(node.id) }))]}
      title={props.node.title}
      icon={props.icon(props.node.level, 16)}
      onBack={props.onBack}
      railStorageKey="structure.node.rail"
      actions={<EntityMenuButton label={`Actions for ${props.node.title}`} actions={props.actions} />}
      rail={
        <RailGroup title="Properties" icon={<InformationCircle size={14} />}>
          <DetailPanel.Properties variant="rail">
            <DetailPanel.Property label="Level" value={props.levelLabel(props.node)} />
            <DetailPanel.Property label="Technology" value={props.node.tech || null} />
            <DetailPanel.Property label="Checkout" value={props.checkout || null} mono />
            <DetailPanel.Property label="Path" value={props.node.path || null} mono />
            <DetailPanel.Property label="Uses" value={props.uses.length ? props.uses.join(" / ") : null} />
            <DetailPanel.Property label="Records" value={recordsLabel(props.counts[props.node.id]) || null} />
          </DetailPanel.Properties>
        </RailGroup>
      }
    >
      <h1 class="pw-document__title">{props.node.title}</h1>
      <Show when={props.node.intent}>{(intent) => <p class="pw-structure-page__intent">{intent()}</p>}</Show>
      <div class="pw-structure-page__sections">
        <Show when={props.onAddChild || props.children.length > 0}>
          <RailGroup
            title="Children"
            icon={<GitBranch size={14} />}
            aside={<Show when={props.onAddChild}><Button size="sm" variant="ghost" onClick={() => props.onAddChild?.()}><Plus size={12} />Add child</Button></Show>}
          >
            <Show when={props.children.length > 0} fallback={<p class="pw-structure-page__empty">No children yet.</p>}>
              <DataTable.Root rows={props.children} getRowId={(node) => node.id} density="list">
                <DataTable.Table aria-label={`Children of ${props.node.title}`}>
                  <DataTable.Header>
                    <DataTable.ColumnHeader id="name" sortBy={(node) => node.title} minWidth={200}>Name</DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="kind" sortBy={(node) => props.levelLabel(node)}>Kind</DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="records" sortable={false}>Records</DataTable.ColumnHeader>
                  </DataTable.Header>
                  <DataTable.Body>
                    {(child) => (
                      <DataTable.Row row={child} rowId={child.id} onActivate={() => props.onOpen(child.id)} aria-label={`Open ${child.title}`}>
                        <DataTable.PrimaryCell leading={<IconTile size={24} tone="neutral" seed={child.id}>{props.icon(child.level, 14)}</IconTile>} title={child.title} />
                        <DataTable.Cell><span class="text-[var(--color-text-secondary)]">{props.levelLabel(child)}</span></DataTable.Cell>
                        <DataTable.Cell><span class="text-[var(--color-text-muted)]">{recordsLabel(props.counts[child.id])}</span></DataTable.Cell>
                      </DataTable.Row>
                    )}
                  </DataTable.Body>
                </DataTable.Table>
              </DataTable.Root>
            </Show>
          </RailGroup>
        </Show>
        <Show when={props.node.level === "component" && props.node.deploys?.length}>
          <RailGroup title="Deploys" icon={<Cloud size={14} />}>
            <ul class="pw-structure-page__deploys" aria-label="Deploys">
              <For each={props.node.deploys!}>
                {(deploy) => (
                  <li class="pw-structure-page__deploy">
                    <span class="min-w-0 truncate text-[var(--color-text-primary)]">{deploy.resource}</span>
                    <span class="min-w-0 truncate text-[var(--color-text-muted)]">{deploy.provider} / {deploy.environment || deploy.environmentId}</span>
                    <Show when={!props.isProviderConnected(deploy.provider)}><StatusChip tone="warn" label="CLI not connected" /></Show>
                  </li>
                )}
              </For>
            </ul>
          </RailGroup>
        </Show>
      </div>
    </RailPage>
  );
}
