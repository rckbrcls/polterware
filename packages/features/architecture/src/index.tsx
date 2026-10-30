import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, untrack, type JSX } from "solid-js";
import { createPageFilters, type EnvironmentItem, type ScopeFilterToken, type ScopeNodeItem } from "@polterware/feature-shell";
import {
  A11yDialog, Boxes, Button, PromptCardGrid, Checkbox, Field, Folder, FormStack, Input,
  ActiveFilterBar, FilterPopover, IconTile, Layers, PageContent, PageEmpty, PageError, PageLoading, PageToolbar, Plus,
  Cloud, Delete, EntityContextMenu, EntityMenuButton, Link2, Package, Route,
  GitBranch, InformationCircle, RailGroup, SearchBar, Select, StatusChip, TreeView, animateCollapse, createEntityContextMenu, pushToast,
  type CollapseControls,
  type EntityAction, type TreeViewNode,
  ToolbarIconButton,
} from "@polterware/frontend-design-system";
import { createDetailPanelSelector, detailPanelStore, readRemembered, writeRemembered } from "@polterware/frontend-state";
import { COMPONENTS, component } from "@polterware/feature-canvas/components";
import { STRUCTURE_AGENT_PROMPTS } from "./agent-prompts";
import { buildStructureTree, flattenStructureTree, structureParents, type StructureKind, type StructureNode, type StructureTreeItem } from "./structure-tree";
import type { ProjectEnvironment } from "./domain/project-environments";
import type { WorkspaceIntegration } from "@polterware/feature-shell";
import "./structure.css";

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

/** The component kind's palette label (`database` reads Database); unknown kinds read as written. */
export function componentKindLabel(kind: string): string {
  return component(kind)?.label ?? kind;
}

/** `repo/folder`, the repo, or the folder alone; empty at the project checkout root. */
export function checkoutLabel(repo = "", folder = ""): string {
  return repo && folder ? `${repo}/${folder}` : repo || folder;
}

/** A component's kind and technology ("Database / Postgres"), or the node's level. */
function levelLabel(node: Pick<StructureNode, "level" | "kind" | "tech">): string {
  if (node.level !== "component") return kindLabel(node.level);
  const kind = node.kind ? componentKindLabel(node.kind) : "Component";
  return node.tech ? `${kind} / ${node.tech}` : kind;
}

