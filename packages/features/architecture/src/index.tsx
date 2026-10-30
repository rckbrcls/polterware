import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, untrack, type JSX } from "solid-js";
import {
  A11yDialog, Boxes, Button, Card, Composer, Cpu, EntityMenuButton, PromptCardGrid, Field, Folder, FormStack, Input,
  CollapsibleSection, DataTable, IconTile, Layers, PageContent, PageEmpty, PageError, PageLoading, PageToolbar, Plus,
  Cloud, Delete, DetailPanel, Link2, Package, PropertyPicker, Route, Textarea, XIcon,
  House, Scale, SchemeIcon, ShieldCheck, FileText, GitBranch, Github, Select, SidebarLeftIcon, FolderKanban, StatusChip, TreeView, pushToast,
  ActiveFilterBar, FilterPopover, SearchBar, matchClauses,
  type EntityAction, type FilterClause, type FilterField, type TreeViewNode,
} from "@polterware/frontend-design-system";
import { createDetailPanelSelector, detailPanelStore, readRemembered, writeRemembered } from "@polterware/frontend-state";
import { COMPONENTS, component } from "@polterware/feature-canvas/components";
import { componentIcons } from "@polterware/feature-canvas/component-icons";
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
/** One thing that cites a node: a card (by slug), decision, Rule, or doc, with a muted caption such as its stage. */
/** `direct` marks a link the node owns (a card under it, a record scoped to it), which its document can remove. */
export type StructureRecord = { id: string; title: string; caption?: string; direct?: boolean };
/** The fields of a node its document edits in place; a field left out is unchanged, and an empty value clears it. */
/** `dir` links the local clone at that folder: the core creates or reuses its repository. */
export type StructureNodePatch = { title?: string; intent?: string; level?: StructureKind; repo?: string; dir?: string; folder?: string; kind?: string; tech?: string };
/** A repository a component can link: its GitHub identity (github.com/owner/repo) and this machine's clone. */
export type StructureRepository = { name: string; remote: string; localPath: string };
/** The repository's label: owner/repo for a GitHub remote, else its name. */
export function repositoryLabel(repo: StructureRepository): string {
  return repo.remote.startsWith("github.com/") ? repo.remote.slice("github.com/".length) : repo.name;
}
const CHOOSE_FOLDER = "\u0000choose-folder";
export type StructureRecordKind = "card" | "decision" | "rule" | "doc";
/** `rules` holds every Rule that holds for the node: its own (direct) and those of its ancestors and the whole project. */
export type StructureRecords = { cards: readonly StructureRecord[]; decisions: readonly StructureRecord[]; rules: readonly StructureRecord[]; docs: readonly StructureRecord[] };
const NO_RECORDS: StructureRecords = { cards: [], decisions: [], rules: [], docs: [] };
/** A new node: a domain under the project, or a component under a domain; `why` is the optional reason. */
export type StructureDraft = { title: string; intent: string; why: string; level: StructureKind; parentId: string };

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
  return <Show when={props.kind !== "project"} fallback={<House size={size()} aria-hidden />}>
    <Show when={props.kind === "component"} fallback={<Folder size={size()} aria-hidden />}><Boxes size={size()} aria-hidden /></Show>
  </Show>;
}
const kindLabel = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1);
/** A tree row's 20px tile: the level's glyph, so a row reads as the project, a domain, or a component at a glance. */
function LevelTile(props: { level: StructureKind | "project"; seed: string }) {
  return <IconTile size={20} tone="neutral" class="pw-structure__level" seed={`structure-level-${props.seed}`}><KindIcon kind={props.level} size={12} /></IconTile>;
}

type PickOption = { value: string; label: string; icon?: JSX.Element };
/** The canvas kind's icon, or the component glyph for an unknown kind. */
function ComponentKindIcon(props: { kind: string; size?: number }) {
  const Icon = () => componentIcons[props.kind];
  return <Show when={Icon()} fallback={<Boxes size={props.size ?? 14} aria-hidden />}>{(icon) => { const KindGlyph = icon(); return <KindGlyph size={props.size ?? 14} aria-hidden />; }}</Show>;
}

/** The component kind's palette label (`database` reads Database); unknown kinds read as written. */
export function componentKindLabel(kind: string): string {
  return component(kind)?.label ?? kind;
}

