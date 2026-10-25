import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { EntityDetailHost } from "@polterware/feature-shell";
import {
  A11yDialog, Boxes, Button, Card, Checkbox, DetailPanel, Field, FileText, Folder, FormStack, Input,
  Layers, ListChecks, PageContent, PageEmpty, PageError, PageLoading, PageToolbar, Plus,
  Scale, SearchBar, SegmentedControl, Select, StatusChip, TreeView, pushToast,
  type TreeViewNode,
} from "@polterware/frontend-design-system";
import { createDetailPanelSelector, detailPanelStore } from "@polterware/frontend-state";
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

function KindIcon(props: { kind: StructureKind | "project" }) {
  return <Show when={props.kind === "component"} fallback={<Show when={props.kind === "domain"} fallback={<Layers size={16} aria-hidden />}><Folder size={16} aria-hidden /></Show>}><Boxes size={16} aria-hidden /></Show>;
}
const kindLabel = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1);

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
}) {
  const [query, setQuery] = createSignal("");
  const [view, setView] = createSignal("tree");
  const [expanded, setExpanded] = createSignal<string[]>([PROJECT_ID]);
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
  const selected = createMemo(() => props.nodes.find((node) => node.id === selectedId()));
  const selectedCounts = () => selectedId() === PROJECT_ID ? props.projectCounts : props.counts[selectedId() ?? ""] ?? { work: 0, decisions: 0, facts: 0 };
  const registry = () => props.registryNodes ?? props.nodes;
  const parents = () => structureParents(registry(), moveOpen() ? selected()?.level ?? kind() : kind(), moveOpen() ? selected()?.id : undefined);
  const parentOptions = () => parents().map((node) => ({ value: node.id, label: `${node.title} (${kindLabel(node.level)})` }));
  const projectSelected = () => selectedId() === PROJECT_ID;
  const toTreeNode = (item: StructureTreeItem): TreeViewNode => ({
    id: item.node.id, label: item.node.title, icon: <KindIcon kind={item.node.level} />,
    trailing: <span class="text-xs text-[var(--color-text-muted)]">{kindLabel(item.node.level)}</span>,
    children: item.children.map(toTreeNode),
  });
  const treeNodes = createMemo<TreeViewNode[]>(() => [{ id: PROJECT_ID, label: props.projectName, icon: <KindIcon kind="project" />,
    trailing: <span class="text-xs text-[var(--color-text-muted)]">Project</span>, children: tree().map(toTreeNode) }]);
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
  createEffect(() => { const id = selectedId(); if (id) props.onSelect(id); });
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
      <PageToolbar.Leading><SearchBar placeholder="Search structure…" value={query()} onInput={setQuery} /></PageToolbar.Leading>
      <PageToolbar.Actions>
        <SegmentedControl aria-label="Structure view" options={[{ value: "tree", label: "Tree" }, { value: "cards", label: "Cards" }]} value={view()} onValueChange={(event) => setView(event.value ?? "tree")} />
        <Button size="sm" disabled={props.loading || !!props.error} onClick={props.onOpenCreate}><Plus size={14} />Add</Button>
      </PageToolbar.Actions>
    </PageToolbar.Root>
    <Show when={props.loading} fallback={<Show when={props.error} fallback={
      <PageContent class="pw-scroll-fade overflow-auto p-4">
        <Show when={view() === "tree"} fallback={<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Button variant="ghost" class="h-auto p-0 text-left" data-detail-opener data-detail-target-id={PROJECT_ID} onClick={() => open(PROJECT_ID)}><Card variant="texture" class="flex w-full flex-col gap-2"><span class="flex items-center gap-2"><KindIcon kind="project" />{props.projectName}</span><span class="text-xs text-[var(--color-text-muted)]">Project</span><NodeCounts counts={props.projectCounts} /></Card></Button>
          <For each={visible()}>{(node) => <Button variant="ghost" class="h-auto p-0 text-left" data-detail-opener data-detail-target-id={node.id} onClick={() => open(node.id)}><Card variant="texture" class="flex w-full flex-col gap-2">
            <span class="flex items-center gap-2"><KindIcon kind={node.level} />{node.title}</span>
            <span class="text-xs text-[var(--color-text-muted)]">{kindLabel(node.level)}</span>
            <NodeCounts counts={props.counts[node.id] ?? { work: 0, decisions: 0, facts: 0 }} />
          </Card></Button>}</For>
        </div>}>
          <TreeView label="Project structure" nodes={treeNodes()} expandedValue={expanded()} onExpandedChange={(event) => setExpanded(event.expandedValue)} selectedValue={selectedId() ? [selectedId()!] : []} onSelectionChange={(event) => { const id = event.selectedValue[0]; if (id) open(id); }} />
        </Show>
        <Show when={!visible().length}><PageEmpty title={query().trim() ? "No matching nodes" : "No structure nodes yet"} description={query().trim() ? "Try another name, kind or path." : "Add a system, then organize its domains and components."} /></Show>
      </PageContent>
    }><PageError message={props.error!} /></Show>}><PageLoading label="Loading structure…" /></Show>
    <Show when={selected() || projectSelected()}>
      <DetailPanel.Content><DetailPanel.Header /><DetailPanel.Body><DetailPanel.Main>
        <DetailPanel.Title title={projectSelected() ? props.projectName : selected()!.title} icon={<KindIcon kind={projectSelected() ? "project" : selected()!.level} />} />
        <DetailPanel.Section title="Properties" icon={<Layers size={14} />}><DetailPanel.Properties>
          <DetailPanel.Property label="Name" value={projectSelected() ? props.projectName : selected()?.title} />
          <DetailPanel.Property label="Kind" value={projectSelected() ? "Project" : kindLabel(selected()!.level)} />
          <DetailPanel.Property label="Repository" value={(projectSelected() ? props.projectRepository : selected()?.repo) || "Project root"} />
          <DetailPanel.Property label="Owner" value={selected()?.owner || "Not recorded"} />
        </DetailPanel.Properties></DetailPanel.Section>
        <DetailPanel.Section title="Description" icon={<FileText size={14} />}><p class="text-sm text-[var(--color-text-secondary)]">{(projectSelected() ? props.projectDescription : selected()?.intent) || "No description yet."}</p></DetailPanel.Section>
        <DetailPanel.Section title="Deploys" icon={<Boxes size={14} />}>
          {(() => {
            const node = selected();
            if (node && node.level === "component") {
              return (
                <>
                  <div class="flex items-center justify-between mb-2">
                    <Show when={node.deploys && node.deploys.length > 0} fallback={<p class="text-sm text-[var(--color-text-muted)]">No deploy target yet.</p>}>
                      <ul class="flex flex-col gap-2"><For each={node.deploys!}>{(deploy) => <li class="flex flex-wrap items-center gap-2 text-sm"><span>{deploy.environment || deploy.environmentId}</span><StatusChip tone="muted" label={deploy.provider} /><span>{deploy.resource}</span>{!isProviderConnected(deploy.provider) && <StatusChip tone="warn" label="CLI not connected" />}</li>}</For></ul>
                    </Show>
                    <Button variant="ghost" size="sm" onClick={() => openDeploysDialog(node)}>Edit deploys</Button>
                  </div>
                </>
              );
            }
            if (node && node.level !== "component" && !projectSelected()) {
              return <p class="text-sm text-[var(--color-text-muted)]">Deploys are only available for components.</p>;
            }
            return null;
          })()}
        </DetailPanel.Section>
        <DetailPanel.Section title="Linked records" icon={<ListChecks size={14} />}><NodeCounts counts={selectedCounts()} /></DetailPanel.Section>
        <Show when={selected()}>{(node) => <DetailPanel.Section title="Structure" icon={<Scale size={14} />}>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" disabled={node().level === "system"} onClick={() => { setParent(node().parentId); setFormError(""); setMoveOpen(true); }}>Move</Button>
            <Button variant="ghost" size="sm" onClick={() => { setUseTargets(registry().filter((item) => node().uses?.includes(item.path)).map((item) => item.id)); setFormError(""); setUsesOpen(true); }}>Edit dependencies</Button>
          </div>
        </DetailPanel.Section>}</Show>
      </DetailPanel.Main></DetailPanel.Body></DetailPanel.Content>
    </Show>
    <A11yDialog open={!!props.createDialogOpen || moveOpen()} title={moveOpen() ? "Move node" : "Add structure node"} dismissible={!busy()} onClose={() => { if (!busy()) { setMoveOpen(false); props.onCloseCreate(); } }} footer={<>
      <Button variant="ghost" disabled={busy()} onClick={() => { setMoveOpen(false); props.onCloseCreate(); }}>Cancel</Button>
      <Button disabled={busy() || (!moveOpen() && !title().trim()) || ((moveOpen() || kind() !== "system") && !parents().some((node) => node.id === parent()))} onClick={() => void save(() => moveOpen() ? props.onMove(selected()!.id, parent()) : props.onCreate({ title: title().trim(), level: kind(), parentId: parent() }), () => { setMoveOpen(false); props.onCloseCreate(); })}>{busy() ? "Saving…" : "Save"}</Button>
    </>}>
      <FormStack><Show when={!moveOpen()}><Field label="Name"><Input value={title()} onInput={(event) => setTitle(event.currentTarget.value)} /></Field><Field label="Kind"><Select value={kind()} options={[{ value: "system", label: "System" }, { value: "domain", label: "Domain" }, { value: "component", label: "Component" }]} onChange={(value) => { setKind(value as StructureKind); setParent(""); }} /></Field></Show>
        <Show when={moveOpen() || kind() !== "system"}><Field label="Parent"><Select value={parent()} options={parentOptions()} onChange={setParent} placeholder="Choose a parent" /></Field><Show when={!parents().length}><p class="text-sm text-[var(--color-text-muted)]">Add a system before adding domains or components.</p></Show></Show>
        <Show when={formError()}><p role="alert">{formError()}</p></Show>
      </FormStack>
    </A11yDialog>
    <A11yDialog open={usesOpen()} title="Dependencies" dismissible={!busy()} onClose={() => { if (!busy()) setUsesOpen(false); }} footer={<><Button variant="ghost" disabled={busy()} onClick={() => setUsesOpen(false)}>Cancel</Button><Button disabled={busy()} onClick={() => void save(() => props.onUses(selected()!.id, useTargets()), () => setUsesOpen(false))}>{busy() ? "Saving…" : "Save"}</Button></>}>
      <Show when={registry().some((node) => node.id !== selectedId())} fallback={<p class="text-sm text-[var(--color-text-muted)]">No other structure nodes yet.</p>}><FormStack><For each={registry().filter((node) => node.id !== selectedId())}>{(node) => <Checkbox label={node.title} checked={useTargets().includes(node.id)} onCheckedChange={(event) => setUseTargets((ids) => event.checked === true ? [...ids, node.id] : ids.filter((id) => id !== node.id))} />}</For></FormStack></Show>
      <Show when={formError()}><p role="alert">{formError()}</p></Show>
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
              <div class="flex flex-wrap items-center gap-2 mb-3">
                <Field label="Environment" class="flex-1 min-w-[140px]">
                  <Select value={deploy().environmentId} options={environmentOptions()} onChange={(value) => patchDeploy(index, { environmentId: value })} placeholder="Select environment" />
                </Field>
                <Field label="Provider" class="flex-1 min-w-[140px]">
                  <Select value={deploy().provider} options={providerOptions()} onChange={(value) => patchDeploy(index, { provider: value })} placeholder="Select provider" />
                </Field>
                <Field label="Resource" class="flex-1 min-w-[140px]">
                  <Input value={deploy().resource} onInput={(event) => patchDeploy(index, { resource: event.currentTarget.value })} placeholder="Resource name" />
                </Field>
                <Button variant="ghost" size="icon" onClick={() => removeDeployRow(index)} aria-label="Remove deploy"><span class="sr-only">Remove</span>×</Button>
              </div>
            )}
          </Index>
        </Show>
        <Button variant="ghost" size="sm" onClick={addDeployRow}><Plus size={14} />Add deploy</Button>
        <Show when={formError()}><p role="alert">{formError()}</p></Show>
      </FormStack>
    </A11yDialog>
  </EntityDetailHost>;
}

function NodeCounts(props: { counts: Counts }) {
  return <div class="flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]"><span>{props.counts.work} Work cards</span><span>{props.counts.decisions} Decisions</span><span>{props.counts.facts} Facts</span></div>;
}
