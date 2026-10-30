import { Show, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount } from "solid-js";
import {
  ActiveFilterBar,
  Archive,
  ArchivedList,
  Button,
  ChevronLeft,
  FileText,
  FilterPopover,
  LibraryBig,
  ListChecks,
  PropertyPicker,
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
  type WorkspaceWorkCard,
  type WorkspaceMilestone,
  type WorkStage,
} from "@polterware/feature-shell";
import {
  createDetailPanelSelector,
  detailDisplayFor,
  detailPanelStore,
  isTypingTarget,
  matchesShortcut,
  readRemembered,
  writeRemembered,
} from "@polterware/frontend-state";
import type { ComposeRequest } from "./composers";
import { KnowledgeDocumentNotFound, type DocNoteProps } from "./knowledge-document-shell";
import { createDocumentAutosave } from "./document-autosave";
import { DecisionDetail, type DecisionAction } from "./decision-detail";
import { DocDetail } from "./doc-detail";
import { DocsEmpty, docsFilterEmpty } from "./docs-empty";
import { DocsTable } from "./docs-table";
import { LibraryEmpty, libraryFilterEmpty } from "./library-empty";
import {
  DECISION_STATE_LABEL,
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
import { CardPeek } from "./card-peek";
import { libraryStatusTone } from "./knowledge-document-helpers";
import { WorkCardsEmpty, workCardsFilterEmpty } from "./knowledge-empty";
import { WorkBoard } from "./work-board";
import { MilestoneList } from "./milestone-list";
import { ALL_WORK, BACKLOG, ROADMAP_VIEW, cardsInView, listedMilestones, selectedMilestoneView, viewIdOfRoute, type MilestoneAction } from "./milestones";
import { WorkCardDetail } from "./work-card-detail";
import { WorkListTable } from "./work-list-table";
import {
  WORK_LIST_GROUPINGS,
  WORK_LIST_ORDERINGS,
  WORK_LIST_PROPERTIES,
  normalizeWorkListDisplay,
  type WorkListDisplay,
  type WorkListGrouping,
  type WorkListOrdering,
  type WorkListProperty,
} from "./work-list";
import { WORK_STAGES, cardOpenQuestions, cardTaskProgress, workStageLabel, workStageTone } from "./work-stage";

export { cardSlugFromTitle, uniqueCardSlug } from "./card-slug";
export { KNOWLEDGE_AGENT_PROMPTS, knowledgePromptsForKind } from "./agent-prompts";
export type { KnowledgeAgentPrompt, KnowledgePromptKind } from "./agent-prompts";
export type { MilestoneAction } from "./milestones";
export type { DecisionAction } from "./decision-detail";
export { KnowledgeComposer } from "./composers";
export { RecordPeek, type RecordPeekTarget } from "./record-peek";
export { DocumentActivity } from "./document-activity";
export type { CardDraft, CardKind, ComposeRequest, DecisionDraft, DocDraft } from "./composers";
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
  /** Milestones own their cards; All cards and the Backlog are implicit views. */
  milestones?: WorkspaceMilestone[];
  /** The open Milestones view from the route: `all`, `backlog`, or a milestone id (its board); null is the Roadmap. */
  milestoneView?: string | null;
  onMilestoneViewChange?: (view: string | null) => void;
  onMilestoneAction?: (action: MilestoneAction) => Promise<string | null>;
  /** Moves cards to a milestone by slug (empty is the Backlog) in one write; false when nothing was written. */
  onSetCardsMilestone?: (slugs: string[], milestone: string) => Promise<boolean> | void;
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
  onSaveBody?: (id: string, body: string) => void;
  /** Renames a doc (debounced). */
  onSaveTitle?: (id: string, title: string) => void;
  /** Replaces the tags of a doc. */
  onSaveTags?: (id: string, tags: string[]) => void;
  /** Changes what a doc is: a document, a runbook, or a source file. */
  /** Structure nodes offered by the scope pickers; the global scope preselects new items. */
  scopeNodes?: ScopeNodeItem[];
  /** Writes the contexts of a Decision or doc as Structure node ids; none clears them (a decision becomes a principle). */
  onSetScope?: (id: string, nodeIds: string[]) => void;
  /** Opens the composer for a card, a decision, or a doc, with what this view already knows. */
  onCompose?: (request: ComposeRequest) => void;
  /** Reopens the flow for a card in shape or plan. */
  /** Passes a card's next gate inline; resolves with the refusal lines, empty when it moved on. */
  onAdvanceCard?: (slug: string, step: "contract" | "plan") => Promise<string[]>;
  onArchive?: (id: string) => void;
  /** Lists archived docs; when set, the Docs tab shows the archive toggle. */
  loadArchivedDocs?: () => Promise<ArchivedListItem[]>;
  onRestoreDoc?: (item: ArchivedListItem) => Promise<void>;
  onDeleteDoc?: (item: ArchivedListItem) => Promise<void>;
  onRemoveCard?: (slug: string) => void;
  onSetCardStage?: (slug: string, stage: WorkStage) => Promise<boolean> | void;
  /** Moves the selected cards in one justified write; resolves true once written. */
  onSetCardsStage?: (slugs: string[], stage: WorkStage) => Promise<boolean> | void;
  /** Archives the selected cards in one write under one reason; false when it was cancelled. */
  onRemoveCards?: (slugs: string[]) => Promise<boolean> | void;
  scopeTokens?: readonly ScopeFilterToken[];
  scopeEnvironments?: readonly EnvironmentItem[];
  onScopeTokensChange?: (tokens: ScopeFilterToken[]) => void;
}) {
  // The open Milestones view comes from the route, so Back returns to the Roadmap and the section
  // remembers it: null is the Roadmap.
  const viewId = () => viewIdOfRoute(props.milestoneView);
  const viewOpen = () => viewId() !== null;
  const openView = (routeValue: string | null) => props.onMilestoneViewChange?.(routeValue === ROADMAP_VIEW ? null : routeValue);
  const selectedBoard = createMemo(() => selectedMilestoneView(props.milestones ?? [], viewId() ?? ALL_WORK.id));
  // The list's grouping, ordering, and properties, remembered on this computer.
  const WORK_LIST_DISPLAY_KEY = "work.list.display";
  const [workListDisplay, setWorkListDisplay] = createSignal<WorkListDisplay>(
    normalizeWorkListDisplay(readRemembered<unknown>(WORK_LIST_DISPLAY_KEY, undefined)),
  );
  function changeWorkListDisplay(next: WorkListDisplay) {
    setWorkListDisplay(next);
    writeRemembered(WORK_LIST_DISPLAY_KEY, next);
  }
  const tab = () => normalizeTab(props.tab);
  /** Board and Specs both list Work cards and share the card detail. */
  const cardTab = () => tab() === "board" || tab() === "specs";
  /** List only exists inside a board, so both card tabs show the board picker until one is open. */
  const boardList = () => cardTab() && !viewOpen();
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
  const [peekSlug, setPeekSlug] = createSignal<string | null>(null);
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
  onCleanup(() => {
    bodyAutosave.flush();
    titleAutosave.flush();
    titleAutosave.dispose();
    bodyAutosave.dispose();
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

  const allLibraryRows = createMemo(() => libraryRowsFromWorkspace({ decisions: props.decisions }));

  const HAS_OPERATORS = [
    { id: FILTER_IS, label: "has" },
    { id: FILTER_IS_NOT, label: "has no" },
  ];
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
          label: DECISION_STATE_LABEL[id as WorkspaceDecision["state"]],
          icon: () => <StatusDot tone={libraryStatusTone(id)} showLabel={false} />,
        })),
      },
    ],
  });
  const docPageFilters = createPageFilters({
    surface: "truth.docs",
    scope: scopeFor(true),
    fields: () => [
      {
        id: "tags",
        label: "Tag",
        kind: "multi",
        icon: () => <FileText size={14} aria-hidden />,
        options: distinctDocTags(props.docs ?? []).map((name) => ({ id: name, label: name })),
      },
    ],
  });
  const pageFilters = () => (cardTab() ? cardPageFilters : docsTab() ? docPageFilters : libraryPageFilters);

  const libraryRows = createMemo(() =>
    filterLibraryRows(allLibraryRows(), libraryFilters()).filter((row) =>
      matchClauses(row, libraryPageFilters.pageClauses(), { status: (item) => item.state }),
    ),
  );

  const docRows = createMemo(() =>
    filterDocs(props.docs ?? [], docFilters()).filter((item) =>
      matchClauses(item, docPageFilters.pageClauses(), { tags: (entry) => entry.tags }),
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
      : tab() === "board" && viewOpen()
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

  /** Moves the active marker to a row without opening its page. */
  function markActive(entityId: string, entityKind: "doc" | "card") {
    detailPanelStore.getState().activateTarget({ scopeId: scopeId(), entityId, entityKind });
  }

  function activateLibraryRow(row: LibraryRow) {
    activate(row.id, row.entityKind);
  }

  /** The open milestone a new card ships in; All cards and the Backlog leave it out. */
  const composeMilestoneId = () => {
    const id = selectedBoard().id;
    return id && id !== BACKLOG.id ? id : undefined;
  };
  const composeCard = (stage?: WorkStage) => props.onCompose?.({ kind: "card", stage, milestoneId: composeMilestoneId() });
  const addCardTo = props.onCompose ? (stage: WorkStage) => composeCard(stage) : undefined;
  /** What C and the toolbar "+" create on the open tab. */
  const composeHere = () => {
    if (cardTab()) composeCard();
    else props.onCompose?.(docsTab() ? { kind: "doc" } : { kind: "decision" });
  };

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
    return "New Decision";
  });

  const hasLibraryItems = createMemo(() => allLibraryRows().length > 0);

  // Cmd+B switches Milestones between the board and the list, outside fields and pages. C opens
  // the composer for the open tab; the shell leaves C to this view on Milestones and Truth.
  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isTypingTarget(event.target)) return;
      if (props.onCompose && matchesShortcut("shell.create", event)) {
        event.preventDefault();
        composeHere();
        return;
      }
      if (cardTab() && viewOpen() && !pageRoute() && props.onSetCardsMilestone && matchesShortcut("work.set_milestone", event)) {
        const active = activeCardSlug();
        const slugs = tab() === "specs" && listSelection().length > 0 ? listSelection() : active ? [active] : [];
        if (slugs.length === 0) return;
        event.preventDefault();
        const focused = document.activeElement;
        setMilestonePick({ slugs, anchor: focused instanceof HTMLElement && focused !== document.body ? focused : viewAnchor });
        return;
      }
      if (!cardTab() || pageRoute() || !matchesShortcut("work.toggle_layout", event)) return;
      event.preventDefault();
      changeTab(tab() === "board" ? "specs" : "board");
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  function changeTab(next: string) {
    setLibraryFilters({ ...EMPTY_LIBRARY_FILTERS });
    setDocFilters({ ...EMPTY_DOC_LIST_FILTERS });
    setCardFilters({ ...EMPTY_CARD_LIST_FILTERS });
    cardPageFilters.clearPage();
    libraryPageFilters.clearPage();
    docPageFilters.clearPage();
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

  // M moves the focused card, or the List's selection, to a milestone.
  const [listSelection, setListSelection] = createSignal<string[]>([]);
  const [milestonePick, setMilestonePick] = createSignal<{ slugs: string[]; anchor?: HTMLElement } | null>(null);
  let viewAnchor: HTMLElement | undefined;
  const activeCardSlug = () => {
    const target = activeTarget();
    return target?.entityKind === "card" && (target.scopeId === "knowledge:board" || target.scopeId === "knowledge:specs") ? target.entityId : null;
  };
  const milestoneOptions = () => [
    { value: "", label: BACKLOG.name },
    ...listedMilestones(props.milestones ?? []).map((item) => ({ value: item.slug, label: item.name })),
  ];
  /** The milestone slug every picked card shares, so the picker can mark it. */
  const pickedMilestone = () => {
    const slugs = milestonePick()?.slugs ?? [];
    const ids = new Set((props.workCards ?? []).filter((card) => slugs.includes(card.slug)).map((card) => card.milestoneId ?? ""));
    if (ids.size !== 1) return undefined;
    const [id] = [...ids];
    return id ? (props.milestones ?? []).find((item) => item.id === id)?.slug : "";
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
            {/* Back to the Roadmap, then a board's Board and List tabs; its trail is centered. */}
            <Show when={cardTab()}>
              <Button size="icon" variant="texture" aria-label="Back to Milestones" onClick={() => openView(null)}>
                <ChevronLeft size={14} />
              </Button>
              <Tabs items={[...railItems()]} value={tab()} onChange={changeTab} aria-label={`${selectedBoard().name} layout`} />
            </Show>
            <Show
              when={!cardTab() && railItems().length > 1}
              fallback={
                <Show when={!cardTab()}>
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
          <Show when={cardTab()}>
            <PageToolbar.Center>
              <div ref={(element) => { viewAnchor = element; }} class="flex min-w-0">
              </div>
            </PageToolbar.Center>
          </Show>
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
                // The List's Display (grouping, ordering, properties) sits at the end of its filter menu.
                display={tab() === "specs" ? {
                  grouping: {
                    options: WORK_LIST_GROUPINGS,
                    value: workListDisplay().grouping,
                    onChange: (value) => changeWorkListDisplay({ ...workListDisplay(), grouping: value as WorkListGrouping }),
                  },
                  ordering: {
                    options: WORK_LIST_ORDERINGS,
                    value: workListDisplay().ordering,
                    onChange: (value) => changeWorkListDisplay({ ...workListDisplay(), ordering: value as WorkListOrdering }),
                    direction: workListDisplay().direction,
                    onDirectionChange: (direction) => changeWorkListDisplay({ ...workListDisplay(), direction }),
                  },
                  properties: {
                    options: WORK_LIST_PROPERTIES,
                    visible: workListDisplay().properties,
                    onChange: (visible) => changeWorkListDisplay({ ...workListDisplay(), properties: visible as WorkListProperty[] }),
                  },
                } : undefined}
              />
              {/* Cards are added from a column's or group's +, so a board has no toolbar +. */}
              <Show when={props.onCompose && !cardTab()}>
                <ToolbarIconButton label={createLabel()} onClick={composeHere}>
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
        <PropertyPicker
          label="Milestone"
          options={milestoneOptions()}
          value={pickedMilestone()}
          open={milestonePick() !== null}
          onClose={() => setMilestonePick(null)}
          anchorRef={() => milestonePick()?.anchor ?? viewAnchor}
          onChange={(slug) => {
            const slugs = milestonePick()?.slugs ?? [];
            setMilestonePick(null);
            void props.onSetCardsMilestone?.(slugs, slug);
          }}
        />

        <Show when={libraryTab()}>
          <PageContent class="p-0">
            <Show
              when={hasLibraryItems()}
              fallback={
                <LibraryEmpty
                  onCreate={props.onCompose ? composeHere : undefined}
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
                  onCreate={props.onCompose ? composeHere : undefined}
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
                  onFocusRow={(id) => markActive(id, "doc")}
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
                  onCreate={props.onCompose ? composeHere : undefined}
                />
              }
            >
              <Show when={cards().length > 0} fallback={workCardsFilterEmpty()}>
                <WorkListTable
                  cards={cards()}
                  milestones={props.milestones ?? []}
                  display={workListDisplay()}
                  onDisplayChange={changeWorkListDisplay}
                  activeSlug={
                    activeTarget()?.scopeId === "knowledge:specs"
                    && activeTarget()?.entityKind === "card"
                      ? activeTarget()?.entityId ?? null
                      : null
                  }
                  onActivate={(slug) => activate(slug, "card")}
                  onFocusRow={(slug) => markActive(slug, "card")}
                  onPeek={setPeekSlug}
                  onAddToStage={addCardTo}
                  onSetCardsStage={props.onSetCardsStage}
                  onSetCardsMilestone={props.onSetCardsMilestone}
                  onRemoveCards={props.onRemoveCards}
                  onSelectionChange={setListSelection}
                />
                <CardPeek
                  card={cards().find((card) => card.slug === peekSlug()) ?? null}
                  onClose={() => setPeekSlug(null)}
                  onOpen={(slug) => {
                    setPeekSlug(null);
                    activate(slug, "card");
                  }}
                />
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
          onOpen={(id) => openView(id)}
          onArchive={() => openView(null)}
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
            onScopeChange={props.onSetScope ? (ids) => props.onSetScope?.(item().id, ids) : undefined}
            note={docNote(item().id, item().title, item().tags)}
          />
        )}
      </Show>
      <Show when={docItem()}>
        {(item) => (
          <DocDetail
            doc={item()}
            bodyMarkdown={bodyOverrides()[item().id] ?? item().bodyMarkdown}
            note={docNote(item().id, item().title, item().tags)}
            onBodyChange={(markdown) => {
              noteBodyChange(item().id, markdown, item().bodyMarkdown);
            }}
            onArchive={props.onArchive ? () => {
              // The archived document leaves the list, so the page goes back to it.
              const id = item().id;
              requestDetailExpanded(false);
              props.onArchive?.(id);
            } : undefined}
            scopeNodes={props.scopeNodes}
            onScopeChange={props.onSetScope ? (ids) => props.onSetScope?.(item().id, ids) : undefined}
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
            onAdvance={
              props.onAdvanceCard
                ? (step) => props.onAdvanceCard!(item().slug, step)
                : undefined
            }
          />
        )}
      </Show>
      <Show when={missingPage()}>
        {(kindLabel) => <KnowledgeDocumentNotFound kindLabel={kindLabel()} />}
      </Show>
    </Show>
    </EntityDetailHost>
  );
}
