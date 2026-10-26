import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { EntityDetailHost, scopeFilterMenuGroups, scopeFilterPills, type EnvironmentItem, type ScopeFilterToken, type ScopeNodeItem } from "@polterware/feature-shell";
import {
  A11yDialog, Boxes, Button, Card, TemplateCardGrid, Checkbox, DetailPanel, Field, FileText, Folder, FormStack, Input,
  ActiveFilterBar, FilterPopover, IconTile, Layers, ListChecks, Network, PageContent, PageEmpty, PageError, PageLoading, PageToolbar, Plus,
  Delete, Link2, Route, ScrollText, SearchBar, SegmentedControl, Select, Settings, ShieldCheck, StatusChip, TreeView, pushToast,
  type TreeViewNode,
  ToolbarIconButton,
} from "@polterware/frontend-design-system";
import { createDetailPanelSelector, detailPanelStore, readRemembered, writeRemembered } from "@polterware/frontend-state";
import { buildStructureTree, flattenStructureTree, structureParents, type StructureKind, type StructureNode, type StructureTreeItem } from "./structure-tree";
import type { ProjectEnvironment } from "./domain/project-environments";
import type { WorkspaceIntegration } from "@polterware/feature-shell";

export type { ArchViewCard } from "./extra-fixtures";
export { filterStructureNodes } from "./structure-tree";
export type { StructureNode } from "./structure-tree";
export const STRUCTURE_SCOPE = "structure:nodes";
const PROJECT_ID = "structure:project";
type Counts = { work: number; decisions: number; facts: number };
export type StructureDraft = { title: string; level: StructureKind; parentId: string };

// Nine catalog providers from the integrations catalog
const CATALOG_PROVIDERS = [
  { id: "github", name: "GitHub" },
  { id: "gitlab", name: "GitLab" },
  { id: "aws", name: "AWS" },
  { id: "google-cloud", name: "Google Cloud" },
  { id: "azure", name: "Azure" },
  { id: "vercel", name: "Vercel" },
  { id: "supabase", name: "Supabase" },
  { id: "terraform", name: "Terraform" },
  { id: "docker", name: "Docker" },
] as const;

function KindIcon(props: { kind: StructureKind | "project"; size?: number }) {
  const size = () => props.size ?? 16;
  return <Show when={props.kind === "component"} fallback={<Show when={props.kind === "domain"} fallback={<Layers size={size()} aria-hidden />}><Folder size={size()} aria-hidden /></Show>}><Boxes size={size()} aria-hidden /></Show>;
}
const kindLabel = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1);

