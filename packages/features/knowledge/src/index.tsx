import { Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import {
  ActiveFilterBar,
  Button,
  ChevronLeft,
  FileText,
  FilterMark,
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
  type ActiveFilterPill,
  type FilterPopoverGroup,
  type TabItem,
  DataTable,
} from "@polterware/frontend-design-system";
import {
  EntityDetailHost,
  expandedDetail,
  openDetail,
  scopeFilterMenuGroups,
  scopeFilterPills,
  type EnvironmentItem,
  type ScopeFilterToken,
  type ScopeNodeItem,
  type WorkspaceVerdict,
  type WorkspaceCanonEntity,
  type WorkspaceEvidence,
  type WorkspaceWorkCard,
  type WorkspaceWorkBoard,
  type WorkStage,
} from "@polterware/feature-shell";
import { createDetailPanelSelector, detailDisplayFor, detailPanelStore, readRemembered, writeRemembered } from "@polterware/frontend-state";
import { CreateKnowledgeDialog, type CreateKnowledgeKind } from "./create-knowledge-dialog";
import { AddEvidenceDialog, type NewEvidenceInput } from "./add-evidence-dialog";
import type { EvidenceNoteProps } from "./knowledge-document-shell";
import type { KnowledgeCreateTemplate } from "./create-templates";
import { createDocumentAutosave } from "./document-autosave";
import { DecisionDetail, type DecisionAction } from "./decision-detail";
import { EvidenceDetail } from "./evidence-detail";
import { EvidenceEmpty, evidenceFilterEmpty } from "./evidence-empty";
import { EvidenceTable } from "./evidence-table";
import { EntityLinks } from "./entity-links";
import { LibraryEmpty, libraryFilterEmpty } from "./library-empty";
import {
  EMPTY_LIBRARY_FILTERS,
  filterLibraryRows,
  libraryFiltersActive,
  libraryRowsFromWorkspace,
  toggleFilterValue,
  type LibraryFilters,
  type LibraryRow,
} from "./library-row";
import {
  EMPTY_CARD_LIST_FILTERS,
  EMPTY_EVIDENCE_LIST_FILTERS,
  cardListFiltersActive,
  distinctEvidenceTags,
  evidenceListFiltersActive,
  filterEvidence,
  filterWorkCards,
  type CardListFilters,
  type EvidenceListFilters,
} from "./list-filters";
import { LibraryTable } from "./library-table";
import { libraryStatusTone } from "./knowledge-document-helpers";
import { WorkCardsEmpty, workCardsFilterEmpty } from "./knowledge-empty";
import { WorkBoard } from "./work-board";
import { WorkBoardList } from "./work-board-picker";
import { backToWorkBoards, initialWorkBoardNavigation, openWorkBoard } from "./work-board-navigation";
import { selectedWorkBoard, type WorkBoardAction } from "./work-boards";
import { WorkCardDetail } from "./work-card-detail";
import { WORK_STAGES, cardTaskProgress, workStageLabel, workStageTone } from "./work-stage";

export { cardSlugFromTitle, uniqueCardSlug } from "./card-slug";
export type { KnowledgeCreateTemplate, KnowledgeTemplateKind } from "./create-templates";
export {
  KNOWLEDGE_CREATE_TEMPLATES,
  knowledgeTemplateById,
  knowledgeTemplatesForKind,
} from "./create-templates";
export type { WorkBoardAction } from "./work-boards";
export type { DecisionAction } from "./decision-detail";
export type { NewEvidenceInput } from "./add-evidence-dialog";
export { WORK_STAGES, workStageLabel } from "./work-stage";
export { NewFeatureFlow, type FeatureFlowLine } from "./new-feature-flow";
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
        "Verdicts and principles in one list. Filter by lifecycle state and links.",
      icon: LibraryBig,
    },
  },
  {
    id: "evidence",
    label: "Evidence",
    tooltip: {
      title: "Project evidence",
      description:
        "Markdown notes and project files that back the facts, described only by tags and linked to the Atlas.",
      icon: FileText,
    },
  },
];

type KnowledgeTab = "board" | "specs" | "library" | "evidence";

type CollectionTarget = {
  scopeId: string;
  entityId: string;
  entityKind: string;
};

