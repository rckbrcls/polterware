import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, untrack, type JSX } from "solid-js";
import {
  A11yDialog, Boxes, Button, Card, Cpu, EntityMenuButton, PromptCardGrid, Field, Folder, FormStack, Input,
  CollapsibleSection, DataTable, IconTile, Layers, PageContent, PageEmpty, PageError, PageLoading, PageToolbar, Plus,
  Cloud, Delete, DetailPanel, Link2, Package, Pencil, PropertyPicker, Route, Textarea, XIcon,
  Scale, ShieldCheck, FileText, GitBranch, Select, SidebarLeftIcon, FolderKanban, StatusChip, TreeView, pushToast,
  type EntityAction, type TreeViewNode,
} from "@polterware/frontend-design-system";
import { createDetailPanelSelector, detailPanelStore, readRemembered, writeRemembered } from "@polterware/frontend-state";
import { COMPONENTS, component } from "@polterware/feature-canvas/components";
import { STRUCTURE_AGENT_PROMPTS } from "./agent-prompts";
import { buildStructureTree, flattenStructureTree, structureParents, type StructureKind, type StructureNode, type StructureTreeItem } from "./structure-tree";
import type { ProjectEnvironment } from "./domain/project-environments";
import type { WorkspaceIntegration } from "@polterware/feature-shell";
import { createTreePane } from "./tree-pane";
import "./structure.css";

export type { ArchViewCard } from "./extra-fixtures";
export { filterStructureNodes } from "./structure-tree";
export type { StructureNode } from "./structure-tree";
export const STRUCTURE_SCOPE = "structure:nodes";
const PROJECT_ID = "structure:project";
/** One thing that cites a node: a card (by slug), decision, fact, or doc, with a muted caption such as its stage. */
/** `direct` marks a link the node owns (a card under it, a record scoped to it), which its document can remove. */
export type StructureRecord = { id: string; title: string; caption?: string; direct?: boolean };
/** The fields of a node its document edits in place; a field left out is unchanged, and an empty value clears it. */
export type StructureNodePatch = { title?: string; intent?: string; repo?: string; folder?: string; kind?: string; tech?: string };
export type StructureRecordKind = "card" | "decision" | "fact" | "doc";
export type StructureRecords = { cards: readonly StructureRecord[]; decisions: readonly StructureRecord[]; facts: readonly StructureRecord[]; docs: readonly StructureRecord[] };
const NO_RECORDS: StructureRecords = { cards: [], decisions: [], facts: [], docs: [] };
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

/** A titled block of the document, set apart by space alone: the title, a count, a fold chevron, and its actions. */
function DocumentSection(props: { title: string; count?: number; actions?: JSX.Element; children: JSX.Element }) {
  return <CollapsibleSection class="pw-structure__section" title={props.title} aside={props.count === undefined ? undefined : String(props.count)} actions={props.actions}>{props.children}</CollapsibleSection>;
}

/** The cards, decisions, facts, or docs that cite a node, on the ring Card, one row each with its status on the right; a row opens its page, and a direct link can be removed. */
function RecordTable(props: { label: string; rows: readonly StructureRecord[]; icon: JSX.Element; onOpen?: (id: string) => void; onUnlink?: (id: string) => void }) {
  return <Card class="pw-structure__records"><DataTable.Root rows={props.rows} getRowId={(row) => row.id} density="list">
    <DataTable.Table aria-label={props.label}>
      <DataTable.Body<StructureRecord>>
        {(row) => <DataTable.Row row={row} rowId={row.id} aria-label={row.title} onActivate={props.onOpen ? () => props.onOpen!(row.id) : undefined}>
          <DataTable.PrimaryCell icon={props.icon} iconTone="neutral" iconSeed={row.id} title={row.title} />
          <DataTable.Cell align="right">
            <span class="pw-structure__row-end">
              <span class="text-[var(--color-text-muted)]">{row.caption}</span>
              <Show when={props.onUnlink && row.direct}>
                <span class="pw-structure__row-unlink">
                  <Button size="icon" variant="ghost" aria-label={`Unlink ${row.title}`} onClick={(event) => { event.stopPropagation(); props.onUnlink!(row.id); }}><XIcon size={14} /></Button>
                </span>
              </Show>
            </span>
          </DataTable.Cell>
        </DataTable.Row>}
      </DataTable.Body>
    </DataTable.Table>
  </DataTable.Root></Card>;
}