function plural(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/** "2 cards / 1 decision / 3 facts", leaving out the empty ones; empty when there are none. */
function recordsLabel(counts: Counts | undefined): string {
  if (!counts) return "";
  return [counts.work ? plural(counts.work, "card") : "", counts.decisions ? plural(counts.decisions, "decision") : "", counts.facts ? plural(counts.facts, "fact") : ""]
    .filter(Boolean).join(" / ");
}

/** A card's details region: collapses to its measured height on the shared springs, snapping on first paint. */
function NodeExpand(props: { open: boolean; children: JSX.Element }) {
  let region: HTMLDivElement | undefined;
  let controls: CollapseControls | undefined;
  let first = true;
  createEffect(() => {
    const open = props.open;
    if (!region) return;
    controls = animateCollapse(region, open, { previous: controls, instant: first });
    first = false;
  });
  onCleanup(() => controls?.stop());
  // Clicks inside the open details (selecting a path) stay there instead of closing the card.
  return <div ref={region} class="pw-structure-expand" hidden onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    {props.children}
  </div>;
}

/**
 * What a card shows when it expands, in groups titled with a 24px icon tile as on every
 * other page (`RailGroup`), side by side in columns that wrap: About, Checkout (repo/folder
 * and path), Uses, and Deploys. Empty groups are left out.
 */
function NodeInfo(props: { description?: string; checkout?: string; path?: string; uses?: readonly string[]; deploys?: StructureNode["deploys"]; isProviderConnected: (provider: string) => boolean }) {
  return <div class="pw-structure-info">
    <RailGroup title="About" icon={<InformationCircle size={14} />}>
      <Show when={props.description} fallback={<p class="pw-structure-info__empty">No description yet.</p>}>{(text) => <p class="pw-structure-info__text">{text()}</p>}</Show>
    </RailGroup>
    <Show when={props.checkout || props.path}>
      <RailGroup title="Checkout" icon={<GitBranch size={14} />}>
        <dl class="pw-structure-info__rows">
          <Show when={props.checkout}><dt>Folder</dt><dd class="pw-selectable font-mono">{props.checkout}</dd></Show>
          <Show when={props.path}><dt>Path</dt><dd class="pw-selectable font-mono">{props.path}</dd></Show>
        </dl>
      </RailGroup>
    </Show>
    <Show when={props.uses?.length}>
      <RailGroup title="Uses" icon={<Link2 size={14} />}>
        <p class="pw-structure-info__text">{props.uses!.join(" / ")}</p>
      </RailGroup>
    </Show>
    <Show when={props.deploys?.length}>
      <RailGroup title="Deploys" icon={<Cloud size={14} />}>
        <ul class="pw-structure-info__deploys" aria-label="Deploys">
          <For each={props.deploys!}>{(deploy) => <li>
            <span class="truncate text-[var(--color-text-primary)]">{deploy.resource}</span>
            <span class="truncate">{deploy.provider} / {deploy.environment || deploy.environmentId}</span>
            <Show when={!props.isProviderConnected(deploy.provider)}><StatusChip tone="warn" label="CLI not connected" /></Show>
          </li>}</For>
        </ul>
      </RailGroup>
    </Show>
  </div>;
}

/** A tree card's one line after its title: kind / technology and the record counts, then Add child and the actions. */
function NodeLine(props: { meta: string; addLabel?: string; onAdd?: () => void; title: string; actions: readonly EntityAction[] }) {
  return <span class="pw-structure-line" onKeyDown={(event) => event.stopPropagation()}>
    <span class="pw-structure-line__meta">{props.meta}</span>
    <Show when={props.onAdd}>
      <span class="pw-structure-line__add">
        <Button size="icon" variant="ghost" aria-label={props.addLabel ?? "Add child"} onClick={(event) => { event.stopPropagation(); props.onAdd?.(); }}><Plus size={14} /></Button>
      </span>
    </Show>
    <EntityMenuButton label={`Actions for ${props.title}`} actions={props.actions} />
  </span>;
}

// A click expands the card, so the tree keeps no selection of its own and every click reports.
const NO_SELECTION: string[] = [];
const NO_KIND = "none";
const KIND_OPTIONS = [{ value: NO_KIND, label: "None" }, ...COMPONENTS.map((item) => ({ value: item.kind, label: item.label }))];

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
  /** Writes a component's kind and technology; empty values clear them. */
  onKindTechChange?: (nodeId: string, kind: string, tech: string) => Promise<void>;
  scopeTokens?: readonly ScopeFilterToken[];
  scopeNodes?: readonly ScopeNodeItem[];
  scopeEnvironments?: readonly EnvironmentItem[];
  onScopeTokensChange?: (tokens: ScopeFilterToken[]) => void;
}) {
  const [query, setQuery] = createSignal("");
  // Expanded tree rows are remembered, so returning to Structure keeps the same layout.
  const [expanded, setExpanded] = createSignal<string[]>(readRemembered("structure.expanded", [PROJECT_ID]));
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
  const [kindTechOpen, setKindTechOpen] = createSignal(false);
  const [draftKind, setDraftKind] = createSignal("");
  const [draftTech, setDraftTech] = createSignal("");
  const techHint = () => {
    const suggestions = component(draftKind())?.technologies ?? [];
    return suggestions.length ? `e.g. ${suggestions.slice(0, 3).join(", ")}` : "e.g. Go, Postgres";
  };
  const [editingDeploys, setEditingDeploys] = createSignal<{ environmentId: string; provider: string; resource: string }[]>([]);
  const target = createDetailPanelSelector((state) => state.activeTarget);
  const tree = createMemo(() => buildStructureTree(props.nodes, query()));
  const visible = createMemo(() => flattenStructureTree(tree()));
  const selectedId = () => target()?.scopeId === STRUCTURE_SCOPE ? target()?.entityId : undefined;
  const selected = createMemo(() => props.nodes.find((node) => node.id === selectedId()));
  const registry = () => props.registryNodes ?? props.nodes;
  const parents = () => structureParents(registry(), moveOpen() ? selected()?.level ?? kind() : kind(), moveOpen() ? selected()?.id : undefined);
  const parentOptions = () => parents().map((node) => ({ value: node.id, label: `${node.title} (${kindLabel(node.level)})` }));
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

  const usesTitles = (node: StructureNode) => (node.uses ?? []).map((path) => registry().find((item) => item.path === path)?.title ?? path);
  // Actions select their node first: the dialogs below act on the selection.
  const nodeActions = (node: StructureNode): EntityAction[] => [
    ...(node.level === "component" ? [] : [{ id: "add-child", label: node.level === "system" ? "Add domain" : "Add component", icon: Plus, onSelect: () => { open(node.id); props.onOpenCreate(); } }]),
    { id: "move", label: "Move", icon: Route, disabled: node.level === "system", onSelect: () => { open(node.id); setParent(node.parentId); setFormError(""); setMoveOpen(true); } },
    { id: "uses", label: "Dependencies", icon: Link2, onSelect: () => { open(node.id); setUseTargets(registry().filter((item) => node.uses?.includes(item.path)).map((item) => item.id)); setFormError(""); setUsesOpen(true); } },
    ...(node.level === "component" && props.onKindTechChange ? [{ id: "kind-tech", label: "Kind and technology", icon: Package, onSelect: () => { open(node.id); setDraftKind(node.kind ?? ""); setDraftTech(node.tech ?? ""); setFormError(""); setKindTechOpen(true); } }] : []),
    ...(node.level === "component" && props.onDeploysChange ? [{ id: "deploys", label: "Edit deploys", icon: Cloud, onSelect: () => { open(node.id); openDeploysDialog(node); } }] : []),
  ];
  const projectActions = (): EntityAction[] => [{ id: "add-system", label: "Add system", icon: Plus, disabled: !!props.loading || !!props.error, onSelect: () => { open(PROJECT_ID); props.onOpenCreate(); } }];
  const rowMenu = createEntityContextMenu();
  const addChild = (id: string) => { open(id); props.onOpenCreate(); };
  const meta = (parts: readonly string[]) => parts.filter(Boolean).join(" / ");
  const toTreeNode = (item: StructureTreeItem): TreeViewNode => ({
    id: item.node.id, label: item.node.title, icon: <IconTile size={20} tone="neutral" seed={item.node.id}><KindIcon kind={item.node.level} size={12} /></IconTile>,
    trailing: <NodeLine title={item.node.title} actions={nodeActions(item.node)} meta={meta([levelLabel(item.node), recordsLabel(props.counts[item.node.id])])}
      onAdd={item.node.level === "component" ? undefined : () => addChild(item.node.id)} addLabel={`Add child to ${item.node.title}`} />,
    onContextMenu: (event) => rowMenu.open(event, nodeActions(item.node)),
    details: <NodeExpand open={detailsOpen(item.node.id)}><NodeInfo description={item.node.intent} checkout={checkoutLabel(item.node.repo, item.node.folder)} path={item.node.path}
      uses={usesTitles(item.node)} deploys={item.node.level === "component" ? item.node.deploys : undefined} isProviderConnected={isProviderConnected} /></NodeExpand>,
    children: item.children.map(toTreeNode),
  });
  const treeNodes = createMemo<TreeViewNode[]>(() => props.loading || props.error ? [] : [{
    id: PROJECT_ID, label: props.projectName, icon: <IconTile size={20} tone="neutral" seed={PROJECT_ID}><KindIcon kind="project" size={12} /></IconTile>,
    trailing: <NodeLine title={props.projectName} actions={projectActions()} meta={meta(["Project", recordsLabel(props.projectCounts)])}
      onAdd={props.loading || props.error ? undefined : () => addChild(PROJECT_ID)} addLabel="Add system" />,
    onContextMenu: (event) => rowMenu.open(event, projectActions()),
    details: <NodeExpand open={detailsOpen(PROJECT_ID)}><NodeInfo description={props.projectDescription} checkout={props.projectRepository} isProviderConnected={isProviderConnected} /></NodeExpand>,
    children: tree().map(toTreeNode),
  }]);

  // A card expands in place to show its details; another click folds it again.
  const [openDetails, setOpenDetails] = createSignal<string[]>([]);
  const detailsOpen = (id: string) => openDetails().includes(id);
  const toggleDetails = (id: string) => setOpenDetails((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  // A card carries its own details, so the collection only tracks the selection (for links and dialogs) and offers no panel.
  createEffect(() => {
    const targets = [PROJECT_ID, ...visible().map((node) => node.id)].map((entityId) => ({ scopeId: STRUCTURE_SCOPE, entityId, entityKind: "arch-node" }));
    detailPanelStore.getState().registerCollection({ scopeId: STRUCTURE_SCOPE, status: props.loading ? "loading" : props.error ? "error" : "ready", targets, details: false, selectFirst: false });
  });
  onCleanup(() => detailPanelStore.getState().unregisterCollection(STRUCTURE_SCOPE));
  createEffect(() => { const id = selectedId(); if (id) untrack(() => props.onSelect(id)); });
  // The selected row stays visible: its ancestors open when the selection moves.
  createEffect(() => {
    const id = selectedId();
    if (!id || id === PROJECT_ID) return;
    const ancestors: string[] = [PROJECT_ID];
    for (let node = props.nodes.find((item) => item.id === id); node?.parentId; node = props.nodes.find((item) => item.id === node!.parentId)) ancestors.push(node.parentId);
    untrack(() => { const current = expanded(); const next = [...new Set([...current, ...ancestors])]; if (next.length !== current.length) setExpanded(next); });
  });
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

  const filters = createPageFilters({
    surface: "structure",
    fields: () => [],
    scope: {
      tokens: () => props.scopeTokens ?? [],
      nodes: () => props.scopeNodes ?? [],
      environments: () => props.scopeEnvironments ?? [],
      allowEnv: true,
      onTokensChange: (tokens) => props.onScopeTokensChange?.(tokens),
    },
  });

  return <div class="flex min-h-0 flex-1 flex-col">
    <PageToolbar.Root>
      <PageToolbar.Leading>{null}</PageToolbar.Leading>
      <PageToolbar.Actions>
        <SearchBar placeholder="Search structure…" value={query()} onInput={setQuery} />
        <FilterPopover
          ariaLabel="Structure filters"
          title="Filter structure"
          shortcut
          fields={filters.fields()}
          clauses={filters.clauses()}
          onClausesChange={filters.onClausesChange}
          saved={filters.saved()}
        />
        <ToolbarIconButton label="Add node" disabled={props.loading || !!props.error} onClick={props.onOpenCreate}><Plus size={14} /></ToolbarIconButton>
      </PageToolbar.Actions>
    </PageToolbar.Root>
    <ActiveFilterBar
      fields={filters.fields()}
      clauses={filters.clauses()}
      onClausesChange={filters.onClausesChange}
      saved={filters.saved()}
    />
    <Show when={props.loading} fallback={<Show when={props.error} fallback={
      <PageContent class="pw-scroll-fade overflow-auto p-4">
                <Show when={visible().length} fallback={<PageEmpty title={query().trim() ? "No matches" : "No structure yet"} mood={query().trim() ? "lost" : "sleeping"} >{!query().trim() ? <PromptCardGrid items={STRUCTURE_AGENT_PROMPTS.map((item) => ({ id: item.id, title: item.title, description: item.description, tone: item.tone, icon: <KindIcon kind={item.level} size={16} />, prompt: item.prompt }))} /> : undefined}</PageEmpty>}>
          <EntityContextMenu menu={rowMenu} />
          <TreeView label="Project structure" branches expandOnClick={false} class="[&>h3]:sr-only" nodes={treeNodes()} expandedValue={expanded()} onExpandedChange={(event) => setExpanded((current) => sameIds(current, event.expandedValue) ? current : event.expandedValue)} selectedValue={NO_SELECTION} onSelectionChange={(event) => { const id = event.selectedValue[0]; if (id) { open(id); toggleDetails(id); } }} />
        </Show>
      </PageContent>
    }><PageError message={props.error!} /></Show>}><PageLoading label="Loading structure…" /></Show>
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
    <A11yDialog open={kindTechOpen()} title="Kind and technology" dismissible={!busy()} onClose={() => { if (!busy()) setKindTechOpen(false); }} footer={<>
      <Button variant="ghost" disabled={busy()} onClick={() => setKindTechOpen(false)}>Cancel</Button>
      <Button disabled={busy()} onClick={() => void save(() => props.onKindTechChange!(selected()!.id, draftKind(), draftTech().trim()), () => setKindTechOpen(false))}>{busy() ? "Saving…" : "Save"}</Button>
    </>}>
      <FormStack>
        <Field label="Kind" hint="What this component is. The canvas uses the same kinds.">
          <Select aria-label="Component kind" value={draftKind() || NO_KIND} options={KIND_OPTIONS} onChange={(value) => setDraftKind(value === NO_KIND ? "" : value)} />
        </Field>
        <Field label="Technology" hint="Free text: the language, framework, or product it is built with.">
          <Input aria-label="Technology" value={draftTech()} placeholder={techHint()} onInput={(event) => setDraftTech(event.currentTarget.value)} />
        </Field>
        <Show when={formError()}><p role="alert" class="text-sm text-[var(--color-danger)]">{formError()}</p></Show>
      </FormStack>
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
  </div>;
}

function sameIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