/** `repo/folder`, the repo, or the folder alone; empty at the project checkout root. */
export function checkoutLabel(repo = "", folder = ""): string {
  return repo && folder ? `${repo}/${folder}` : repo || folder;
}

/** A titled block of the document, flat on the page: its heading (a larger title with no icon, a count, a fold chevron, and its actions), then its rows. */
function DocumentSection(props: { title: string; count?: number; actions?: JSX.Element; children: JSX.Element }) {
  return <div class="pw-structure__section">
    <CollapsibleSection title={props.title} aside={props.count === undefined ? undefined : String(props.count)} actions={props.actions}>{props.children}</CollapsibleSection>
  </div>;
}


/** The cards, Rules, decisions, or docs that cite a node, one row each with its status on the right; a row opens its page, and a direct link can be removed. */
function RecordTable(props: { label: string; rows: readonly StructureRecord[]; icon: JSX.Element; unlinkLabel?: string; onOpen?: (id: string) => void; onUnlink?: (id: string) => void }) {
  return <DataTable.Root rows={props.rows} getRowId={(row) => row.id} density="list">
    <DataTable.Table aria-label={props.label}>
      <DataTable.Body<StructureRecord>>
        {(row) => <DataTable.Row row={row} rowId={row.id} aria-label={row.title} onActivate={props.onOpen ? () => props.onOpen!(row.id) : undefined}>
          <DataTable.PrimaryCell icon={props.icon} iconTone="neutral" iconSeed={row.id} title={row.title} />
          <DataTable.Cell align="right">
            <span class="pw-structure__row-end">
              <span class="text-[var(--color-text-muted)]">{row.caption}</span>
              <Show when={props.onUnlink && row.direct}>
                <span class="pw-structure__row-unlink">
                  <Button size="icon" variant="ghost" aria-label={`${props.unlinkLabel ?? "Unlink"} ${row.title}`} onClick={(event) => { event.stopPropagation(); props.onUnlink!(row.id); }}><XIcon size={14} /></Button>
                </span>
              </Show>
            </span>
          </DataTable.Cell>
        </DataTable.Row>}
      </DataTable.Body>
    </DataTable.Table>
  </DataTable.Root>;
}

const RECORD_SECTIONS = [
  { key: "rules", kind: "rule", title: "Rules", Icon: ShieldCheck },
  { key: "cards", kind: "card", title: "Cards", Icon: FolderKanban },
  { key: "decisions", kind: "decision", title: "Decisions", Icon: Scale },
  { key: "docs", kind: "doc", title: "Docs", Icon: FileText },
] as const;

const providerName = (id: string) => CATALOG_PROVIDERS.find((provider) => provider.id === id)?.name ?? id;
/** A deploy as the head shows it: the platform, then the environment. */
const deployLabel = (deploy: { provider: string; environment?: string; environmentId: string }) =>
  `${providerName(deploy.provider)} · ${deploy.environment || deploy.environmentId}`;

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
function openExternal(url: string) {
  void (globalThis as { polterware?: { app?: { openExternal?: (target: string) => Promise<unknown> } } }).polterware?.app?.openExternal?.(url);
}