const RECORD_SECTIONS = [
  { key: "cards", kind: "card", title: "Cards", Icon: FolderKanban },
  { key: "decisions", kind: "decision", title: "Decisions", Icon: Scale },
  { key: "facts", kind: "fact", title: "Facts", Icon: ShieldCheck },
  { key: "docs", kind: "doc", title: "Docs", Icon: FileText },
] as const;

/** One labeled line of the document head: a muted label column, then the values inline. */
function HeadRow(props: { label: string; children: JSX.Element }) {
  return <div class="pw-structure__head-row"><dt>{props.label}</dt><dd>{props.children}</dd></div>;
}

/** A read-only inline value of the document head: a muted icon and the value. */
function HeadValue(props: { icon: JSX.Element; mono?: boolean; children: JSX.Element }) {
  return <span class="pw-structure__value" classList={{ "pw-structure__value--mono": props.mono }}><span class="pw-structure__value-icon" aria-hidden>{props.icon}</span>{props.children}</span>;
}

/**
 * Text that edits in place on the shared Input or Textarea with no field chrome. It commits on
 * blur or Enter (Shift+Enter breaks a line in a multiline field) and Escape restores the value.
 */
function InlineText(props: { label: string; value: string; placeholder: string; class?: string; multiline?: boolean; required?: boolean; onCommit: (value: string) => void }) {
  const [draft, setDraft] = createSignal(props.value);
  createEffect(() => setDraft(props.value));
  const commit = () => {
    const next = draft().trim();
    if (props.required && !next) { setDraft(props.value); return; }
    if (next !== props.value.trim()) props.onCommit(next);
  };
  const onKeyDown = (event: KeyboardEvent & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
    if (event.key === "Escape") { event.preventDefault(); setDraft(props.value); event.currentTarget.blur(); }
    else if (event.key === "Enter" && !(props.multiline && event.shiftKey)) { event.preventDefault(); event.currentTarget.blur(); }
  };
  return <Show when={props.multiline} fallback={
    <Input aria-label={props.label} class={`pw-document__ghost-field ${props.class ?? ""}`} value={draft()} placeholder={props.placeholder}
      onInput={(event) => setDraft(event.currentTarget.value)} onBlur={commit} onKeyDown={onKeyDown} />
  }>
    <Textarea aria-label={props.label} rows={1} class={`pw-document__ghost-field ${props.class ?? ""}`} value={draft()} placeholder={props.placeholder}
      onInput={(event) => setDraft(event.currentTarget.value)} onBlur={commit} onKeyDown={onKeyDown} />
  </Show>;
}