function countTitle(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function RecordCounts(props: { counts: Counts }) {
  return <Show when={props.counts.work || props.counts.decisions || props.counts.facts}>
    <span class="flex flex-wrap items-center gap-2 text-[var(--color-text-muted)]">
      <Show when={props.counts.work > 0}><span class="inline-flex items-center gap-1" aria-label={countTitle(props.counts.work, "Work card")} title={countTitle(props.counts.work, "Work card")}><ListChecks size={14} aria-hidden="true" /><span>{props.counts.work}</span></span></Show>
      <Show when={props.counts.decisions > 0}><span class="inline-flex items-center gap-1" aria-label={countTitle(props.counts.decisions, "Decision")} title={countTitle(props.counts.decisions, "Decision")}><ShieldCheck size={14} aria-hidden="true" /><span>{props.counts.decisions}</span></span></Show>
      <Show when={props.counts.facts > 0}><span class="inline-flex items-center gap-1" aria-label={countTitle(props.counts.facts, "Fact")} title={countTitle(props.counts.facts, "Fact")}><ScrollText size={14} aria-hidden="true" /><span>{props.counts.facts}</span></span></Show>
    </span>
  </Show>;
}

function StructureCard(props: {
  id: string;
  kind: StructureKind | "project";
  title: string;
  counts: Counts;
  selected: boolean;
  onOpen: () => void;
}) {
  let card: HTMLDivElement | undefined;
  createEffect(() => card?.toggleAttribute("data-selected", props.selected));
  return <Card ref={card} variant="texture" class="pw-texture-button min-w-0 !p-0">
    <button type="button" class="flex w-full min-w-0 flex-col gap-3 p-3 text-left" data-detail-opener data-detail-target-id={props.id} aria-pressed={props.selected} onClick={props.onOpen}>
      <span class="flex min-w-0 items-center gap-2">
        <IconTile size={24} tone="architecture" seed={props.id}><KindIcon kind={props.kind} size={14} /></IconTile>
        <span class="truncate text-sm font-medium text-[var(--color-text-primary)]">{props.title}</span>
      </span>
      <span class="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
        <span>{kindLabel(props.kind)}</span>
        <RecordCounts counts={props.counts} />
      </span>
    </button>
  </Card>;
}

export function StructureView(props: {
  projectName: string;
  projectDescription?: string;
  projectRepository?: string;
  nodes: readonly StructureNode[];
  /** Full registry for parent and dependency choices under a collection scope filter. */
  registryNodes?: readonly StructureNode[];
  counts: Readonly<Record<string, Counts>>;
  projectCounts: Counts;
  loading?: boolean;
  error?: string;
  createDialogOpen?: boolean;
  onCloseCreate: () => void;
  onOpenCreate: () => void;
  onCreate: (draft: StructureDraft) => Promise<void>;
  onMove: (nodeId: string, parentId: string) => Promise<void>;
  onUses: (nodeId: string, targetIds: string[]) => Promise<void>;
  onOpenNode: (id: string) => void;
  onSelect: (id: string) => void;
  /** Project environments for the environment select. */
  environments?: readonly ProjectEnvironment[];
  /** Integration connections for provider connection status. */
  integrations?: readonly WorkspaceIntegration[];
  /** Called when deploys change for a component node. */
  onDeploysChange?: (nodeId: string, deploys: { environmentId: string; provider: string; resource: string }[]) => Promise<void>;
  scopeTokens?: readonly ScopeFilterToken[];
  scopeNodes?: readonly ScopeNodeItem[];
  scopeEnvironments?: readonly EnvironmentItem[];
  onScopeTokensChange?: (tokens: ScopeFilterToken[]) => void;
}) {
  const [query, setQuery] = createSignal("");
  // The view mode and expanded tree rows are remembered, so returning to Structure keeps the same layout.
  const [view, setView] = createSignal(readRemembered("structure.view", "tree"));
  const [expanded, setExpanded] = createSignal<string[]>(readRemembered("structure.expanded", [PROJECT_ID]));
  createEffect(() => writeRemembered("structure.view", view()));
  createEffect(() => writeRemembered("structure.expanded", expanded()));
  const [busy, setBusy] = createSignal(false);
  const [title, setTitle] = createSignal("");
  const [kind, setKind] = createSignal<StructureKind>("system");
  const [parent, setParent] = createSignal("");
  const [moveOpen, setMoveOpen] = createSignal(false);
  const [usesOpen, setUsesOpen] = createSignal(false);
  const [useTargets, setUseTargets] = createSignal<string[]>([]);
  const [formError, setFormError] = createSignal("");
  const [deploysOpen, setDeploysOpen] = createSignal(false);
  const [editingDeploys, setEditingDeploys] = createSignal<{ environmentId: string; provider: string; resource: string }[]>([]);
  const target = createDetailPanelSelector((state) => state.activeTarget);
  const tree = createMemo(() => buildStructureTree(props.nodes, query()));
  const visible = createMemo(() => flattenStructureTree(tree()));
  const selectedId = () => target()?.scopeId === STRUCTURE_SCOPE ? target()?.entityId : undefined;
  const selectedValue = createMemo<string[]>(() => { const id = selectedId(); return id ? [id] : []; }, [], { equals: sameIds });
  const selected = createMemo(() => props.nodes.find((node) => node.id === selectedId()));
  const componentNode = createMemo(() => {
    const node = selected();
    return node?.level === "component" ? node : undefined;
  });
  const selectedCounts = () => selectedId() === PROJECT_ID ? props.projectCounts : props.counts[selectedId() ?? ""] ?? { work: 0, decisions: 0, facts: 0 };
  const registry = () => props.registryNodes ?? props.nodes;
  const parents = () => structureParents(registry(), moveOpen() ? selected()?.level ?? kind() : kind(), moveOpen() ? selected()?.id : undefined);
  const parentOptions = () => parents().map((node) => ({ value: node.id, label: `${node.title} (${kindLabel(node.level)})` }));
  const projectSelected = () => selectedId() === PROJECT_ID;
  const toTreeNode = (item: StructureTreeItem): TreeViewNode => ({
    id: item.node.id, label: item.node.title, icon: <KindIcon kind={item.node.level} size={14} />,
    trailing: <span class="flex items-center gap-2 text-xs text-[var(--color-text-muted)]"><span>{kindLabel(item.node.level)}</span><RecordCounts counts={props.counts[item.node.id] ?? { work: 0, decisions: 0, facts: 0 }} /></span>,
    children: item.children.map(toTreeNode),
  });
  const treeNodes = createMemo<TreeViewNode[]>(() => [{ id: PROJECT_ID, label: props.projectName, icon: <KindIcon kind="project" size={14} />,
    trailing: <span class="flex items-center gap-2 text-xs text-[var(--color-text-muted)]"><span>Project</span><RecordCounts counts={props.projectCounts} /></span>, children: tree().map(toTreeNode) }]);
  const open = (id: string) => props.onOpenNode(id);

  // Environment options for the deploys dialog
  const environmentOptions = () => (props.environments ?? []).map((env) => ({ value: env.id, label: env.label }));
  // Provider options from the catalog
  const providerOptions = () => CATALOG_PROVIDERS.map((p) => ({ value: p.id, label: p.name }));
  // Check if a provider is connected (status !== "connected" means not connected)
  const isProviderConnected = (providerId: string) => {
    const integration = props.integrations?.find((i) => i.providerId === providerId);
    return integration?.status === "connected";
  };
  // Memo for deploys count to avoid TypeScript issues with accessor in JSX
  const deploysCount = createMemo(() => editingDeploys().length);
  // Open deploys dialog for a component node
  const openDeploysDialog = (node: StructureNode) => {
    setEditingDeploys((node.deploys ?? []).map((d) => ({ environmentId: d.environmentId, provider: d.provider, resource: d.resource })));
    setFormError("");
    setDeploysOpen(true);
  };
  // Add a new deploy row
  const addDeployRow = () => {
    setEditingDeploys((current) => [...current, { environmentId: "", provider: "", resource: "" }]);
  };
  // Remove a deploy row
  const patchDeploy = (index: number, patch: Partial<{ environmentId: string; provider: string; resource: string }>) => {
    setEditingDeploys((current) => {
      const row = current[index];
      if (!row || Object.entries(patch).every(([key, value]) => row[key as keyof typeof row] === value)) return current;
      return current.map((d, i) => i === index ? { ...d, ...patch } : d);
    });
  };
  const removeDeployRow = (index: number) => {
    setEditingDeploys((current) => current.filter((_, i) => i !== index));
  };
  // Save deploys via onDeploysChange
  const saveDeploys = async () => {
    const node = selected();
    if (!node || node.level !== "component" || !props.onDeploysChange) return;
    const rows = editingDeploys();
    if (rows.some((d) => !d.environmentId || !d.provider || !d.resource.trim())) { setFormError("Fill environment, provider and resource on every row, or remove the row."); return; }
    setBusy(true);
    setFormError("");
    try {
      await props.onDeploysChange(node.id, rows.map((d) => ({ ...d, resource: d.resource.trim() })));
      setDeploysOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save deploys.";
      setFormError(message);
      pushToast(message, "danger");
    } finally {
      setBusy(false);
    }
  };

  createEffect(() => {
    const targets = [PROJECT_ID, ...visible().map((node) => node.id)].map((entityId) => ({ scopeId: STRUCTURE_SCOPE, entityId, entityKind: "arch-node" }));
    detailPanelStore.getState().registerCollection({ scopeId: STRUCTURE_SCOPE, status: props.loading ? "loading" : props.error ? "error" : "ready", targets, selectFirst: false });
  });
  onCleanup(() => detailPanelStore.getState().unregisterCollection(STRUCTURE_SCOPE));
  createEffect(() => { const id = selectedId(); if (id) untrack(() => props.onSelect(id)); });
  createEffect(() => {
    if (query().trim()) setExpanded([PROJECT_ID, ...visible().map((node) => node.id)]);
  });
  createEffect(() => {
    if (!props.createDialogOpen) return;
    setTitle(""); setKind("system"); setParent(""); setFormError("");
    const node = untrack(selected);
    if (node?.level === "system" || node?.level === "domain") {
      setKind(node.level === "system" ? "domain" : "component"); setParent(node.id);
    }
  });
  async function save(action: () => Promise<void>, close: () => void) {
    setBusy(true); setFormError("");
    try { await action(); close(); }
    catch (error) { const message = error instanceof Error ? error.message : "Could not save structure."; setFormError(message); pushToast(message, "danger"); }
    finally { setBusy(false); }
  }

  return <EntityDetailHost>
    <PageToolbar.Root>
      <PageToolbar.Leading class="gap-2">
        <SegmentedControl aria-label="Structure view" options={[{ value: "tree", label: "Tree" }, { value: "cards", label: "Cards" }]} value={view()} onValueChange={(event) => setView(event.value ?? "tree")} />
      </PageToolbar.Leading>
      <PageToolbar.Actions>
        <SearchBar placeholder="Search structure…" value={query()} onInput={setQuery} />
        <FilterPopover
          ariaLabel="Structure filters"
          title="Filter structure"
          active={(props.scopeTokens?.length ?? 0) > 0}
          onClear={() => props.onScopeTokensChange?.([])}
          groups={scopeFilterMenuGroups({
            tokens: props.scopeTokens ?? [],
            nodes: props.scopeNodes ?? [],
            environments: props.scopeEnvironments ?? [],
            allowEnv: true,
            onTokensChange: (tokens) => props.onScopeTokensChange?.(tokens),
          })}
        />
        <ToolbarIconButton label="Add node" disabled={props.loading || !!props.error} onClick={props.onOpenCreate}><Plus size={14} /></ToolbarIconButton>
      </PageToolbar.Actions>
    </PageToolbar.Root>
    <ActiveFilterBar
      items={scopeFilterPills(props.scopeTokens ?? [], (tokens) => props.onScopeTokensChange?.(tokens))}
      onClear={() => props.onScopeTokensChange?.([])}
    />
    <Show when={props.loading} fallback={<Show when={props.error} fallback={
      <PageContent class="pw-scroll-fade overflow-auto p-4">
                <Show when={visible().length} fallback={<PageEmpty title={query().trim() ? "No matches" : "No structure yet"} mood={query().trim() ? "lost" : "sleeping"} >{!query().trim() ? <TemplateCardGrid items={[{ id: "system", title: "System", description: "A top-level part of the project.", tone: "architecture", icon: <KindIcon kind="system" size={16} />, onSelect: props.onOpenCreate }]} /> : undefined}</PageEmpty>}>
        <Show when={view() === "tree"} fallback={<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <StructureCard id={PROJECT_ID} kind="project" title={props.projectName} counts={props.projectCounts} selected={projectSelected()} onOpen={() => open(PROJECT_ID)} />
          <For each={visible()}>{(node) => <StructureCard id={node.id} kind={node.level} title={node.title} counts={props.counts[node.id] ?? { work: 0, decisions: 0, facts: 0 }} selected={selectedId() === node.id} onOpen={() => open(node.id)} />}</For>
        </div>}>
          <TreeView label="Project structure" class="[&_h3]:sr-only" nodes={treeNodes()} expandedValue={expanded()} onExpandedChange={(event) => setExpanded((current) => sameIds(current, event.expandedValue) ? current : event.expandedValue)} selectedValue={selectedValue()} onSelectionChange={(event) => { const id = event.selectedValue[0]; if (id) open(id); }} />
        </Show>
        </Show>
      </PageContent>
    }><PageError message={props.error!} /></Show>}><PageLoading label="Loading structure…" /></Show>
    <Show when={selected() || projectSelected()}>
      <DetailPanel.Content><DetailPanel.Header /><DetailPanel.Body layout="record"><DetailPanel.Main>
        <DetailPanel.Title title={projectSelected() ? props.projectName : selected()!.title} icon={<KindIcon kind={projectSelected() ? "project" : selected()!.level} />} />
        <Show when={projectSelected() ? props.projectDescription : selected()?.intent}>{(description) => <DetailPanel.Section title="Description" icon={<FileText size={14} />}><p class="text-sm text-[var(--color-text-secondary)]">{description()}</p></DetailPanel.Section>}</Show>
        <Show when={componentNode()}>{(node) => <DetailPanel.Section title="Deploys" icon={<Boxes size={14} />} aside={<Button variant="ghost" size="sm" onClick={() => openDeploysDialog(node())}>Edit deploys</Button>}>
          <Show when={node().deploys && node().deploys!.length > 0} fallback={<p class="text-sm text-[var(--color-text-muted)]">No deploy targets yet.</p>}>
            <ul class="flex flex-col gap-2"><For each={node().deploys!}>{(deploy) => <li class="flex flex-wrap items-center gap-2 text-sm"><StatusChip tone="muted" label={deploy.provider} /><span class="text-[var(--color-text-secondary)]">{deploy.environment || deploy.environmentId}</span><span>{deploy.resource}</span><Show when={!isProviderConnected(deploy.provider)}><StatusChip tone="warn" label="CLI not connected" /></Show></li>}</For></ul>
          </Show>
        </DetailPanel.Section>}</Show>
        <DetailPanel.Section title="Linked records" icon={<ListChecks size={14} />}><NodeCounts counts={selectedCounts()} /></DetailPanel.Section>
        <Show when={selected()}>{(node) => <DetailPanel.Section title="Structure" icon={<Network size={14} />} aside={<div class="flex items-center gap-1"><Button variant="ghost" size="icon" disabled={node().level === "system"} aria-label="Move node" onClick={() => { setParent(node().parentId); setFormError(""); setMoveOpen(true); }}><Route size={14} /></Button><Button variant="ghost" size="icon" aria-label="Edit dependencies" onClick={() => { setUseTargets(registry().filter((item) => node().uses?.includes(item.path)).map((item) => item.id)); setFormError(""); setUsesOpen(true); }}><Link2 size={14} /></Button></div>}>
          <DetailPanel.Properties>
            <DetailPanel.Property label="Parent" value={registry().find((item) => item.id === node().parentId)?.title} />
            <DetailPanel.Property label="Dependencies" value={(node().uses?.length ?? 0) > 0 ? `${node().uses?.length ?? 0} linked` : undefined} />
          </DetailPanel.Properties>
        </DetailPanel.Section>}</Show>
      </DetailPanel.Main><DetailPanel.Rail aria-label="Structure properties"><DetailPanel.Section title="Properties" icon={<Settings size={14} />}><DetailPanel.Properties>
        <DetailPanel.Property label="Kind" value={projectSelected() ? "Project" : kindLabel(selected()!.level)} />
        <DetailPanel.Property label="Repository" value={projectSelected() ? props.projectRepository : selected()?.repo} />
        <DetailPanel.Property label="Owner" value={selected()?.owner} />
      </DetailPanel.Properties></DetailPanel.Section></DetailPanel.Rail></DetailPanel.Body></DetailPanel.Content>
    </Show>
    <A11yDialog open={!!props.createDialogOpen || moveOpen()} title={moveOpen() ? "Move node" : "Add structure node"} dismissible={!busy()} onClose={() => { if (!busy()) { setMoveOpen(false); props.onCloseCreate(); } }} footer={<>
      <Button variant="ghost" disabled={busy()} onClick={() => { setMoveOpen(false); props.onCloseCreate(); }}>Cancel</Button>
      <Button disabled={busy() || (!moveOpen() && !title().trim()) || ((moveOpen() || kind() !== "system") && !parents().some((node) => node.id === parent()))} onClick={() => void save(() => moveOpen() ? props.onMove(selected()!.id, parent()) : props.onCreate({ title: title().trim(), level: kind(), parentId: parent() }), () => { setMoveOpen(false); props.onCloseCreate(); })}>{busy() ? "Saving…" : "Save"}</Button>
    </>}>
      <FormStack><Show when={!moveOpen()}><Field label="Name"><Input value={title()} onInput={(event) => setTitle(event.currentTarget.value)} /></Field><Field label="Kind"><Select value={kind()} options={[{ value: "system", label: "System" }, { value: "domain", label: "Domain" }, { value: "component", label: "Component" }]} onChange={(value) => { setKind(value as StructureKind); setParent(""); }} /></Field></Show>
        <Show when={moveOpen() || kind() !== "system"}><Field label="Parent"><Select value={parent()} options={parentOptions()} onChange={setParent} placeholder="Choose a parent" /></Field><Show when={!parents().length}><p class="text-sm text-[var(--color-text-muted)]">Add a system before adding domains or components.</p></Show></Show>
        <Show when={formError()}><p role="alert" class="text-sm text-[var(--color-danger)]">{formError()}</p></Show>
      </FormStack>
    </A11yDialog>
    <A11yDialog open={usesOpen()} title="Dependencies" dismissible={!busy()} onClose={() => { if (!busy()) setUsesOpen(false); }} footer={<><Button variant="ghost" disabled={busy()} onClick={() => setUsesOpen(false)}>Cancel</Button><Button disabled={busy()} onClick={() => void save(() => props.onUses(selected()!.id, useTargets()), () => setUsesOpen(false))}>{busy() ? "Saving…" : "Save"}</Button></>}>
      <Show when={registry().some((node) => node.id !== selectedId())} fallback={<p class="text-sm text-[var(--color-text-muted)]">No other structure nodes yet.</p>}><FormStack><For each={registry().filter((node) => node.id !== selectedId())}>{(node) => <Checkbox label={node.title} checked={useTargets().includes(node.id)} onCheckedChange={(event) => setUseTargets((ids) => event.checked === true ? [...ids, node.id] : ids.filter((id) => id !== node.id))} />}</For></FormStack></Show>
      <Show when={formError()}><p role="alert" class="text-sm text-[var(--color-danger)]">{formError()}</p></Show>
    </A11yDialog>
    <A11yDialog open={deploysOpen()} title="Edit deploys" dismissible={!busy()} onClose={() => { if (!busy()) setDeploysOpen(false); }} footer={<>
      <Button variant="ghost" disabled={busy()} onClick={() => setDeploysOpen(false)}>Cancel</Button>
      <Button disabled={busy()} onClick={() => void saveDeploys()}>{busy() ? "Saving…" : "Save"}</Button>
    </>}>
      <FormStack>
        <Show when={deploysCount() > 0} fallback={
          <p class="text-sm text-[var(--color-text-muted)]">No deploys configured yet.</p>
        }>
          <Index each={editingDeploys()}>
            {(deploy, index) => (
              <div class="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Field label="Environment">
                  <Select value={deploy().environmentId} options={environmentOptions()} onChange={(value) => patchDeploy(index, { environmentId: value })} placeholder="Select environment" />
                </Field>
                <Field label="Provider">
                  <Select value={deploy().provider} options={providerOptions()} onChange={(value) => patchDeploy(index, { provider: value })} placeholder="Select provider" />
                </Field>
                <Field label="Resource">
                  <Input value={deploy().resource} onInput={(event) => patchDeploy(index, { resource: event.currentTarget.value })} placeholder="Resource name" />
                </Field>
                <Button variant="ghost" size="icon" onClick={() => removeDeployRow(index)} aria-label="Remove deploy"><Delete size={14} /></Button>
              </div>
            )}
          </Index>
        </Show>
        <Button variant="ghost" size="sm" onClick={addDeployRow}><Plus size={14} />Add deploy</Button>
        <Show when={formError()}><p role="alert" class="text-sm text-[var(--color-danger)]">{formError()}</p></Show>
      </FormStack>
    </A11yDialog>
  </EntityDetailHost>;
}

function sameIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function NodeCounts(props: { counts: Counts }) {
  return <div class="flex flex-wrap gap-2"><StatusChip tone="muted" label={`${props.counts.work} Work`} /><StatusChip tone="muted" label={`${props.counts.decisions} Decisions`} /><StatusChip tone="muted" label={`${props.counts.facts} Facts`} /></div>;
}