function PickerValue(props: { label: string; icon: JSX.Element; value?: string; placeholder: string; options: readonly PickOption[]; mono?: boolean; onChange: (value: string) => void }) {
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
function LinkButton(props: { label: string; options: readonly PickOption[]; onPick: (value: string) => void }) {
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
  kind?: string; tech?: string; repo?: string; folder?: string; path?: string; parentId?: string;
  deploys?: StructureNode["deploys"]; records: StructureRecords;
};

/** The writes a document makes; each is left out where it cannot apply. */
type NodeDocumentEdits = {
  title?: (value: string) => void;
  description?: (value: string) => void;
  patch?: (patch: StructureNodePatch) => void;
  /** The levels the node may take where it sits; one option or none keeps the level read-only. */
  levelOptions?: readonly PickOption[];
  /** The nodes it may move under; picking one moves it. */
  parentOptions?: readonly PickOption[];
  move?: (parentId: string) => void;
  repositories?: readonly StructureRepository[];
  /** Picks a local clone to link; resolves with its folder, or nothing when cancelled. */
  pickFolder?: () => Promise<string | null | undefined>;
  editDeploys?: () => void;
  /** What each record section can still link, by kind; a kind left out has no add button. */
  linkOptions?: Partial<Record<StructureRecordKind, readonly PickOption[]>>;
  link?: (kind: StructureRecordKind, id: string) => void;
  unlink?: (kind: StructureRecordKind, id: string) => void;
};

/**
 * The selected node as a document beside the tree, laid out like a Linear project overview
 * and edited in place: a 36px kind tile, the title, and the description as its summary; then
 * the node's actions in the header's top right; labeled lines (Properties with the level, kind, and technology;
 * Checkout with the repository and folder; Deploys with the platform it runs on per environment);
 * then, set well apart, one collapsible table section per kind of record that cites the node, where a + links one more and a row's × unlinks
 * a direct link. Read-only values and empty sections that cannot be linked are left out.
 */
function NodeDocument(props: { doc: NodeDocumentModel; actions: readonly EntityAction[]; edits: NodeDocumentEdits; isProviderConnected: (provider: string) => boolean; onOpenRecord?: (kind: StructureRecordKind, id: string) => void; onOpenNode?: (id: string) => void; activity?: JSX.Element }) {
  const doc = () => props.doc;
  const component = () => doc().level === "component";
  // Where the component runs, one platform per environment; editing them opens the deploys editor.
  const deploysLabel = () => (doc().deploys ?? []).map(deployLabel).join(", ");
  const unconnectedProviders = () => [...new Set((doc().deploys ?? []).map((deploy) => deploy.provider))].filter((provider) => !props.isProviderConnected(provider));
  // The node's repositories: None, each one (owner/repo when it has a GitHub remote), and a local clone to link.
  const repositoryOptions = () => [
    { value: "", label: "None", icon: <XIcon size={12} /> },
    ...(props.edits.repositories ?? []).map((repo) => ({ value: repo.name, label: repositoryLabel(repo), icon: repo.remote ? <Github size={12} /> : <GitBranch size={12} /> })),
    ...(props.edits.pickFolder ? [{ value: CHOOSE_FOLDER, label: "Choose folder…", icon: <Folder size={12} /> }] : []),
  ];
  const repository = () => (props.edits.repositories ?? []).find((repo) => repo.name === doc().repo);
  const githubLink = () => {
    const remote = repository()?.remote ?? "";
    return remote.startsWith("github.com/") ? `https://${remote}` : "";
  };
  async function pickRepository(value: string) {
    if (value !== CHOOSE_FOLDER) return props.edits.patch!({ repo: value });
    const dir = await props.edits.pickFolder?.();
    if (dir) props.edits.patch!({ dir });
  }
  const GithubLink = () => <Show when={githubLink()}>{(href) =>
    <Button size="icon" variant="ghost" aria-label={`Open ${repositoryLabel(repository()!)} on GitHub`} onClick={() => openExternal(href())}><Github size={14} /></Button>}</Show>;
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
        <Show when={(props.edits.levelOptions?.length ?? 0) > 1 && props.edits.patch} fallback={<HeadValue icon={<KindIcon kind={doc().level} size={14} />}>{kindLabel(doc().level)}</HeadValue>}>
          <PickerValue label="Level" icon={<KindIcon kind={doc().level} size={14} />} value={doc().level} placeholder="Level" options={props.edits.levelOptions!}
            onChange={(value) => { if (value !== doc().level) props.edits.patch!(value === "component" ? { level: value } : { level: value as StructureKind, kind: "" }); }} />
        </Show>
        <Show when={props.edits.move && props.edits.parentOptions?.length}>
          <PickerValue label="Parent" icon={<Route size={14} />} value={doc().parentId} placeholder="Parent" options={props.edits.parentOptions!}
            onChange={(value) => { if (value !== doc().parentId) props.edits.move!(value); }} />
        </Show>
        <Show when={component() && !props.edits.patch}>
          <Show when={doc().kind}><HeadValue icon={<Package size={14} />}>{componentKindLabel(doc().kind!)}</HeadValue></Show>
          <Show when={doc().tech}><HeadValue icon={<Cpu size={14} />}>{doc().tech}</HeadValue></Show>
        </Show>
        <Show when={component() && props.edits.patch}>
          <PickerValue label="Kind" icon={doc().kind ? <ComponentKindIcon kind={doc().kind!} /> : <Package size={14} />} value={doc().kind} placeholder="Kind" options={kindOptions()}
            onChange={(value) => props.edits.patch!({ kind: value === NO_KIND ? "" : value })} />
          <span class="pw-structure__pick-field">
            <span class="pw-structure__value-icon" aria-hidden><Cpu size={14} /></span>
            <InlineText label="Technology" value={doc().tech ?? ""} placeholder="Technology" onCommit={(tech) => props.edits.patch!({ tech })} />
          </span>
        </Show>
      </HeadRow>
      <Show when={props.edits.patch} fallback={<Show when={doc().repo || doc().folder || doc().path}>
        <HeadRow label="Checkout">
          <Show when={checkoutLabel(repository() ? repositoryLabel(repository()!) : doc().repo, doc().folder)}>{(label) => <HeadValue icon={<Folder size={14} />} mono>{label()}</HeadValue>}</Show>
          <GithubLink />
          <Show when={doc().path}><HeadValue icon={<Route size={14} />} mono>{doc().path}</HeadValue></Show>
        </HeadRow>
      </Show>}>
        <HeadRow label="Checkout">
          <PickerValue label="Repository" icon={repository()?.remote ? <Github size={14} /> : <GitBranch size={14} />} value={doc().repo} placeholder="Repository" options={repositoryOptions()} mono
            onChange={(value) => void pickRepository(value)} />
          <GithubLink />
          <span class="pw-structure__pick-field">
            <span class="pw-structure__value-icon" aria-hidden><Folder size={14} /></span>
            <InlineText label="Folder" class="font-mono" value={doc().folder ?? ""} placeholder="Folder" onCommit={(folder) => props.edits.patch!({ folder })} />
          </span>
          <Show when={doc().path}><HeadValue icon={<Route size={14} />} mono>{doc().path}</HeadValue></Show>
        </HeadRow>
      </Show>
      <Show when={component() && (doc().deploys?.length || props.edits.editDeploys)}>
        <HeadRow label="Deploys">
          <Show when={props.edits.editDeploys} fallback={<For each={doc().deploys}>{(deploy) => <HeadValue icon={<Cloud size={14} />}>{deployLabel(deploy)}</HeadValue>}</For>}>
            <Button variant="ghost" size="sm" class="pw-structure__pick" aria-label={`Deploys: ${deploysLabel() || "none"}`} onClick={() => props.edits.editDeploys!()}>
              <span class="pw-structure__value-icon" aria-hidden><Cloud size={14} /></span>
              <span classList={{ "pw-structure__value-muted": !deploysLabel() }}>{deploysLabel() || "Where it runs"}</span>
            </Button>
          </Show>
          <For each={unconnectedProviders()}>{(provider) => <StatusChip tone="warn" label={`${providerName(provider)} CLI not connected`} />}</For>
        </HeadRow>
      </Show>
    </dl>
    <For each={RECORD_SECTIONS}>{(section) => {
      const options = () => props.edits.linkOptions?.[section.kind];
      return <Show when={doc().records[section.key].length || options()}>
        <DocumentSection title={section.title} count={doc().records[section.key].length}
          actions={options() && props.edits.link ? <LinkButton label={`Link ${section.title.toLowerCase().replace(/s$/, "")}`} options={options()!} onPick={(id) => props.edits.link!(section.kind, id)} /> : undefined}>
          <Show when={doc().records[section.key].length} fallback={<PageEmpty title={`No ${section.title.toLowerCase()} yet`} mood="sleeping">
            <p class="pw-structure__empty">Link one with + to show it here.</p>
          </PageEmpty>}>
            <RecordTable label={section.title} rows={doc().records[section.key]} icon={<section.Icon size={14} />}
              onOpen={props.onOpenRecord ? (id) => props.onOpenRecord!(section.kind, id) : undefined}
              onUnlink={props.edits.unlink ? (id) => props.edits.unlink!(section.kind, id) : undefined} />
          </Show>
        </DocumentSection>
      </Show>;
    }}</For>
    {props.activity}
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
/** Built per use: an option icon is a DOM node, so each picker gets its own. */
const kindOptions = (): PickOption[] => [{ value: NO_KIND, label: "None", icon: <XIcon size={12} /> }, ...COMPONENTS.map((item) => ({ value: item.kind, label: item.label, icon: <ComponentKindIcon kind={item.kind} size={12} /> }))];

export function StructureView(props: {
  projectName: string;
  projectDescription?: string;
  nodes: readonly StructureNode[];
  /** Full registry for parent and dependency choices under a collection scope filter. */
  registryNodes?: readonly StructureNode[];
  /** What cites each node, by node id. */
  records: Readonly<Record<string, StructureRecords>>;
  /** Everything in the project, for the project's own document. */
  projectRecords: StructureRecords;
  /** Opens a card (by slug), decision, Rule, or doc listed in a node's document. */
  onOpenRecord?: (kind: StructureRecordKind, id: string) => void;
  loading?: boolean;
  error?: string;
  createDialogOpen?: boolean;
  onCloseCreate: () => void;
  onOpenCreate: () => void;
  onCreate: (draft: StructureDraft) => Promise<void>;
  onMove: (nodeId: string, parentId: string) => Promise<void>;
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
  /**
   * Links a card, decision, Rule, or doc to a node (`linked`), or unlinks it. A decision, Rule, or doc
   * gains or loses only this node among its contexts; a card moves under it or out of any component.
   */
  onLinkRecord?: (kind: StructureRecordKind, recordId: string, nodeId: string, linked: boolean) => Promise<void>;
  /** The repositories a node can link. */
  repositories?: readonly StructureRepository[];
  /** Picks a local clone folder for a node's repository (`dir:`), from the Desktop's folder dialog. */
  onPickFolder?: () => Promise<string | null | undefined>;
  /** A node's Activity at the end of its document: its edits and the relations drawn to it. */
  renderActivity?: (nodeId: string) => JSX.Element;
  /** Draws the tree on the Structure canvas, the same way every time, and offers to open it. */
  onDrawCanvas?: () => Promise<void>;
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
  // The node a new one goes under: the project takes a domain, a domain takes a component.
  const [createUnder, setCreateUnder] = createSignal(PROJECT_ID);
  const createLevel = (): StructureKind => (createUnder() === PROJECT_ID ? "domain" : "component");
  const [parent, setParent] = createSignal("");
  const [moveOpen, setMoveOpen] = createSignal(false);
  const [formError, setFormError] = createSignal("");
  const [deploysOpen, setDeploysOpen] = createSignal(false);
  const [editingDeploys, setEditingDeploys] = createSignal<{ environmentId: string; provider: string; resource: string }[]>([]);
  const target = createDetailPanelSelector((state) => state.activeTarget);
  const tree = createMemo(() => buildStructureTree(props.nodes, ""));
  const visible = createMemo(() => flattenStructureTree(tree()));
  // The tree's own search and filter (level, component kind): matches keep the ancestors that lead to them.
  const [treeQuery, setTreeQuery] = createSignal("");
  const [treeClauses, setTreeClauses] = createSignal<FilterClause[]>([]);
  const treeFields = createMemo<FilterField[]>(() => {
    const kinds = [...new Set(props.nodes.flatMap((node) => node.kind ? [node.kind] : []))].sort();
    return [
      { id: "level", label: "Level", icon: () => <Layers size={14} />, kind: "multi",
        options: (["domain", "component"] as const).map((level) => ({ id: level, label: kindLabel(level), icon: () => <KindIcon kind={level} size={14} /> })) },
      ...(kinds.length ? [{ id: "kind", label: "Kind", icon: () => <Boxes size={14} />, kind: "multi" as const,
        options: kinds.map((value) => ({ id: value, label: componentKindLabel(value), icon: () => <ComponentKindIcon kind={value} size={14} /> })) }] : []),
    ];
  });
  const filtering = () => treeQuery().trim() !== "" || treeClauses().length > 0;
  const shownTree = createMemo(() => !filtering() ? tree() : buildStructureTree(props.nodes, treeQuery(), treeClauses().length
    ? (node) => matchClauses(node, treeClauses(), { level: (item) => item.level, kind: (item) => item.kind ?? "" })
    : undefined));
  // While filtering, every branch that leads to a match stays open.
  const treeExpanded = createMemo(() => filtering() ? [PROJECT_ID, ...flattenStructureTree(shownTree()).map((node) => node.id)] : expanded());
  const selectedId = () => target()?.scopeId === STRUCTURE_SCOPE ? target()?.entityId : undefined;
  const selected = createMemo(() => props.nodes.find((node) => node.id === selectedId()));
  const registry = () => props.registryNodes ?? props.nodes;
  const parents = () => structureParents(registry(), selected()?.level ?? "component", selected()?.id);
  // A component may sit loose under the project (PROJECT_ID) or under a domain.
  const parentOptions = () => [
    { value: PROJECT_ID, label: `${props.projectName} (Project)`, icon: <KindIcon kind="project" size={12} /> },
    ...parents().map((node) => ({ value: node.id, label: `${node.title} (${kindLabel(node.level)})`, icon: <KindIcon kind={node.level} size={12} /> })),
  ];
  const parentId = (value: string) => (value === PROJECT_ID ? "" : value);
  const open = (id: string) => props.onOpenNode(id);

  // Environment options for the deploys dialog
  const environmentOptions = () => (props.environments ?? []).map((env) => ({ value: env.id, label: env.label, icon: <Layers size={12} /> }));
  // Provider options from the catalog
  const providerOptions = () => CATALOG_PROVIDERS.map((p) => ({ value: p.id, label: p.name, icon: <Cloud size={12} /> }));
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
    ...(node.level === "component" ? [] : [{ id: "add-child", label: "Add component", icon: Plus, onSelect: () => { open(node.id); props.onOpenCreate(); } }]),
    { id: "move", label: "Move", icon: Route, disabled: node.level === "domain", onSelect: () => { open(node.id); setParent(node.parentId || PROJECT_ID); setFormError(""); setMoveOpen(true); } },
  ];
  const projectActions = (): EntityAction[] => [{ id: "add-domain", label: "Add domain", icon: Plus, disabled: !!props.loading || !!props.error, onSelect: () => { open(PROJECT_ID); props.onOpenCreate(); } }];
  const addChild = (id: string) => { open(id); props.onOpenCreate(); };
  const toTreeNode = (item: StructureTreeItem): TreeViewNode => ({
    id: item.node.id, label: item.node.title, icon: <LevelTile level={item.node.level} seed={item.node.id} />,
    trailing: <NodeLine
      onAdd={item.node.level === "component" ? undefined : () => addChild(item.node.id)} addLabel={`Add component to ${item.node.title}`} />,
    children: item.children.map(toTreeNode),
  });
  const treeNodes = createMemo<TreeViewNode[]>(() => props.loading || props.error ? [] : [{
    id: PROJECT_ID, label: props.projectName, icon: <LevelTile level="project" seed={PROJECT_ID} />,
    trailing: <NodeLine
      onAdd={props.loading || props.error ? undefined : () => addChild(PROJECT_ID)} addLabel="Add domain" />,
    children: shownTree().map(toTreeNode),
  }]);

  // A click or the arrow keys select a node; its document shows beside the tree and the row stays selected.
  const treeSelection = createMemo(() => [selectedId() ?? PROJECT_ID]);
  // A write from the document; a refusal comes back as a toast and the field shows the stored value again.
  const write = (action: Promise<void> | undefined, failure: string) => {
    void action?.catch((error: unknown) => pushToast(error instanceof Error ? error.message : failure, "danger"));
  };
  // A domain sits under the project; a component under a domain or loose under the project. A node
  // right under the project can switch between the two, but only one with no children becomes a component.
  const levelOptions = (node: StructureNode): PickOption[] => {
    if (node.parentId || registry().some((item) => item.parentId === node.id)) return [];
    return (["domain", "component"] as StructureKind[])
      .map((level) => ({ value: level, label: kindLabel(level), icon: <KindIcon kind={level} size={12} /> }));
  };
  const detail = createMemo<NodeDocumentModel | undefined>(() => {
    const id = selectedId() ?? PROJECT_ID;
    if (id === PROJECT_ID) return { id, project: true, title: props.projectName, level: "project", description: props.projectDescription, records: props.projectRecords };
    const node = selected();
    if (!node) return undefined;
    return { id: node.id, project: false, title: node.title, level: node.level, parentId: node.parentId || PROJECT_ID, description: node.intent, kind: node.kind, tech: node.tech, repo: node.repo, folder: node.folder, path: node.path,
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
    const candidates = (kind: keyof StructureRecords) => {
      const section = RECORD_SECTIONS.find((item) => item.key === kind)!;
      return props.projectRecords[kind].filter((record) => !linked(kind).has(record.id))
        .map((record) => ({ value: record.id, label: record.title, icon: <section.Icon size={12} /> }));
    };
    return {
      title: props.onEditNode ? (title) => write(props.onEditNode!(node.id, { title }), "Could not rename the node.") : undefined,
      description: props.onEditNode ? (intent) => write(props.onEditNode!(node.id, { intent }), "Could not save the description.") : undefined,
      patch: props.onEditNode ? (patch) => write(props.onEditNode!(node.id, patch), "Could not save the node.") : undefined,
      repositories: props.repositories,
      pickFolder: props.onPickFolder,
      levelOptions: levelOptions(node),
      parentOptions: node.level === "domain" ? undefined : [
        { value: PROJECT_ID, label: props.projectName, icon: <KindIcon kind="project" size={12} /> },
        ...structureParents(registry(), node.level, node.id).map((item) => ({ value: item.id, label: item.title, icon: <KindIcon kind={item.level} size={12} /> })),
      ],
      move: node.level === "domain" ? undefined : (target) => write(props.onMove(node.id, parentId(target)), "Could not move the node."),
      editDeploys: node.level === "component" && props.onDeploysChange ? () => openDeploysDialog(node) : undefined,
      linkOptions: props.onLinkRecord ? {
        ...(node.level === "component" ? { card: candidates("cards") } : {}),
        rule: candidates("rules"), decision: candidates("decisions"), doc: candidates("docs"),
      } : undefined,
      link: props.onLinkRecord ? (kind, id) => write(props.onLinkRecord!(kind, id, node.id, true), "Could not link it.") : undefined,
      unlink: props.onLinkRecord ? (kind, id) => write(props.onLinkRecord!(kind, id, node.id, false), "Could not unlink it.") : undefined,
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
    // From a component, the next one goes beside it, under its domain.
    const node = untrack(selected);
    const domain = node?.level === "domain" ? node : registry().find((item) => item.id === node?.parentId && item.level === "domain");
    setCreateUnder(domain?.id ?? PROJECT_ID);
  });
  const [drawing, setDrawing] = createSignal(false);
  async function drawCanvas() {
    setDrawing(true);
    try { await props.onDrawCanvas?.(); }
    catch (error) { pushToast(error instanceof Error ? error.message : "Could not draw the canvas.", "danger"); }
    finally { setDrawing(false); }
  }

  /** Runs a Composer write; a refusal is a toast, and resolving false keeps the draft. */
  async function compose(action: () => Promise<void>): Promise<boolean> {
    try { await action(); return true; }
    catch (error) { pushToast(error instanceof Error ? error.message : "Could not save structure.", "danger"); return false; }
  }
  const domainOptions = () => registry().filter((node) => node.level === "domain")
    .map((node) => ({ value: node.id, label: node.title, get icon() { return <KindIcon kind="domain" size={12} />; } }));


  return <div class="flex min-h-0 flex-1 flex-col">
    <PageToolbar.Root>
      <PageToolbar.Leading>
        <Button size="icon" variant="texture" aria-label={treeOpen() ? "Hide structure tree" : "Show structure tree"} aria-expanded={treeOpen()} selected={treeOpen()}
          onClick={() => setTreeOpen((value) => !value)}><SidebarLeftIcon size={14} /></Button>
      </PageToolbar.Leading>
      <PageToolbar.Actions>
        <Show when={props.onDrawCanvas}>
          <Button size="icon" variant="texture" aria-label="Draw as canvas" disabled={drawing()}
            onClick={() => void drawCanvas()}><SchemeIcon size={14} /></Button>
        </Show>
      </PageToolbar.Actions>
    </PageToolbar.Root>
    {/* The tree's filters show under the toolbar, across the page, like every other list's. */}
    <Show when={treeClauses().length > 0}>
      <ActiveFilterBar fields={treeFields()} clauses={treeClauses()} onClausesChange={setTreeClauses} />
    </Show>
    <Show when={props.loading} fallback={<Show when={props.error} fallback={
      <PageContent class="flex flex-col overflow-hidden">
          <div class="pw-structure">
          <nav ref={setTreePane} class="pw-structure__tree" aria-label="Structure tree">
            <Card class="pw-structure__tree-card pw-scroll-fade">
            <div class="pw-structure__tree-tools">
              <SearchBar class="pw-structure__tree-search" placeholder="Search structure" value={treeQuery()} onInput={setTreeQuery} />
              <FilterPopover fields={treeFields()} clauses={treeClauses()} onClausesChange={setTreeClauses} ariaLabel="Filter structure" shortcut />
            </div>
            <Show when={!filtering() || shownTree().length > 0} fallback={<p class="pw-structure__tree-empty">No matching nodes</p>}>
              <TreeView label="Project structure" branches compact expandOnClick={false} class="[&>h3]:sr-only" nodes={treeNodes()} expandedValue={treeExpanded()} onExpandedChange={(event) => { if (!filtering()) setExpanded((current) => sameIds(current, event.expandedValue) ? current : event.expandedValue); }}
                selectedValue={treeSelection()} onSelectionChange={(event) => { const id = event.selectedValue[0]; if (id) open(id); }} onFocusChange={(event) => { if (event.focusedValue && event.focusedValue !== selectedId()) open(event.focusedValue); }} />
            </Show>
            </Card>
          </nav>
          <div class="pw-structure__pane">
            <Show when={detail()}>{(item) => <NodeDocument doc={item()} actions={item().project ? projectActions() : nodeActions(selected()!)} edits={edits()} isProviderConnected={isProviderConnected} onOpenRecord={props.onOpenRecord} onOpenNode={open}
              activity={item().project ? undefined : props.renderActivity?.(item().id)} />}</Show>
            <Show when={!props.nodes.length}>
              <div class="pw-document__column pw-structure__start">
                <PageEmpty title="No structure yet" mood="sleeping"><PromptCardGrid items={STRUCTURE_AGENT_PROMPTS.map((item) => ({ id: item.id, title: item.title, description: item.description, tone: item.tone, icon: <KindIcon kind={item.level} size={16} />, prompt: item.prompt }))} /></PageEmpty>
              </div>
            </Show>
          </div>
          </div>
      </PageContent>
    }><PageError message={props.error!} /></Show>}><PageLoading label="Loading structure…" /></Show>
    <Composer
      open={!!props.createDialogOpen}
      crumbs={[props.projectName, ...(createLevel() === "component" ? [registry().find((node) => node.id === createUnder())?.title ?? ""] : []), createLevel() === "domain" ? "New domain" : "New component"]}
      titlePlaceholder={createLevel() === "domain" ? "Domain name" : "Component name"}
      descriptionPlaceholder="What it owns…"
      properties={createLevel() === "component" ? [{ id: "domain", label: "Domain", get icon() { return <KindIcon kind="domain" size={14} />; }, options: domainOptions(), value: createUnder(), onChange: setCreateUnder }] : undefined}
      whyPlaceholder="Optional. Recorded in Activity"
      submitLabel={createLevel() === "domain" ? "Create domain" : "Create component"}
      onClose={props.onCloseCreate}
      onSubmit={(draft) => compose(() => props.onCreate({ title: draft.title.trim(), intent: draft.description.trim(), why: draft.why, level: createLevel(), parentId: parentId(createUnder()) }))}
    />
    <Composer
      open={moveOpen()}
      crumbs={[props.projectName, selected()?.title ?? "", "Move"]}
      titlePlaceholder="Name"
      properties={[{ id: "parent", label: "Under", get icon() { return <Route size={14} />; }, options: parentOptions(), value: parent(), onChange: setParent }]}
      initial={{ title: selected()?.title ?? "" }}
      createMore={false}
      submitLabel="Save"
      onClose={() => setMoveOpen(false)}
      onSubmit={(draft) => compose(async () => {
        const node = selected();
        if (!node) return;
        const title = draft.title.trim();
        if (title && title !== node.title) await props.onEditNode?.(node.id, { title });
        if (parentId(parent()) !== node.parentId) await props.onMove(node.id, parentId(parent()));
      })}
    />
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