/** A head value set from a short list: a ghost button with the value (or a muted placeholder) that opens the shared PropertyPicker. */
function PickerValue(props: { label: string; icon: JSX.Element; value?: string; placeholder: string; options: readonly { value: string; label: string }[]; mono?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = createSignal(false);
  let trigger: HTMLButtonElement | undefined;
  const current = () => props.options.find((option) => option.value === props.value)?.label ?? props.value;
  return <>
    <Button ref={trigger} variant="ghost" size="sm" class="pw-structure__pick" aria-label={`${props.label}: ${current() || "none"}`} aria-expanded={open()} onClick={() => setOpen((value) => !value)}>
      <span class="pw-structure__value-icon" aria-hidden>{props.icon}</span>
      <span classList={{ "pw-structure__value-muted": !current(), "font-mono": props.mono && !!current() }}>{current() || props.placeholder}</span>
    </Button>
    <PropertyPicker label={props.label} options={props.options} value={props.value} open={open()} onClose={() => setOpen(false)} anchorRef={() => trigger}
      onChange={(value) => { setOpen(false); props.onChange(value); }} />
  </>;
}

/** A section heading's add button: opens the PropertyPicker of what can still be linked. */
function LinkButton(props: { label: string; options: readonly { value: string; label: string }[]; onPick: (value: string) => void }) {
  const [open, setOpen] = createSignal(false);
  let trigger: HTMLButtonElement | undefined;
  return <>
    <Button ref={trigger} size="icon" variant="ghost" aria-label={props.label} aria-expanded={open()} disabled={!props.options.length} onClick={() => setOpen((value) => !value)}><Plus size={14} /></Button>
    <PropertyPicker label={props.label} options={props.options} open={open()} onClose={() => setOpen(false)} anchorRef={() => trigger} placement="bottom-end"
      onChange={(value) => { setOpen(false); props.onPick(value); }} />
  </>;
}

/** What a document shows and edits; `project` is the project's own document. */
type NodeDocumentModel = {
  id: string; project: boolean; title: string; level: StructureKind | "project"; description?: string;
  kind?: string; tech?: string; repo?: string; folder?: string; path?: string;
  uses: readonly { id: string; title: string }[]; deploys?: StructureNode["deploys"]; records: StructureRecords;
};

/** The writes a document makes; each is left out where it cannot apply. */
type NodeDocumentEdits = {
  title?: (value: string) => void;
  description?: (value: string) => void;
  patch?: (patch: StructureNodePatch) => void;
  uses?: (ids: string[]) => void;
  usesOptions?: readonly { value: string; label: string }[];
  repositories?: readonly string[];
  editDeploys?: () => void;
  /** What each record section can still link, by kind; a kind left out has no add button. */
  linkOptions?: Partial<Record<StructureRecordKind, readonly { value: string; label: string }[]>>;
  link?: (kind: StructureRecordKind, id: string) => void;
  unlink?: (kind: StructureRecordKind, id: string) => void;
};

/**
 * The selected node as a document beside the tree, laid out like a Linear project overview
 * and edited in place: a 36px kind tile, the title, and the description as its summary; then
 * the node's actions in the header's top right; labeled lines (Properties with the level, kind, and technology;
 * Checkout with the repository and folder; Uses; Deploys); then, set well apart, a collapsible
 * section per kind of record that cites the node, where a + links one more and a row's × unlinks
 * a direct link. Read-only values and empty sections that cannot be linked are left out.
 */
function NodeDocument(props: { doc: NodeDocumentModel; actions: readonly EntityAction[]; edits: NodeDocumentEdits; isProviderConnected: (provider: string) => boolean; onOpenRecord?: (kind: StructureRecordKind, id: string) => void }) {
  const doc = () => props.doc;
  const component = () => doc().level === "component";
  const repositoryOptions = () => [{ value: "", label: "None" }, ...(props.edits.repositories ?? []).map((name) => ({ value: name, label: name }))];
  return <article class="pw-document__column pw-structure__document" aria-label={doc().title}>
    <div class="pw-structure__hero">
      <div class="pw-structure__hero-top">
        <IconTile size={36} tone="neutral" seed={`structure-${doc().id}`}><KindIcon kind={doc().level} size={18} /></IconTile>
        <Show when={props.actions.length}><EntityMenuButton label={`Actions for ${doc().title}`} actions={props.actions} /></Show>
      </div>
      <Show when={props.edits.title} fallback={<h1 class="pw-document__title">{doc().title}</h1>}>
        {(rename) => <InlineText label="Title" class="pw-document__title" required value={doc().title} placeholder="Untitled" onCommit={rename()} />}
      </Show>
      <Show when={props.edits.description} fallback={<Show when={doc().description} fallback={<p class="pw-structure__summary pw-structure__summary--empty">No description yet.</p>}>{(text) => <p class="pw-structure__summary">{text()}</p>}</Show>}>
        {(describe) => <InlineText label="Description" multiline class="pw-structure__summary" value={doc().description ?? ""} placeholder="Add a short summary…" onCommit={describe()} />}
      </Show>
    </div>
    <dl class="pw-structure__head">
      <HeadRow label="Properties">
        <HeadValue icon={<KindIcon kind={doc().level} size={14} />}>{kindLabel(doc().level)}</HeadValue>
        <Show when={component() && !props.edits.patch}>
          <Show when={doc().kind}><HeadValue icon={<Package size={14} />}>{componentKindLabel(doc().kind!)}</HeadValue></Show>
          <Show when={doc().tech}><HeadValue icon={<Cpu size={14} />}>{doc().tech}</HeadValue></Show>
        </Show>
        <Show when={component() && props.edits.patch}>
          <PickerValue label="Kind" icon={<Package size={14} />} value={doc().kind} placeholder="Kind" options={KIND_OPTIONS}
            onChange={(value) => props.edits.patch!({ kind: value === NO_KIND ? "" : value })} />
          <span class="pw-structure__pick-field">
            <span class="pw-structure__value-icon" aria-hidden><Cpu size={14} /></span>
            <InlineText label="Technology" value={doc().tech ?? ""} placeholder="Technology" onCommit={(tech) => props.edits.patch!({ tech })} />
          </span>
        </Show>
      </HeadRow>
      <Show when={props.edits.patch} fallback={<Show when={doc().repo || doc().folder || doc().path}>
        <HeadRow label="Checkout">
          <Show when={checkoutLabel(doc().repo, doc().folder)}>{(label) => <HeadValue icon={<Folder size={14} />} mono>{label()}</HeadValue>}</Show>
          <Show when={doc().path}><HeadValue icon={<Route size={14} />} mono>{doc().path}</HeadValue></Show>
        </HeadRow>
      </Show>}>
        <HeadRow label="Checkout">
          <PickerValue label="Repository" icon={<GitBranch size={14} />} value={doc().repo} placeholder="Repository" options={repositoryOptions()} mono
            onChange={(repo) => props.edits.patch!({ repo })} />
          <span class="pw-structure__pick-field">
            <span class="pw-structure__value-icon" aria-hidden><Folder size={14} /></span>
            <InlineText label="Folder" class="font-mono" value={doc().folder ?? ""} placeholder="Folder" onCommit={(folder) => props.edits.patch!({ folder })} />
          </span>
          <Show when={doc().path}><HeadValue icon={<Route size={14} />} mono>{doc().path}</HeadValue></Show>
        </HeadRow>
      </Show>
      <Show when={doc().uses.length || props.edits.uses}>
        <HeadRow label="Uses">
          <For each={doc().uses}>{(use) => <span class="pw-structure__chip">
            <HeadValue icon={<Link2 size={14} />}>{use.title}</HeadValue>
            <Show when={props.edits.uses}>
              <Button size="icon" variant="ghost" class="pw-structure__chip-remove" aria-label={`Remove ${use.title}`} onClick={() => props.edits.uses!(doc().uses.filter((item) => item.id !== use.id).map((item) => item.id))}><XIcon size={12} /></Button>
            </Show>
          </span>}</For>
          <Show when={props.edits.uses}>
            <LinkButton label="Add dependency" options={props.edits.usesOptions ?? []} onPick={(id) => props.edits.uses!([...doc().uses.map((item) => item.id), id])} />
          </Show>
        </HeadRow>
      </Show>
      <Show when={doc().deploys?.length || props.edits.editDeploys}>
        <HeadRow label="Deploys">
          <For each={doc().deploys ?? []}>{(deploy) => <HeadValue icon={<Cloud size={14} />}>
            {deploy.resource}<span class="pw-structure__value-muted">{deploy.provider} / {deploy.environment || deploy.environmentId}</span>
            <Show when={!props.isProviderConnected(deploy.provider)}><StatusChip tone="warn" label="CLI not connected" /></Show>
          </HeadValue>}</For>
          <Show when={props.edits.editDeploys}>
            <Button size="icon" variant="ghost" aria-label="Edit deploys" onClick={() => props.edits.editDeploys!()}><Pencil size={14} /></Button>
          </Show>
        </HeadRow>
      </Show>
    </dl>
    <For each={RECORD_SECTIONS}>{(section) => {
      const options = () => props.edits.linkOptions?.[section.kind];
      return <Show when={doc().records[section.key].length || options()}>
        <DocumentSection title={section.title} count={doc().records[section.key].length}
          actions={options() && props.edits.link ? <LinkButton label={`Link ${section.title.toLowerCase().replace(/s$/, "")}`} options={options()!} onPick={(id) => props.edits.link!(section.kind, id)} /> : undefined}>
          <Show when={doc().records[section.key].length} fallback={<p class="pw-structure__empty">Nothing linked yet.</p>}>
            <RecordTable label={section.title} rows={doc().records[section.key]} icon={<section.Icon size={14} />}
              onOpen={props.onOpenRecord ? (id) => props.onOpenRecord!(section.kind, id) : undefined}
              onUnlink={props.edits.unlink ? (id) => props.edits.unlink!(section.kind, id) : undefined} />
          </Show>
        </DocumentSection>
      </Show>;
    }}</For>
  </article>;
}

/** A tree row's line after its title: Add child alone; every other action is in the node's document. */
function NodeLine(props: { addLabel?: string; onAdd?: () => void }) {
  return <Show when={props.onAdd}>
    <span class="pw-structure-line" onKeyDown={(event) => event.stopPropagation()}>
      <span class="pw-structure-line__add">
        <Button size="icon" variant="ghost" aria-label={props.addLabel ?? "Add child"} onClick={(event) => { event.stopPropagation(); props.onAdd?.(); }}><Plus size={14} /></Button>
      </span>
    </span>
  </Show>;
}

const NO_KIND = "none";
const KIND_OPTIONS = [{ value: NO_KIND, label: "None" }, ...COMPONENTS.map((item) => ({ value: item.kind, label: item.label }))];

export function StructureView(props: {
  projectName: string;
  projectDescription?: string;
  projectRepository?: string;
  nodes: readonly StructureNode[];
  /** Full registry for parent and dependency choices under a collection scope filter. */
  registryNodes?: readonly StructureNode[];
  /** What cites each node, by node id. */
  records: Readonly<Record<string, StructureRecords>>;
  /** Everything in the project, for the project's own document. */
  projectRecords: StructureRecords;
  /** Opens a card (by slug), decision, fact, or doc listed in a node's document. */
  onOpenRecord?: (kind: StructureRecordKind, id: string) => void;
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
  /** Writes a node's title, description, checkout, kind, or technology from its document. */
  onEditNode?: (nodeId: string, patch: StructureNodePatch) => Promise<void>;
  /** Writes the project's name or description from its document. */
  onEditProject?: (patch: { name?: string; description?: string }) => Promise<void>;
  /** Links a card, decision, fact, or doc to a node, or unlinks it when `nodeId` is empty. */
  onLinkRecord?: (kind: StructureRecordKind, recordId: string, nodeId: string) => Promise<void>;
  /** Checkout names a node's repository can be set to. */
  repositories?: readonly string[];
}) {
  // Expanded tree rows are remembered, so returning to Structure keeps the same layout.
  const [expanded, setExpanded] = createSignal<string[]>(readRemembered("structure.expanded", [PROJECT_ID]));
  createEffect(() => writeRemembered("structure.expanded", expanded()));
  // The tree pane closes from the toolbar like a document's rail, and the choice is remembered.
  const [treeOpen, setTreeOpen] = createSignal(readRemembered("structure.tree", true));
  createEffect(() => writeRemembered("structure.tree", treeOpen()));
  const [treePane, setTreePane] = createSignal<HTMLElement>();
  createTreePane(treePane, treeOpen);
  const [busy, setBusy] = createSignal(false);
  const [title, setTitle] = createSignal("");
  const [kind, setKind] = createSignal<StructureKind>("system");
  const [parent, setParent] = createSignal("");
  const [moveOpen, setMoveOpen] = createSignal(false);
  const [formError, setFormError] = createSignal("");
  const [deploysOpen, setDeploysOpen] = createSignal(false);
  const [editingDeploys, setEditingDeploys] = createSignal<{ environmentId: string; provider: string; resource: string }[]>([]);
  const target = createDetailPanelSelector((state) => state.activeTarget);
  const tree = createMemo(() => buildStructureTree(props.nodes, ""));
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

  // Actions select their node first: the dialogs below act on the selection.
  const nodeActions = (node: StructureNode): EntityAction[] => [
    ...(node.level === "component" ? [] : [{ id: "add-child", label: node.level === "system" ? "Add domain" : "Add component", icon: Plus, onSelect: () => { open(node.id); props.onOpenCreate(); } }]),
    { id: "move", label: "Move", icon: Route, disabled: node.level === "system", onSelect: () => { open(node.id); setParent(node.parentId); setFormError(""); setMoveOpen(true); } },
  ];
  const projectActions = (): EntityAction[] => [{ id: "add-system", label: "Add system", icon: Plus, disabled: !!props.loading || !!props.error, onSelect: () => { open(PROJECT_ID); props.onOpenCreate(); } }];
  const addChild = (id: string) => { open(id); props.onOpenCreate(); };
  const toTreeNode = (item: StructureTreeItem): TreeViewNode => ({
    id: item.node.id, label: item.node.title,
    trailing: <NodeLine
      onAdd={item.node.level === "component" ? undefined : () => addChild(item.node.id)} addLabel={`Add child to ${item.node.title}`} />,
    children: item.children.map(toTreeNode),
  });
  const treeNodes = createMemo<TreeViewNode[]>(() => props.loading || props.error ? [] : [{
    id: PROJECT_ID, label: props.projectName,
    trailing: <NodeLine
      onAdd={props.loading || props.error ? undefined : () => addChild(PROJECT_ID)} addLabel="Add system" />,
    children: tree().map(toTreeNode),
  }]);

  // A click or the arrow keys select a node; its document shows beside the tree and the row stays selected.
  const treeSelection = createMemo(() => [selectedId() ?? PROJECT_ID]);
  // A write from the document; a refusal comes back as a toast and the field shows the stored value again.
  const write = (action: Promise<void> | undefined, failure: string) => {
    void action?.catch((error: unknown) => pushToast(error instanceof Error ? error.message : failure, "danger"));
  };
  const detail = createMemo<NodeDocumentModel | undefined>(() => {
    const id = selectedId() ?? PROJECT_ID;
    if (id === PROJECT_ID) return { id, project: true, title: props.projectName, level: "project", description: props.projectDescription, repo: props.projectRepository, uses: [], records: props.projectRecords };
    const node = selected();
    if (!node) return undefined;
    return { id: node.id, project: false, title: node.title, level: node.level, description: node.intent, kind: node.kind, tech: node.tech, repo: node.repo, folder: node.folder, path: node.path,
      uses: registry().filter((item) => node.uses?.includes(item.path)).map((item) => ({ id: item.id, title: item.title })),
      deploys: node.level === "component" ? node.deploys : undefined, records: props.records[node.id] ?? NO_RECORDS };
  });
  const edits = createMemo<NodeDocumentEdits>(() => {
    const doc = detail();
    if (!doc) return {};
    if (doc.project) return {
      title: props.onEditProject ? (name) => write(props.onEditProject!({ name }), "Could not rename the project.") : undefined,
      description: props.onEditProject ? (description) => write(props.onEditProject!({ description }), "Could not save the description.") : undefined,
    };
    const node = selected()!;
    const linked = (kind: keyof StructureRecords) => new Set(doc.records[kind].map((record) => record.id));
    const candidates = (kind: keyof StructureRecords) => props.projectRecords[kind].filter((record) => !linked(kind).has(record.id)).map((record) => ({ value: record.id, label: record.title }));
    return {
      title: props.onEditNode ? (title) => write(props.onEditNode!(node.id, { title }), "Could not rename the node.") : undefined,
      description: props.onEditNode ? (intent) => write(props.onEditNode!(node.id, { intent }), "Could not save the description.") : undefined,
      patch: props.onEditNode ? (patch) => write(props.onEditNode!(node.id, patch), "Could not save the node.") : undefined,
      repositories: props.repositories,
      uses: (ids) => write(props.onUses(node.id, ids), "Could not save dependencies."),
      usesOptions: registry().filter((item) => item.id !== node.id && !node.uses?.includes(item.path)).map((item) => ({ value: item.id, label: `${item.title} (${kindLabel(item.level)})` })),
      editDeploys: node.level === "component" && props.onDeploysChange ? () => openDeploysDialog(node) : undefined,
      linkOptions: props.onLinkRecord ? {
        ...(node.level === "component" ? { card: candidates("cards") } : {}),
        decision: candidates("decisions"), fact: candidates("facts"), doc: candidates("docs"),
      } : undefined,
      link: props.onLinkRecord ? (kind, id) => write(props.onLinkRecord!(kind, id, node.id), "Could not link it.") : undefined,
      unlink: props.onLinkRecord ? (kind, id) => write(props.onLinkRecord!(kind, id, ""), "Could not unlink it.") : undefined,
    };
  });

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


  return <div class="flex min-h-0 flex-1 flex-col">
    <PageToolbar.Root>
      <PageToolbar.Leading>
        <Button size="icon" variant="texture" aria-label={treeOpen() ? "Hide structure tree" : "Show structure tree"} aria-expanded={treeOpen()} selected={treeOpen()}
          onClick={() => setTreeOpen((value) => !value)}><SidebarLeftIcon size={14} /></Button>
      </PageToolbar.Leading>
      <PageToolbar.Actions>{null}</PageToolbar.Actions>
    </PageToolbar.Root>
    <Show when={props.loading} fallback={<Show when={props.error} fallback={
      <PageContent class="flex flex-col overflow-hidden">
          <div class="pw-structure">
          <nav ref={setTreePane} class="pw-structure__tree" aria-label="Structure tree">
            <Card class="pw-structure__tree-card pw-scroll-fade">
            <TreeView label="Project structure" branches compact expandOnClick={false} class="[&>h3]:sr-only" nodes={treeNodes()} expandedValue={expanded()} onExpandedChange={(event) => setExpanded((current) => sameIds(current, event.expandedValue) ? current : event.expandedValue)}
              selectedValue={treeSelection()} onSelectionChange={(event) => { const id = event.selectedValue[0]; if (id) open(id); }} onFocusChange={(event) => { if (event.focusedValue && event.focusedValue !== selectedId()) open(event.focusedValue); }} />
            </Card>
          </nav>
          <div class="pw-structure__pane pw-scroll-fade">
            <Show when={detail()}>{(item) => <NodeDocument doc={item()} actions={item().project ? projectActions() : nodeActions(selected()!)} edits={edits()} isProviderConnected={isProviderConnected} onOpenRecord={props.onOpenRecord} />}</Show>
            <Show when={!props.nodes.length}>
              <div class="pw-document__column pw-structure__start">
                <PageEmpty title="No structure yet" mood="sleeping"><PromptCardGrid items={STRUCTURE_AGENT_PROMPTS.map((item) => ({ id: item.id, title: item.title, description: item.description, tone: item.tone, icon: <KindIcon kind={item.level} size={16} />, prompt: item.prompt }))} /></PageEmpty>
              </div>
            </Show>
          </div>
          </div>
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
