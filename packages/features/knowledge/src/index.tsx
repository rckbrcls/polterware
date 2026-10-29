import { Show, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js";
import {
  ActiveFilterBar,
  Archive,
  ArchivedList,
  Button,
  ChevronLeft,
  FileText,
  FilterPopover,
  LibraryBig,
  Link,
  ListChecks,
  PageContent,
  PageLoading,
  PageToolbar,
  Plus,
  SearchBar,
  StatusChip,
  StatusDot,
  Tabs,
  ToolbarIconButton,
  FILTER_IS,
  FILTER_IS_NOT,
  matchClauses,
  type FilterField,
  type ArchivedListItem,
  type TabItem,
  DataTable,
} from "@polterware/frontend-design-system";
import {
  EntityDetailHost,
  expandedDetail,
  openDetail,
  requestDetailExpanded,
  createPageFilters,
  type EnvironmentItem,
  type ScopeFilterToken,
  type ScopeNodeItem,
  type WorkspaceDecision,
  type WorkspaceCanonEntity,
  type WorkspaceDoc,
  type DocType,
  type DecisionLevel,
  type WorkspaceWorkCard,
  type WorkspaceMilestone,
  type WorkStage,
} from "@polterware/feature-shell";
import { createDetailPanelSelector, detailDisplayFor, detailPanelStore, readRemembered, writeRemembered } from "@polterware/frontend-state";
import { CreateKnowledgeDialog, type CreateKnowledgeKind } from "./create-knowledge-dialog";
import { AddDocDialog, type NewDocInput } from "./add-doc-dialog";
import { KnowledgeDocumentNotFound, type DocNoteProps } from "./knowledge-document-shell";
import { createDocumentAutosave } from "./document-autosave";
import { DecisionDetail, type DecisionAction } from "./decision-detail";
import { DocDetail } from "./doc-detail";
import { DocsEmpty, docsFilterEmpty } from "./docs-empty";
import { DocsTable } from "./docs-table";
import { DOC_TYPES, docTypeIcon } from "./doc-type";
import { EntityLinks } from "./entity-links";
import { LibraryEmpty, libraryFilterEmpty } from "./library-empty";
import {
  EMPTY_LIBRARY_FILTERS,
  filterLibraryRows,
  libraryRowsFromWorkspace,
  type LibraryFilters,
  type LibraryRow,
} from "./library-row";
import {
  EMPTY_CARD_LIST_FILTERS,
  EMPTY_DOC_LIST_FILTERS,
  distinctDocTags,
  filterDocs,
  filterWorkCards,
  type CardListFilters,
  type DocListFilters,
} from "./list-filters";
import { LibraryTable } from "./library-table";
import { libraryStatusTone } from "./knowledge-document-helpers";
import { WorkCardsEmpty, workCardsFilterEmpty } from "./knowledge-empty";
import { WorkBoard } from "./work-board";
import { MilestoneList } from "./milestone-list";
import { backToWorkBoards, initialWorkBoardNavigation, openWorkBoard } from "./work-board-navigation";
import { BACKLOG, cardsInView, selectedMilestoneView, type MilestoneAction } from "./milestones";
import { WorkCardDetail } from "./work-card-detail";
import { WORK_STAGES, cardOpenQuestions, cardTaskProgress, workStageLabel, workStageTone } from "./work-stage";

export { cardSlugFromTitle, uniqueCardSlug } from "./card-slug";
export { KNOWLEDGE_AGENT_PROMPTS, knowledgePromptsForKind } from "./agent-prompts";
export type { KnowledgeAgentPrompt, KnowledgePromptKind } from "./agent-prompts";
export type { MilestoneAction } from "./milestones";
export type { DecisionAction } from "./decision-detail";
export type { NewDocInput } from "./add-doc-dialog";
export { WORK_STAGES, workStageLabel } from "./work-stage";
export { NewFeatureFlow, type FeatureFlowLine } from "./new-feature-flow";
export { TruthFactsPage } from "./truth-facts-page";
export type { ChangeEnvelope } from "./change-envelope";

const TABS: TabItem[] = [
  {
    id: "specs",
    label: "List",
    tooltip: {
      title: "List",
      description:
        "Every Work card as a list. Agents write cards with polterware apply.",
      icon: ListChecks,
    },
  },
  {
    id: "library",
    label: "Library",
    tooltip: {
      title: "Knowledge library",
      description:
        "Decisions and principles in one list. Filter by lifecycle state and links.",
      icon: LibraryBig,
    },
  },
  {
    id: "docs",
    label: "Docs",
    tooltip: {
      title: "Docs",
      description:
        "Documents, runbooks, and project source files that back the facts, linked to the Structure.",
      icon: FileText,
    },
  },
];

type KnowledgeTab = "board" | "specs" | "library" | "docs";

type CollectionTarget = {
  scopeId: string;
  entityId: string;
  entityKind: string;
};

function normalizeTab(raw?: string): KnowledgeTab {
  if (raw === "board" || raw === "library" || raw === "docs") return raw;
  if (raw === "evidence" || raw === "sources" || raw === "runbooks") return "docs";
  if (raw === "decisions") return "library";
  return "specs";
}

/** Library (Decisions) and Docs share the same detail host. */
function isLibraryScope(scopeId?: string): boolean {
  return scopeId === "knowledge:library" || scopeId === "knowledge:docs";
}

function isCardScope(scopeId?: string): boolean {
  return scopeId === "knowledge:specs" || scopeId === "knowledge:board";
}

function collectionFingerprint(
  scopeId: string,
  status: string,
  targets: readonly CollectionTarget[],
): string {
  return `${scopeId}|${status}|${targets.map((t) => `${t.entityId}:${t.entityKind}`).join(",")}`;
}

export function KnowledgeView(props: {
  decisions?: WorkspaceDecision[];
  docs?: WorkspaceDoc[];
  workCards?: WorkspaceWorkCard[];
  /** Milestones own their cards; All work and the Backlog are implicit views. */
  milestones?: WorkspaceMilestone[];
  boardProjectId?: string;
  onMilestoneAction?: (action: MilestoneAction) => Promise<string | null>;
  entities?: WorkspaceCanonEntity[];
  /** Content mode: board, specs, library, or docs. */
  tab?: string;
  /** Tab rail supplied by the host section; defaults to the Knowledge tabs. */
  tabs?: TabItem[];
  /** Selected rail id when the rail differs from the content mode. */
  activeTab?: string;
  /** Accessible name for the rail, or the toolbar title when the rail has one item. */
  tabsLabel?: string;
  loading?: boolean;
  error?: string;
  onTabChange?: (tab: string) => void;
  onOpenDoc?: (id: string) => void;
  onOpenDecision?: (id: string) => void;
  /** Writes one Decision lifecycle move. */
  onDecisionAction?: (decisionId: string, action: DecisionAction) => void;
  onOpenCard?: (slug: string) => void;
  onOpenComponent?: (componentId: string) => void;
  onOpenEntity?: (entityId: string, refId: string, kind: string) => void;
  onLinkEntity?: (knowledgeId: string, entityId: string, kind: string) => void;
  onUnlinkEntity?: (linkId: string) => void;
  onSaveBody?: (id: string, body: string) => void;
  onSaveSourcePath?: (id: string, path: string) => void;
  /** Renames a doc (debounced). */
  onSaveTitle?: (id: string, title: string) => void;
  /** Replaces the tags of a doc. */
  onSaveTags?: (id: string, tags: string[]) => void;
  /** Changes what a doc is: a document, a runbook, or a source file. */
  onSaveDocType?: (id: string, docType: DocType) => void;
  onCreate?: (kind: "decision", title: string, level?: DecisionLevel, scopePath?: string) => void;
  /** Structure nodes offered by the scope pickers; the global scope preselects new items. */
  scopeNodes?: ScopeNodeItem[];
  /** Path of the active global scope, used as the default for new items. */
  activeScopePath?: string;
  /** Writes the scope of a Decision or doc as a Structure node path; empty clears it. */
  onSetScope?: (id: string, path: string) => void;
  onCreateDoc?: (input: NewDocInput) => void;
  onImportProjectSources?: () => void;
  importBusy?: boolean;
  /** Creates a card; milestone is the slug of the open milestone, if any. */
  onCreateCard?: (title: string, stage?: WorkStage, milestone?: string) => void;
  /** Opens the new-feature flow; when set it replaces the plain card dialog. */
  onNewFeature?: () => void;
  /** Reopens the flow for a card in shape or plan. */
  onContinueFeature?: (slug: string) => void;
  onArchive?: (id: string) => void;
  /** Lists archived docs; when set, the Docs tab shows the archive toggle. */
  loadArchivedDocs?: () => Promise<ArchivedListItem[]>;
  onRestoreDoc?: (item: ArchivedListItem) => Promise<void>;
  onDeleteDoc?: (item: ArchivedListItem) => Promise<void>;
  onRemoveCard?: (slug: string) => void;
  onSetCardStage?: (slug: string, stage: WorkStage) => Promise<boolean> | void;
  scopeTokens?: readonly ScopeFilterToken[];
  scopeEnvironments?: readonly EnvironmentItem[];
  onScopeTokensChange?: (tokens: ScopeFilterToken[]) => void;
}) {
  // The open board is remembered per project, so leaving Work and coming back returns to it.
  const boardMemoryKey = () => `board.${props.boardProjectId ?? ""}`;
  const [boardNavigation, setBoardNavigation] = createSignal(readRemembered(boardMemoryKey(), initialWorkBoardNavigation()));
  createEffect(on(() => props.boardProjectId, () => setBoardNavigation(readRemembered(boardMemoryKey(), initialWorkBoardNavigation())), { defer: true }));
  createEffect(() => { if (props.boardProjectId) writeRemembered(boardMemoryKey(), boardNavigation()); });
  const selectedBoard = createMemo(() => selectedMilestoneView(props.milestones ?? [], boardNavigation().selectedId));
  const tab = () => normalizeTab(props.tab);
  /** Board and Specs both list Work cards and share the card detail. */
  const cardTab = () => tab() === "board" || tab() === "specs";
  /** List only exists inside a board, so both card tabs show the board picker until one is open. */
  const boardList = () => cardTab() && !boardNavigation().isOpen;
  const libraryTab = () => tab() === "library";
  const docsTab = () => tab() === "docs";
  const [showArchived, setShowArchived] = createSignal(false);
  createEffect(on(tab, () => setShowArchived(false), { defer: true }));
  const archivedDocsView = () => docsTab() && showArchived() && Boolean(props.loadArchivedDocs);
  const [archivedDocs, { refetch: refetchArchivedDocs }] = createResource(
    () => (archivedDocsView() ? true : undefined),
    async () => (await props.loadArchivedDocs?.()) ?? [],
  );
  const [archiveBusy, setArchiveBusy] = createSignal(false);
  async function runArchiveAction(action: (() => Promise<void>) | undefined) {
    if (!action) return;
    setArchiveBusy(true);
    try {
      await action();
      await refetchArchivedDocs();
    } finally {
      setArchiveBusy(false);
    }
  }
  const railItems = () => props.tabs ?? TABS;
  const [docFilters, setDocFilters] = createSignal<DocListFilters>({
    ...EMPTY_DOC_LIST_FILTERS,
  });
  const [libraryFilters, setLibraryFilters] = createSignal<LibraryFilters>({
    ...EMPTY_LIBRARY_FILTERS,
  });
  const [cardFilters, setCardFilters] = createSignal<CardListFilters>({
    ...EMPTY_CARD_LIST_FILTERS,
  });
  const [bodyOverrides, setBodyOverrides] = createSignal<Record<string, string>>({});
  const [pathOverrides, setPathOverrides] = createSignal<Record<string, string>>({});
  const [createOpen, setCreateOpen] = createSignal(false);
  // The column a card is being added to from the board; shape when added from the toolbar.
  const [createStage, setCreateStage] = createSignal<WorkStage | undefined>();
  const [docAddOpen, setDocAddOpen] = createSignal(false);
  const canAddDoc = () =>
    docsTab() && Boolean(props.onCreateDoc || props.onImportProjectSources);
  const scopeId = createMemo(() => `knowledge:${tab()}`);
  const activeTarget = createDetailPanelSelector((state) => state.activeTarget);

  const bodyAutosave = createDocumentAutosave({
    save: (id, body) => props.onSaveBody?.(id, body),
  });
  const [titleOverrides, setTitleOverrides] = createSignal<Record<string, string>>({});
  const [tagOverrides, setTagOverrides] = createSignal<Record<string, string[]>>({});
  const titleAutosave = createDocumentAutosave({
    save: (id, title) => props.onSaveTitle?.(id, title),
  });
  const pathAutosave = createDocumentAutosave({
    save: (id, path) => props.onSaveSourcePath?.(id, path),
  });
  onCleanup(() => {
    bodyAutosave.flush();
    pathAutosave.flush();
    titleAutosave.flush();
    titleAutosave.dispose();
    bodyAutosave.dispose();
    pathAutosave.dispose();
  });

  /** Tags already used by docs and Decisions, offered when adding a tag. */
  const tagSuggestions = createMemo(() =>
    [...new Set([...distinctDocTags(props.docs ?? []), ...(props.decisions ?? []).flatMap((item) => item.tags)])].sort(),
  );

  /** Note-style editing (title + tags) for one doc, when the host can persist it. */
  function docNote(id: string, title: string, tags: readonly string[]): DocNoteProps | undefined {
    if (!props.onSaveTitle && !props.onSaveTags) return undefined;
    return {
      title: titleOverrides()[id] ?? title,
      onTitleChange: props.onSaveTitle
        ? (next) => {
            setTitleOverrides((current) => ({ ...current, [id]: next }));
            // A blank title is not a valid item; keep it local until a name is typed.
            if (next.trim()) titleAutosave.schedule(id, next.trim());
          }
        : undefined,
      tags: tagOverrides()[id] ?? tags,
      tagSuggestions: tagSuggestions(),
      onTagsChange: props.onSaveTags
        ? (next) => {
            setTagOverrides((current) => ({ ...current, [id]: next }));
            props.onSaveTags?.(id, next);
          }
        : undefined,
    };
  }

  /** Persist only when the editor value differs from the stored baseline. */
  function noteBodyChange(id: string, markdown: string, baseline: string) {
    if (markdown === baseline) {
      setBodyOverrides((current) => {
        if (!(id in current)) return current;
        const { [id]: _removed, ...rest } = current;
        return rest;
      });
      bodyAutosave.cancel(id);
      return;
    }
    setBodyOverrides((current) => ({ ...current, [id]: markdown }));
    bodyAutosave.schedule(id, markdown);
  }

  function notePathChange(id: string, path: string, baseline: string) {
    if (path === baseline) {
      setPathOverrides((current) => {
        if (!(id in current)) return current;
        const { [id]: _removed, ...rest } = current;
        return rest;
      });
      pathAutosave.cancel(id);
      return;
    }
    setPathOverrides((current) => ({ ...current, [id]: path }));
    pathAutosave.schedule(id, path);
  }

  const allLibraryRows = createMemo(() => libraryRowsFromWorkspace({ decisions: props.decisions }));

  const HAS_OPERATORS = [
    { id: FILTER_IS, label: "has" },
    { id: FILTER_IS_NOT, label: "has no" },
  ];
  const linkedField = (subject: string): FilterField => ({
    id: "linked",
    label: subject,
    menuLabel: "Linked",
    kind: "boolean",
    section: "flags",
    icon: () => <Link size={14} aria-hidden />,
    operators: HAS_OPERATORS,
    options: [{ id: "linked", label: "links", icon: () => <Link size={14} aria-hidden /> }],
  });
  const scopeFor = (allowEnv: boolean) => ({
    tokens: () => props.scopeTokens ?? [],
    nodes: () => props.scopeNodes ?? [],
    environments: () => props.scopeEnvironments ?? [],
    allowEnv,
    onTokensChange: (tokens: ScopeFilterToken[]) => props.onScopeTokensChange?.(tokens),
  });
  const cardPageFilters = createPageFilters({
    surface: "work.cards",
    scope: scopeFor(false),
    fields: () => [
      {
        id: "stage",
        label: "Stage",
        kind: "multi",
        icon: () => <StatusDot tone="ok" showLabel={false} />,
        options: WORK_STAGES.map((stage) => ({
          id: stage.id,
          label: stage.label,
          icon: () => <StatusDot tone={workStageTone(stage.id)} showLabel={false} />,
        })),
      },
      {
        id: "questions",
        label: "Card",
        menuLabel: "Open questions",
        kind: "boolean",
        section: "flags",
        icon: () => <ListChecks size={14} aria-hidden />,
        operators: HAS_OPERATORS,
        options: [{ id: "open", label: "open questions", icon: () => <ListChecks size={14} aria-hidden /> }],
      },
    ],
  });
  const libraryPageFilters = createPageFilters({
    surface: "knowledge.library",
    scope: scopeFor(false),
    fields: () => [
      {
        id: "status",
        label: "Status",
        pluralLabel: "statuses",
        kind: "multi",
        icon: () => <StatusDot tone="ok" showLabel={false} />,
        options: ["active", "challenged", "proposed", "superseded"].map((id) => ({
          id,
          label: id[0]!.toUpperCase() + id.slice(1),
          icon: () => <StatusDot tone={libraryStatusTone(id)} showLabel={false} />,
        })),
      },
      linkedField("Decision"),
    ],
  });
  const docPageFilters = createPageFilters({
    surface: "truth.docs",
    scope: scopeFor(true),
    fields: () => [
      {
        id: "type",
        label: "Type",
        kind: "multi",
        icon: () => <FileText size={14} aria-hidden />,
        options: DOC_TYPES.map((type) => ({ id: type.id, label: type.label, icon: () => docTypeIcon(type.id, 14) })),
      },
      {
        id: "tags",
        label: "Tag",
        kind: "multi",
        icon: () => <FileText size={14} aria-hidden />,
        options: distinctDocTags(props.docs ?? []).map((name) => ({ id: name, label: name })),
      },
      linkedField("Doc"),
    ],
  });
  const pageFilters = () => (cardTab() ? cardPageFilters : docsTab() ? docPageFilters : libraryPageFilters);

  const libraryRows = createMemo(() =>
    filterLibraryRows(allLibraryRows(), libraryFilters()).filter((row) =>
      matchClauses(row, libraryPageFilters.pageClauses(), { status: (item) => item.statusLabel, linked: (item) => item.hasLinks }),
    ),
  );

  const docRows = createMemo(() =>
    filterDocs(props.docs ?? [], docFilters()).filter((item) =>
      matchClauses(item, docPageFilters.pageClauses(), { type: (entry) => entry.docType, tags: (entry) => entry.tags, linked: (entry) => entry.entityLinks.length > 0 }),
    ),
  );

  /** Cards of the open milestone view; the list counts come from the unfiltered cards. */
  const viewCards = createMemo(() => cardsInView(props.workCards ?? [], selectedBoard().id));
  const cards = createMemo(() =>
    filterWorkCards(viewCards(), cardFilters()).filter((card) =>
      matchClauses(card, cardPageFilters.pageClauses(), { stage: (item) => item.stage, questions: (item) => cardOpenQuestions(item) > 0 }),
    ),
  );

  let lastCollectionFingerprint = "";
  createEffect(() => {
    const scope = scopeId();
    const status = props.loading ? "loading" : props.error ? "error" : "ready";
    const targets: CollectionTarget[] = props.loading
      ? []
      : libraryTab()
      ? libraryRows().map((row) => ({
          scopeId: scope,
          entityId: row.id,
          entityKind: row.entityKind,
        }))
      : docsTab()
      ? docRows().map((item) => ({
          scopeId: scope,
          entityId: item.id,
          entityKind: "doc",
        }))
      : tab() === "board" && boardNavigation().isOpen
        ? cards().map((card) => ({
            scopeId: scope,
            entityId: card.slug,
            entityKind: "card",
          }))
      : tab() === "specs"
        ? cards().map((card) => ({
            scopeId: scope,
            entityId: card.slug,
            entityKind: "card",
          }))
        : [];

    const fingerprint = collectionFingerprint(scope, status, targets);
    if (fingerprint === lastCollectionFingerprint) return;

    const active = detailPanelStore.getState().activeTarget;
    if (
      active?.scopeId === scope
      && !targets.some(
        (target) => target.entityId === active.entityId && target.entityKind === active.entityKind,
      )
    ) {
      // Filtered-out selection: show the empty state instead of falling back to targets[0].
      detailPanelStore.getState().clearTarget(scope);
    }

    lastCollectionFingerprint = fingerprint;
    detailPanelStore.getState().registerCollection({
      scopeId: scope,
      status,
      targets,
    });
    onCleanup(() => {
      lastCollectionFingerprint = "";
      detailPanelStore.getState().unregisterCollection(scope);
    });
  });

  const decision = createMemo((): WorkspaceDecision | undefined => {
    const target = activeTarget();
    return isLibraryScope(target?.scopeId) && target?.entityKind === "decision"
      ? (props.decisions ?? []).find((item) => item.id === target.entityId)
      : undefined;
  });

  const docItem = createMemo((): WorkspaceDoc | undefined => {
    const target = activeTarget();
    return target?.scopeId === "knowledge:docs" && target.entityKind === "doc"
      ? (props.docs ?? []).find((item) => item.id === target.entityId)
      : undefined;
  });

  const card = createMemo((): WorkspaceWorkCard | undefined => {
    const target = activeTarget();
    return isCardScope(target?.scopeId) && target?.entityKind === "card"
      ? (props.workCards ?? []).find((item) => item.slug === target.entityId)
      : undefined;
  });

  function activate(entityId: string, entityKind: "doc" | "decision" | "card") {
    openDetail({ scopeId: scopeId(), entityId, entityKind });
    if (entityKind === "doc") props.onOpenDoc?.(entityId);
    else if (entityKind === "decision") props.onOpenDecision?.(entityId);
    else props.onOpenCard?.(entityId);
  }

  function activateLibraryRow(row: LibraryRow) {
    activate(row.id, row.entityKind);
  }

  const addCardTo = props.onCreateCard
    ? (stage: WorkStage) => {
        setCreateStage(stage);
        setCreateOpen(true);
      }
    : undefined;
  const createKind = createMemo((): CreateKnowledgeKind => (cardTab() ? "card" : "decision"));

  const listSearch = createMemo(() => {
    if (cardTab()) {
      return {
        placeholder: "Search",
        value: cardFilters().query,
        onInput: (value: string) =>
          setCardFilters((current) => ({ ...current, query: value })),
      };
    }
    if (docsTab()) {
      return {
        placeholder: "Search",
        value: docFilters().query,
        onInput: (value: string) =>
          setDocFilters((current) => ({ ...current, query: value })),
      };
    }
    return {
      placeholder: "Search",
      value: libraryFilters().query,
      onInput: (value: string) =>
        setLibraryFilters((current) => ({ ...current, query: value })),
    };
  });

  const createLabel = createMemo(() => {
    if (docsTab()) return "Add doc";
    if (cardTab()) return "New card";
    return "New Decision";
  });

  function linksFor(
    knowledgeId: string,
    links: WorkspaceDecision["entityLinks"] | WorkspaceDoc["entityLinks"],
  ) {
    return (
      <EntityLinks
        links={links}
        entities={props.entities}
        onOpenEntity={props.onOpenEntity}
        onLinkEntity={
          props.onLinkEntity
            ? (entityId) => {
                const entity = (props.entities ?? []).find((item) => item.id === entityId);
                props.onLinkEntity?.(knowledgeId, entityId, entity?.kind ?? "component");
              }
            : undefined
        }
        onUnlink={props.onUnlinkEntity}
      />
    );
  }

  const hasLibraryItems = createMemo(() => allLibraryRows().length > 0);

  function changeTab(next: string) {
    setLibraryFilters({ ...EMPTY_LIBRARY_FILTERS });
    setDocFilters({ ...EMPTY_DOC_LIST_FILTERS });
    setCardFilters({ ...EMPTY_CARD_LIST_FILTERS });
    cardPageFilters.clearPage();
    libraryPageFilters.clearPage();
    docPageFilters.clearPage();
    setCreateOpen(false);
    setDocAddOpen(false);
    props.onTabChange?.(next);
  }

  // A page-kind entity named by the route replaces the list, like a Notes note route.
  const pageRoute = () => {
    const target = expandedDetail();
    return target !== null && detailDisplayFor(target.entityKind) === "page";
  };

  // A page route whose entity is gone (archived, or a stale link) shows a not-found page instead of nothing.
  const missingPage = (): string | undefined => {
    const target = expandedDetail();
    if (props.loading || !pageRoute() || !target || decision() || docItem() || card()) return undefined;
    if (target.entityKind === "doc" && target.scopeId === "knowledge:docs") return "Doc";
    if (target.entityKind === "decision" && isLibraryScope(target.scopeId)) return "Decision";
    if (target.entityKind === "card" && isCardScope(target.scopeId)) return "Card";
    return undefined;
  };

  return (
    <EntityDetailHost>
    <Show when={!props.loading} fallback={<PageLoading layout="table" label="Loading knowledge…" />}>
      <Show when={!pageRoute()}>
      <Show
        when={boardList()}
        fallback={
      <div class="flex h-full min-h-0 flex-col">
        <PageToolbar.Root>
          <PageToolbar.Leading class="gap-1">
            <Show when={cardTab() && boardNavigation().isOpen}>
              <Button
                variant="texture"
                size="icon"
                aria-label="All milestones"
                onClick={() => {
                  setBoardNavigation((current) => backToWorkBoards(current));
                  if (tab() !== "board") changeTab("board");
                }}
              >
                <ChevronLeft size={14} />
              </Button>
              <span class="pw-page-toolbar-title">{selectedBoard().name}</span>
            </Show>
            <Show
              when={railItems().length > 1}
              fallback={
                <Show when={!(cardTab() && boardNavigation().isOpen)}>
                <span class="pw-page-toolbar-title">
                  {props.tabsLabel ?? railItems()[0]?.label ?? "Knowledge"}
                </span>
                </Show>
              }
            >
              <Tabs
                items={[...railItems()]}
                value={props.activeTab ?? tab()}
                onChange={changeTab}
                aria-label={props.tabsLabel ?? "Knowledge"}
              />
            </Show>
          </PageToolbar.Leading>
          <PageToolbar.Actions>
            <Show when={docsTab() && props.loadArchivedDocs}>
              <Button
                variant="texture"
                size="icon"
                aria-label={showArchived() ? "Back to docs" : "Archived docs"}
                aria-pressed={showArchived()}
                selected={showArchived()}
                onClick={() => setShowArchived((value) => !value)}
              >
                <Archive size={14} />
              </Button>
            </Show>
            <Show when={!archivedDocsView()}>
              <SearchBar
                placeholder={listSearch().placeholder}
                value={listSearch().value}
                onInput={listSearch().onInput}
                aria-label={listSearch().placeholder}
              />
              <FilterPopover
                ariaLabel={cardTab() ? "Card filters" : docsTab() ? "Doc filters" : "Library filters"}
                title={cardTab() ? "Filter cards" : docsTab() ? "Filter docs" : "Filter library"}
                shortcut
                fields={pageFilters().fields()}
                clauses={pageFilters().clauses()}
                onClausesChange={pageFilters().onClausesChange}
                saved={pageFilters().saved()}
              />
              <Show when={cardTab() ? props.onCreateCard : docsTab() ? canAddDoc() : props.onCreate}>
                <ToolbarIconButton
                  label={createLabel()}
                  onClick={() =>
                    cardTab() && props.onNewFeature
                      ? props.onNewFeature()
                      : docsTab()
                        ? setDocAddOpen(true)
                        : setCreateOpen(true)}
                >
                  <Plus size={14} />
                </ToolbarIconButton>
              </Show>
            </Show>
          </PageToolbar.Actions>
        </PageToolbar.Root>

        <ActiveFilterBar
          fields={pageFilters().fields()}
          clauses={pageFilters().clauses()}
          onClausesChange={pageFilters().onClausesChange}
          saved={pageFilters().saved()}
        />

        <Show when={libraryTab()}>
          <PageContent class="p-0">
            <Show
              when={hasLibraryItems()}
              fallback={
                <LibraryEmpty
                  onCreate={props.onCreate ? () => setCreateOpen(true) : undefined}
                />
              }
            >
              <Show when={libraryRows().length > 0} fallback={libraryFilterEmpty()}>
                <LibraryTable
                  rows={libraryRows()}
                  activeRowId={
                    activeTarget()?.scopeId === scopeId()
                      ? activeTarget()?.entityId
                      : null
                  }
                  onActivate={activateLibraryRow}
                />
              </Show>
            </Show>
          </PageContent>
        </Show>

        <Show when={archivedDocsView()}>
          <PageContent class="p-0">
            <Show when={!archivedDocs.loading} fallback={<PageLoading layout="table" label="Loading archived docs…" />}>
              <ArchivedList
                items={archivedDocs() ?? []}
                label="Archived docs"
                icon={<FileText size={16} />}
                busy={archiveBusy()}
                onRestore={(item) => void runArchiveAction(props.onRestoreDoc ? () => props.onRestoreDoc!(item) : undefined)}
                onDelete={(item) => void runArchiveAction(props.onDeleteDoc ? () => props.onDeleteDoc!(item) : undefined)}
              />
            </Show>
          </PageContent>
        </Show>

        <Show when={docsTab() && !archivedDocsView()}>
          <PageContent class="p-0">
            <Show
              when={(props.docs ?? []).length > 0}
              fallback={
                <DocsEmpty
                  onCreate={canAddDoc() ? () => setDocAddOpen(true) : undefined}
                  onImport={props.onImportProjectSources ? () => props.onImportProjectSources?.() : undefined}
                  importBusy={props.importBusy}
                />
              }
            >
              <Show when={docRows().length > 0} fallback={docsFilterEmpty()}>
                <DocsTable
                  rows={docRows()}
                  activeRowId={
                    activeTarget()?.scopeId === scopeId() ? activeTarget()?.entityId : null
                  }
                  onActivate={(id) => activate(id, "doc")}
                />
              </Show>
            </Show>
          </PageContent>
        </Show>

        <Show when={tab() === "board"}>
          <PageContent class="p-0">
            <Show
              when={viewCards().length > 0}
              fallback={
                <WorkBoard selectedBoard={selectedBoard()} cards={[]} activeSlug={null} onActivate={(slug) => activate(slug, "card")} onMoveCard={props.onSetCardStage} onAddCard={addCardTo} />
              }
            >
              <Show when={cards().length > 0} fallback={workCardsFilterEmpty()}>
                <WorkBoard
                  selectedBoard={selectedBoard()}
                  cards={cards()}
                  activeSlug={
                    activeTarget()?.scopeId === "knowledge:board"
                    && activeTarget()?.entityKind === "card"
                      ? activeTarget()?.entityId
                      : null
                  }
                  onActivate={(slug) => activate(slug, "card")}
                  onMoveCard={props.onSetCardStage}
                  onAddCard={addCardTo}
                />
              </Show>
            </Show>
          </PageContent>
        </Show>

        <Show when={tab() === "specs"}>
          <PageContent class="p-0">
            <Show
              when={viewCards().length > 0}
              fallback={
                <WorkCardsEmpty
                  onCreate={props.onNewFeature ?? (props.onCreateCard ? () => setCreateOpen(true) : undefined)}
                />
              }
            >
              <Show when={cards().length > 0} fallback={workCardsFilterEmpty()}>
                <DataTable.Root
                  rows={cards()}
                  getRowId={(item) => item.slug}
                  columnWidthsKey="specs"
                  activeRowId={
                    activeTarget()?.scopeId === "knowledge:specs"
                    && activeTarget()?.entityKind === "card"
                      ? activeTarget()?.entityId
                      : null
                  }
                  activateFirstRow
                  onActiveRowChange={(id) => id && activate(id, "card")}
                >
                  <DataTable.Table aria-label="Cards">
                    <DataTable.Header>
                      <DataTable.ColumnHeader<WorkspaceWorkCard> id="title">Card</DataTable.ColumnHeader>
                      <DataTable.ColumnHeader<WorkspaceWorkCard> id="slug">Slug</DataTable.ColumnHeader>
                      <DataTable.ColumnHeader<WorkspaceWorkCard> id="stage">Stage</DataTable.ColumnHeader>
                      <DataTable.ColumnHeader<WorkspaceWorkCard> id="tasks">Tasks</DataTable.ColumnHeader>
                      <DataTable.ColumnHeader<WorkspaceWorkCard> id="updatedAt">Updated</DataTable.ColumnHeader>
                    </DataTable.Header>
                    <DataTable.Body<WorkspaceWorkCard>>
                      {(item) => (
                        <DataTable.Row
                          row={item}
                          rowId={item.slug}
                          onActivate={() => activate(item.slug, "card")}
                        >
                          <DataTable.PrimaryCell icon={<ListChecks size={16} />} iconTone="knowledge" iconSeed={item.slug} title={item.title} />
                          <DataTable.Cell class="font-mono pw-selectable text-[12px]">{item.slug}</DataTable.Cell>
                          <DataTable.Cell><StatusChip tone={workStageTone(item.stage)} label={workStageLabel(item.stage)} /></DataTable.Cell>
                          <DataTable.Cell class="tabular-nums text-[var(--color-text-muted)]">
                            {cardTaskProgress(item).total > 0
                              ? `${cardTaskProgress(item).done}/${cardTaskProgress(item).total}`
                              : "—"}
                          </DataTable.Cell>
                          <DataTable.Cell class="text-[var(--color-text-muted)]">{item.updatedAt}</DataTable.Cell>
                        </DataTable.Row>
                      )}
                    </DataTable.Body>
                  </DataTable.Table>
                </DataTable.Root>
              </Show>
            </Show>
          </PageContent>
        </Show>
      </div>
        }
      >
        <MilestoneList
          milestones={props.milestones ?? []}
          cards={props.workCards ?? []}
          onOpen={(id) => setBoardNavigation(openWorkBoard(id))}
          onArchive={() => setBoardNavigation(initialWorkBoardNavigation())}
          onAction={props.onMilestoneAction}
          disabled={props.loading || Boolean(props.error)}
        />
      </Show>
      </Show>

      <Show when={decision()}>
        {(item) => (
          <DecisionDetail
            decision={item()}
            allDecisions={props.decisions ?? []}
            bodyMarkdown={bodyOverrides()[item().id] ?? item().bodyMarkdown}
            onBodyChange={(markdown) => {
              noteBodyChange(item().id, markdown, item().bodyMarkdown);
            }}
            onAction={props.onDecisionAction ? (action) => props.onDecisionAction?.(item().id, action) : undefined}
            scopeNodes={props.scopeNodes}
            onScopeChange={props.onSetScope ? (path) => props.onSetScope?.(item().id, path) : undefined}
            links={linksFor(item().id, item().entityLinks)}
            note={docNote(item().id, item().title, item().tags)}
          />
        )}
      </Show>
      <Show when={docItem()}>
        {(item) => (
          <DocDetail
            doc={item()}
            bodyMarkdown={bodyOverrides()[item().id] ?? item().bodyMarkdown}
            pathValue={pathOverrides()[item().id] ?? item().path}
            onDocTypeChange={props.onSaveDocType ? (docType) => props.onSaveDocType?.(item().id, docType) : undefined}
            note={docNote(item().id, item().title, item().tags)}
            onBodyChange={(markdown) => {
              noteBodyChange(item().id, markdown, item().bodyMarkdown);
            }}
            onPathChange={
              props.onSaveSourcePath
                ? (path) => {
                    notePathChange(item().id, path, item().path);
                  }
                : undefined
            }
            onArchive={props.onArchive ? () => {
              // The archived document leaves the list, so the page goes back to it.
              const id = item().id;
              requestDetailExpanded(false);
              props.onArchive?.(id);
            } : undefined}
            scopeNodes={props.scopeNodes}
            onScopeChange={props.onSetScope ? (path) => props.onSetScope?.(item().id, path) : undefined}
            links={linksFor(item().id, item().entityLinks)}
          />
        )}
      </Show>
      <Show when={card()}>
        {(item) => (
          <WorkCardDetail
            card={item()}
            onSetStage={
              props.onSetCardStage
                ? (stage) => props.onSetCardStage?.(item().slug, stage)
                : undefined
            }
            onRemove={
              props.onRemoveCard
                ? () => props.onRemoveCard?.(item().slug)
                : undefined
            }
            onContinueFlow={
              props.onContinueFeature
                ? () => props.onContinueFeature?.(item().slug)
                : undefined
            }
          />
        )}
      </Show>
      <Show when={missingPage()}>
        {(kindLabel) => <KnowledgeDocumentNotFound kindLabel={kindLabel()} />}
      </Show>
      <CreateKnowledgeDialog
        open={createOpen()}
        kind={createKind()}
        scopeNodes={props.scopeNodes}
        defaultScopePath={props.activeScopePath}
        onClose={() => { setCreateOpen(false); setCreateStage(undefined); }}
        onSubmit={(title, kind, level, scopePath) => {
          if (kind === "card") props.onCreateCard?.(title, createStage(), selectedBoard().id && selectedBoard().id !== BACKLOG.id ? selectedBoard().slug : undefined);
          else props.onCreate?.("decision", title, level, scopePath);
          setCreateOpen(false);
          setCreateStage(undefined);
        }}
      />
      <AddDocDialog
        open={docAddOpen()}
        scopeNodes={props.scopeNodes}
        defaultScopePath={props.activeScopePath}
        onClose={() => setDocAddOpen(false)}
        importBusy={props.importBusy}
        tagSuggestions={tagSuggestions()}
        onCreate={
          props.onCreateDoc
            ? (input) => {
                props.onCreateDoc?.(input);
                setDocAddOpen(false);
              }
            : undefined
        }
        onImportProjectSources={
          props.onImportProjectSources
            ? () => {
                props.onImportProjectSources?.();
                setDocAddOpen(false);
              }
            : undefined
        }
      />
    </Show>
    </EntityDetailHost>
  );
}