function normalizeTab(raw?: string): KnowledgeTab {
  if (raw === "board" || raw === "library" || raw === "evidence") return raw;
  if (raw === "sources" || raw === "docs" || raw === "runbooks") return "evidence";
  if (raw === "verdicts") return "library";
  return "specs";
}

/** Library (Verdicts) and Evidence share the same detail host. */
function isLibraryScope(scopeId?: string): boolean {
  return scopeId === "knowledge:library" || scopeId === "knowledge:evidence";
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
  verdicts?: WorkspaceVerdict[];
  evidence?: WorkspaceEvidence[];
  workCards?: WorkspaceWorkCard[];
  workBoards?: WorkspaceWorkBoard[];
  boardProjectId?: string;
  onBoardAction?: (action: WorkBoardAction) => Promise<string | null>;
  entities?: WorkspaceCanonEntity[];
  /** Content mode: board, specs, library, or evidence. */
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
  onOpenEvidence?: (id: string) => void;
  onOpenVerdict?: (id: string) => void;
  /** Writes one Verdict lifecycle move. */
  onDecisionAction?: (verdictId: string, action: DecisionAction) => void;
  onOpenCard?: (slug: string) => void;
  onOpenComponent?: (componentId: string) => void;
  onOpenEntity?: (entityId: string, refId: string, kind: string) => void;
  onLinkEntity?: (knowledgeId: string, entityId: string, kind: string) => void;
  onUnlinkEntity?: (linkId: string) => void;
  onSaveBody?: (id: string, body: string) => void;
  onSaveSourcePath?: (id: string, path: string) => void;
  /** Renames an Evidence item (debounced). */
  onSaveTitle?: (id: string, title: string) => void;
  /** Replaces the tags of an Evidence item. */
  onSaveTags?: (id: string, tags: string[]) => void;
  onCreate?: (kind: "verdict", title: string, scope?: "principle" | "decision", scopePath?: string) => void;
  /** Atlas nodes offered by the scope pickers; the global scope preselects new items. */
  scopeNodes?: ScopeNodeItem[];
  /** Path of the active global scope, used as the default for new items. */
  activeScopePath?: string;
  /** Writes the Atlas scope of a Decision or Evidence item as a node path; empty clears it. */
  onSetScope?: (id: string, path: string) => void;
  onCreateEvidence?: (input: NewEvidenceInput) => void;
  onImportProjectSources?: () => void;
  importBusy?: boolean;
  onCreateCard?: (title: string, stage?: WorkStage) => void;
  /** Opens the new-feature flow; when set it replaces the plain card dialog. */
  onNewFeature?: () => void;
  /** Reopens the flow for a card in shape or plan. */
  onContinueFeature?: (slug: string) => void;
  onCreateFromTemplate?: (template: KnowledgeCreateTemplate) => void;
  onArchive?: (id: string) => void;
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
  const selectedBoard = createMemo(() => selectedWorkBoard(props.workBoards ?? [], boardNavigation().selectedId));
  const tab = () => normalizeTab(props.tab);
  /** Board and Specs both list Work cards and share the card detail. */
  const cardTab = () => tab() === "board" || tab() === "specs";
  /** List only exists inside a board, so both card tabs show the board picker until one is open. */
  const boardList = () => cardTab() && !boardNavigation().isOpen;
  const libraryTab = () => tab() === "library";
  const evidenceTab = () => tab() === "evidence";
  const railItems = () => props.tabs ?? TABS;
  const [evidenceFilters, setEvidenceFilters] = createSignal<EvidenceListFilters>({
    ...EMPTY_EVIDENCE_LIST_FILTERS,
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
  const [evidenceAddOpen, setEvidenceAddOpen] = createSignal(false);
  const canAddEvidence = () =>
    evidenceTab() && Boolean(props.onCreateEvidence || props.onImportProjectSources);
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

  /** Tags already used by Evidence items and Verdicts, offered when adding a tag. */
  const tagSuggestions = createMemo(() =>
    [...new Set([...distinctEvidenceTags(props.evidence ?? []), ...(props.verdicts ?? []).flatMap((item) => item.tags)])].sort(),
  );

  /** Note-style editing (title + tags) for one Evidence item, when the host can persist it. */
  function evidenceNote(id: string, title: string, tags: readonly string[]): EvidenceNoteProps | undefined {
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

  const allLibraryRows = createMemo(() => libraryRowsFromWorkspace({ verdicts: props.verdicts }));

  const libraryRows = createMemo(() => filterLibraryRows(allLibraryRows(), libraryFilters()));

  const evidenceRows = createMemo(() => filterEvidence(props.evidence ?? [], evidenceFilters()));

  const cards = createMemo(() =>
    filterWorkCards(props.workCards ?? [], cardFilters()),
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
      : evidenceTab()
      ? evidenceRows().map((item) => ({
          scopeId: scope,
          entityId: item.id,
          entityKind: "evidence",
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

  const verdict = createMemo((): WorkspaceVerdict | undefined => {
    const target = activeTarget();
    return isLibraryScope(target?.scopeId) && target?.entityKind === "verdict"
      ? (props.verdicts ?? []).find((item) => item.id === target.entityId)
      : undefined;
  });

  const evidenceItem = createMemo((): WorkspaceEvidence | undefined => {
    const target = activeTarget();
    return target?.scopeId === "knowledge:evidence" && target.entityKind === "evidence"
      ? (props.evidence ?? []).find((item) => item.id === target.entityId)
      : undefined;
  });

  const card = createMemo((): WorkspaceWorkCard | undefined => {
    const target = activeTarget();
    return isCardScope(target?.scopeId) && target?.entityKind === "card"
      ? (props.workCards ?? []).find((item) => item.slug === target.entityId)
      : undefined;
  });

  function activate(entityId: string, entityKind: "evidence" | "verdict" | "card") {
    openDetail({ scopeId: scopeId(), entityId, entityKind });
    if (entityKind === "evidence") props.onOpenEvidence?.(entityId);
    else if (entityKind === "verdict") props.onOpenVerdict?.(entityId);
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
  const createKind = createMemo((): CreateKnowledgeKind => (cardTab() ? "card" : "verdict"));

  const listSearch = createMemo(() => {
    if (cardTab()) {
      return {
        placeholder: "Search",
        value: cardFilters().query,
        onInput: (value: string) =>
          setCardFilters((current) => ({ ...current, query: value })),
      };
    }
    if (evidenceTab()) {
      return {
        placeholder: "Search",
        value: evidenceFilters().query,
        onInput: (value: string) =>
          setEvidenceFilters((current) => ({ ...current, query: value })),
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
    if (evidenceTab()) return "Add evidence";
    if (cardTab()) return "New card";
    return "New Verdict";
  });

  const linkedGroup = (
    current: { linked: "any" | "linked" | "unlinked" },
    onChange: (linked: "any" | "linked" | "unlinked") => void,
  ): FilterPopoverGroup => ({
    id: "linked",
    label: "Linked",
    leading: <Link size={14} aria-hidden />,
    selectionMode: "single" as const,
    options: [
      { id: "linked", label: "Has links", leading: <Link size={14} aria-hidden /> },
      {
        id: "unlinked",
        label: "No links",
        leading: <FilterMark shape="circle" tone="muted" variant="outline" />,
      },
    ].map((option) => ({
      ...option,
      checked: current.linked === option.id,
      onCheckedChange: (checked: boolean) => onChange(checked ? (option.id as "linked" | "unlinked") : "any"),
    })),
  });

  const libraryFilterGroups = createMemo((): FilterPopoverGroup[] => {
    const current = libraryFilters();
    return [
      {
        id: "status",
        label: "Status",
        leading: <StatusDot tone="ok" showLabel={false} />,
        options: [
          { id: "active", label: "Active" },
          { id: "challenged", label: "Challenged" },
          { id: "proposed", label: "Proposed" },
          { id: "superseded", label: "Superseded" },
        ].map((option) => ({
          ...option,
          leading: <StatusDot tone={libraryStatusTone(option.id)} showLabel={false} />,
          checked: current.statuses.includes(option.id),
          onCheckedChange: (checked: boolean) =>
            setLibraryFilters((prev) => ({
              ...prev,
              statuses: toggleFilterValue(prev.statuses, option.id, checked),
            })),
        })),
      },
      linkedGroup(current, (linked) => setLibraryFilters((prev) => ({ ...prev, linked }))),
    ];
  });

  const evidenceFilterGroups = createMemo((): FilterPopoverGroup[] => {
    const current = evidenceFilters();
    const groups: FilterPopoverGroup[] = [];
    const names = distinctEvidenceTags(props.evidence ?? []);
    if (names.length > 0) {
      groups.push({
        id: "tags",
        label: "Tags",
        leading: <FileText size={14} aria-hidden />,
        options: names.map((name) => ({
          id: name,
          label: name,
          checked: current.tags.includes(name),
          onCheckedChange: (checked: boolean) =>
            setEvidenceFilters((prev) => ({
              ...prev,
              tags: toggleFilterValue(prev.tags, name, checked),
            })),
        })),
      });
    }
    groups.push(linkedGroup(current, (linked) => setEvidenceFilters((prev) => ({ ...prev, linked }))));
    return groups;
  });

  const cardFilterGroups = createMemo((): FilterPopoverGroup[] => {
    const current = cardFilters();
    const icon = (node: typeof FileText) => {
      const Icon = node;
      return <Icon size={14} aria-hidden />;
    };
    return [
      {
        id: "stage",
        label: "Stage",
        leading: <StatusDot tone="ok" showLabel={false} />,
        options: WORK_STAGES.map((stage) => ({
          id: stage.id,
          label: stage.label,
          leading: <StatusDot tone={workStageTone(stage.id)} showLabel={false} />,
          checked: current.stages.includes(stage.id),
          onCheckedChange: (checked: boolean) =>
            setCardFilters((prev) => ({
              ...prev,
              stages: toggleFilterValue(prev.stages, stage.id, checked),
            })),
        })),
      },
      {
        id: "questions",
        label: "Questions",
        leading: icon(ListChecks),
        selectionMode: "single" as const,
        options: [
          {
            id: "open",
            label: "Open questions",
            leading: icon(ListChecks),
          },
          {
            id: "clear",
            label: "No open questions",
            leading: <StatusDot tone="healthy" showLabel={false} />,
          },
        ].map((option) => ({
          ...option,
          checked: current.questions === option.id,
          onCheckedChange: (checked: boolean) =>
            setCardFilters((prev) => ({
              ...prev,
              questions: checked
                ? (option.id as "open" | "clear")
                : "any",
            })),
        })),
      },
    ];
  });

  const filterPopoverProps = createMemo(() => {
    if (cardTab()) {
      return {
        ariaLabel: "Card filters",
        title: "Filter cards",
        active: cardListFiltersActive(cardFilters()),
        onClear: () =>
          setCardFilters((current) => ({
            ...EMPTY_CARD_LIST_FILTERS,
            query: current.query,
          })),
        groups: cardFilterGroups(),
      };
    }
    if (evidenceTab()) {
      return {
        ariaLabel: "Evidence filters",
        title: "Filter evidence",
        active: evidenceListFiltersActive(evidenceFilters()),
        onClear: () =>
          setEvidenceFilters((current) => ({
            ...EMPTY_EVIDENCE_LIST_FILTERS,
            query: current.query,
          })),
        groups: evidenceFilterGroups(),
      };
    }
    return {
      ariaLabel: "Library filters",
      title: "Filter library",
      active: libraryFiltersActive(libraryFilters()),
      onClear: () =>
        setLibraryFilters((current) => ({
          ...EMPTY_LIBRARY_FILTERS,
          query: current.query,
        })),
      groups: libraryFilterGroups(),
    };
  });

  const activeFilterPills = createMemo((): ActiveFilterPill[] => {
    if (libraryTab()) {
      const current = libraryFilters();
      const pills: ActiveFilterPill[] = current.statuses.map((status) => ({
        id: `status:${status}`,
        label: `Status: ${status}`,
        onRemove: () =>
          setLibraryFilters((prev) => ({
            ...prev,
            statuses: prev.statuses.filter((value) => value !== status),
          })),
      }));
      if (current.linked !== "any") {
        pills.push({
          id: "linked",
          label: current.linked === "linked" ? "Linked: Has links" : "Linked: No links",
          onRemove: () => setLibraryFilters((prev) => ({ ...prev, linked: "any" })),
        });
      }
      return pills;
    }
    if (evidenceTab()) {
      const current = evidenceFilters();
      const pills: ActiveFilterPill[] = current.tags.map((tag) => ({
        id: `tag:${tag}`,
        label: `Tag: ${tag}`,
        onRemove: () =>
          setEvidenceFilters((prev) => ({ ...prev, tags: prev.tags.filter((value) => value !== tag) })),
      }));
      if (current.linked !== "any") {
        pills.push({
          id: "linked",
          label: current.linked === "linked" ? "Linked: Has links" : "Linked: No links",
          onRemove: () => setEvidenceFilters((prev) => ({ ...prev, linked: "any" })),
        });
      }
      return pills;
    }
    if (cardTab()) {
      const current = cardFilters();
      const pills: ActiveFilterPill[] = current.stages.map((stage) => ({
        id: `stage:${stage}`,
        label: `Stage: ${workStageLabel(stage)}`,
        onRemove: () =>
          setCardFilters((prev) => ({
            ...prev,
            stages: prev.stages.filter((value) => value !== stage),
          })),
      }));
      if (current.questions !== "any") {
        pills.push({
          id: "questions",
          label:
            current.questions === "open"
              ? "Questions: Open"
              : "Questions: None open",
          onRemove: () =>
            setCardFilters((prev) => ({ ...prev, questions: "any" })),
        });
      }
      return pills;
    }
    return [];
  });

  function linksFor(
    knowledgeId: string,
    links: WorkspaceVerdict["entityLinks"] | WorkspaceEvidence["entityLinks"],
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
    setEvidenceFilters({ ...EMPTY_EVIDENCE_LIST_FILTERS });
    setCardFilters({ ...EMPTY_CARD_LIST_FILTERS });
    setCreateOpen(false);
    setEvidenceAddOpen(false);
    props.onTabChange?.(next);
  }

  // A page-kind entity named by the route replaces the list, like a Notes note route.
  const pageRoute = () => {
    const target = expandedDetail();
    return target !== null && detailDisplayFor(target.entityKind) === "page";
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
                aria-label="All boards"
                onClick={() => {
                  setBoardNavigation((current) => backToWorkBoards(current));
                  if (tab() !== "board") changeTab("board");
                }}
              >
                <ChevronLeft size={14} />
              </Button>
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
            <SearchBar
              placeholder={listSearch().placeholder}
              value={listSearch().value}
              onInput={listSearch().onInput}
              aria-label={listSearch().placeholder}
            />
            <FilterPopover
              ariaLabel={filterPopoverProps().ariaLabel}
              title={filterPopoverProps().title}
              active={filterPopoverProps().active || (props.scopeTokens?.length ?? 0) > 0}
              onClear={() => {
                filterPopoverProps().onClear();
                props.onScopeTokensChange?.([]);
              }}
              groups={[
                ...scopeFilterMenuGroups({
                  tokens: props.scopeTokens ?? [],
                  nodes: props.scopeNodes ?? [],
                  environments: props.scopeEnvironments ?? [],
                  allowEnv: evidenceTab(),
                  onTokensChange: (tokens) => props.onScopeTokensChange?.(tokens),
                }),
                ...filterPopoverProps().groups,
              ]}
            />
            <Show when={cardTab() ? props.onCreateCard : evidenceTab() ? canAddEvidence() : props.onCreate}>
              <ToolbarIconButton
                label={createLabel()}
                onClick={() =>
                  cardTab() && props.onNewFeature
                    ? props.onNewFeature()
                    : tab() === "evidence"
                      ? setEvidenceAddOpen(true)
                      : setCreateOpen(true)}
              >
                <Plus size={14} />
              </ToolbarIconButton>
            </Show>
          </PageToolbar.Actions>
        </PageToolbar.Root>

        <ActiveFilterBar
          items={[
            ...scopeFilterPills(props.scopeTokens ?? [], (tokens) => props.onScopeTokensChange?.(tokens)),
            ...activeFilterPills(),
          ]}
          onClear={() => {
            filterPopoverProps().onClear();
            props.onScopeTokensChange?.([]);
          }}
        />

        <Show when={libraryTab()}>
          <PageContent class="p-0">
            <Show
              when={hasLibraryItems()}
              fallback={
                <LibraryEmpty
                  onCreate={props.onCreate ? () => setCreateOpen(true) : undefined}
                  onCreateFromTemplate={props.onCreateFromTemplate}
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

        <Show when={evidenceTab()}>
          <PageContent class="p-0">
            <Show
              when={(props.evidence ?? []).length > 0}
              fallback={
                <EvidenceEmpty
                  onCreate={canAddEvidence() ? () => setEvidenceAddOpen(true) : undefined}
                  onImport={props.onImportProjectSources ? () => props.onImportProjectSources?.() : undefined}
                  importBusy={props.importBusy}
                  onCreateFromTemplate={props.onCreateFromTemplate}
                />
              }
            >
              <Show when={evidenceRows().length > 0} fallback={evidenceFilterEmpty()}>
                <EvidenceTable
                  rows={evidenceRows()}
                  activeRowId={
                    activeTarget()?.scopeId === scopeId() ? activeTarget()?.entityId : null
                  }
                  onActivate={(id) => activate(id, "evidence")}
                />
              </Show>
            </Show>
          </PageContent>
        </Show>

        <Show when={tab() === "board"}>
          <PageContent class="p-0">
            <Show
              when={(props.workCards ?? []).length > 0}
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
              when={(props.workCards ?? []).length > 0}
              fallback={
                <WorkCardsEmpty
                  onCreate={props.onNewFeature ?? (props.onCreateCard ? () => setCreateOpen(true) : undefined)}
                  onCreateFromTemplate={props.onCreateFromTemplate}
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
        <WorkBoardList
          boards={props.workBoards ?? []}
          cardCount={(props.workCards ?? []).length}
          onOpen={(id) => setBoardNavigation(openWorkBoard(id))}
          onDelete={() => setBoardNavigation(initialWorkBoardNavigation())}
          onAction={props.onBoardAction}
          disabled={props.loading || Boolean(props.error)}
        />
      </Show>
      </Show>

      <Show when={verdict()}>
        {(item) => (
          <DecisionDetail
            verdict={item()}
            allVerdicts={props.verdicts ?? []}
            bodyMarkdown={bodyOverrides()[item().id] ?? item().bodyMarkdown}
            onBodyChange={(markdown) => {
              noteBodyChange(item().id, markdown, item().bodyMarkdown);
            }}
            onAction={props.onDecisionAction ? (action) => props.onDecisionAction?.(item().id, action) : undefined}
            scopeNodes={props.scopeNodes}
            onScopeChange={props.onSetScope ? (path) => props.onSetScope?.(item().id, path) : undefined}
            links={linksFor(item().id, item().entityLinks)}
            note={evidenceNote(item().id, item().title, item().tags)}
          />
        )}
      </Show>
      <Show when={evidenceItem()}>
        {(item) => (
          <EvidenceDetail
            evidence={item()}
            bodyMarkdown={bodyOverrides()[item().id] ?? item().bodyMarkdown}
            pathValue={pathOverrides()[item().id] ?? item().path}
            note={evidenceNote(item().id, item().title, item().tags)}
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
            onArchive={props.onArchive ? () => props.onArchive?.(item().id) : undefined}
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
      <CreateKnowledgeDialog
        open={createOpen()}
        kind={createKind()}
        scopeNodes={props.scopeNodes}
        defaultScopePath={props.activeScopePath}
        onClose={() => { setCreateOpen(false); setCreateStage(undefined); }}
        onCreateFromTemplate={
          props.onCreateFromTemplate
            ? (template) => {
                props.onCreateFromTemplate?.(template);
                setCreateOpen(false);
              }
            : undefined
        }
        onSubmit={(title, kind, scope, scopePath) => {
          if (kind === "card") props.onCreateCard?.(title, createStage());
          else props.onCreate?.("verdict", title, scope, scopePath);
          setCreateOpen(false);
          setCreateStage(undefined);
        }}
      />
      <AddEvidenceDialog
        open={evidenceAddOpen()}
        scopeNodes={props.scopeNodes}
        defaultScopePath={props.activeScopePath}
        onClose={() => setEvidenceAddOpen(false)}
        importBusy={props.importBusy}
        tagSuggestions={tagSuggestions()}
        onCreate={
          props.onCreateEvidence
            ? (input) => {
                props.onCreateEvidence?.(input);
                setEvidenceAddOpen(false);
              }
            : undefined
        }
        onImportProjectSources={
          props.onImportProjectSources
            ? () => {
                props.onImportProjectSources?.();
                setEvidenceAddOpen(false);
              }
            : undefined
        }
        onCreateFromTemplate={
          props.onCreateFromTemplate
            ? (template) => {
                props.onCreateFromTemplate?.(template);
                setEvidenceAddOpen(false);
              }
            : undefined
        }
      />
    </Show>
    </EntityDetailHost>
  );
}
