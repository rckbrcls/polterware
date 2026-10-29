import { Show, createMemo, createSignal, type JSX } from "solid-js";
import {
  Archive,
  Button,
  DataTable,
  ListChecks,
  PropertyPicker,
  StatusChip,
  type DataTableGrouping,
  type DataTableSortState,
} from "@polterware/frontend-design-system";
import type { WorkStage, WorkspaceMilestone, WorkspaceWorkCard } from "@polterware/feature-shell";
import {
  DEFAULT_WORK_LIST_DISPLAY,
  orderWorkCards,
  workListGroupOf,
  workListGroups,
  type WorkListDisplay,
  type WorkListOrdering,
  type WorkListProperty,
} from "./work-list";
import { WORK_STAGES, cardTaskProgress, workStageLabel, workStageTone } from "./work-stage";

/** Ordering fields and the columns that sort by them. */
const ORDER_COLUMNS: Record<WorkListOrdering, string> = { updated: "updatedAt", title: "title", stage: "stage" };

function orderingOfColumn(columnId: string): WorkListOrdering | undefined {
  return (Object.keys(ORDER_COLUMNS) as WorkListOrdering[]).find((ordering) => ORDER_COLUMNS[ordering] === columnId);
}

const stageIndex = (card: WorkspaceWorkCard) => WORK_STAGES.findIndex((stage) => stage.id === card.stage);
const updatedTime = (card: WorkspaceWorkCard) => {
  const time = Date.parse(card.updatedAtIso || card.updatedAt);
  return Number.isNaN(time) ? 0 : time;
};

/** Moves the selected cards to one stage, through the shared property picker. */
function MoveToStage(props: { onPick: (stage: WorkStage) => void; disabled?: boolean }) {
  const [open, setOpen] = createSignal(false);
  let trigger: HTMLButtonElement | undefined;
  return (
    <>
      <Button ref={trigger} size="sm" variant="ghost" disabled={props.disabled} aria-expanded={open()} onClick={() => setOpen((value) => !value)}>
        Move to…
      </Button>
      <PropertyPicker
        label="Stage"
        options={WORK_STAGES.map((stage) => ({ value: stage.id, label: stage.label }))}
        open={open()}
        onClose={() => setOpen(false)}
        anchorRef={() => trigger}
        placement="top-start"
        onChange={(value) => {
          setOpen(false);
          props.onPick(value as WorkStage);
        }}
      />
    </>
  );
}

/**
 * The Work list: Linear's 44px rows, grouped by stage or milestone, ordered and with the
 * properties the Display menu chose. Selected cards move or archive in one justified write.
 */
export function WorkListTable(props: {
  cards: readonly WorkspaceWorkCard[];
  milestones: readonly WorkspaceMilestone[];
  display: WorkListDisplay;
  onDisplayChange: (display: WorkListDisplay) => void;
  activeSlug: string | null;
  onActivate: (slug: string) => void;
  onPeek: (slug: string) => void;
  /** A stage group's "+": a new card in that stage. */
  onAddToStage?: (stage: WorkStage) => void;
  /** Resolves true once the batch was written, so the selection clears. */
  onSetCardsStage?: (slugs: string[], stage: WorkStage) => Promise<boolean> | void;
  onRemoveCards?: (slugs: string[]) => void;
}) {
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = createSignal(false);
  const bulk = () => Boolean(props.onSetCardsStage || props.onRemoveCards);
  const rows = createMemo(() => orderWorkCards(props.cards, props.display.ordering, props.display.direction));
  const shows = (property: WorkListProperty) => props.display.properties.includes(property);
  const milestoneName = (id?: string) =>
    (id ? props.milestones.find((milestone) => milestone.id === id)?.name : undefined) ?? "Backlog";

  const grouping = createMemo<DataTableGrouping<WorkspaceWorkCard> | undefined>(() => {
    const by = props.display.grouping;
    if (by === "none") return undefined;
    return {
      by: (card) => workListGroupOf(card, by),
      groups: workListGroups(by, props.milestones).map((group) => ({
        ...group,
        onAdd: by === "stage" && props.onAddToStage ? () => props.onAddToStage!(group.id as WorkStage) : undefined,
        addLabel: `New card in ${group.label}`,
      })),
    };
  });
  const sort = (): DataTableSortState => ({ columnId: ORDER_COLUMNS[props.display.ordering], direction: props.display.direction });
  function changeSort(next: DataTableSortState) {
    const ordering = next ? orderingOfColumn(next.columnId) : undefined;
    props.onDisplayChange(
      next && ordering
        ? { ...props.display, ordering, direction: next.direction }
        : { ...props.display, ordering: DEFAULT_WORK_LIST_DISPLAY.ordering, direction: DEFAULT_WORK_LIST_DISPLAY.direction },
    );
  }

  async function moveSelected(stage: WorkStage, clear: () => void) {
    if (!props.onSetCardsStage || busy()) return;
    setBusy(true);
    try {
      if ((await props.onSetCardsStage([...selected()], stage)) !== false) clear();
    } finally {
      setBusy(false);
    }
  }

  const table = (): JSX.Element => (
    <DataTable.Root
      rows={rows()}
      getRowId={(item) => item.slug}
      columnWidthsKey="specs"
      density="list"
      grouping={grouping()}
      sort={sort()}
      onSortChange={changeSort}
      selectionMode={bulk() ? "multiple" : "none"}
      selectedRowIds={selected()}
      onSelectionChange={setSelected}
      activeRowId={props.activeSlug}
      activateFirstRow
      onActiveRowChange={(id) => id && props.onActivate(id)}
    >
      <DataTable.Table aria-label="Cards">
        <DataTable.Header>
          <Show when={bulk()}><DataTable.SelectionCell /></Show>
          <DataTable.ColumnHeader<WorkspaceWorkCard> id="title" sortBy={(card) => card.title.toLowerCase()}>Card</DataTable.ColumnHeader>
          <Show when={shows("slug")}><DataTable.ColumnHeader<WorkspaceWorkCard> id="slug" sortable={false}>Slug</DataTable.ColumnHeader></Show>
          <Show when={shows("stage")}><DataTable.ColumnHeader<WorkspaceWorkCard> id="stage" sortBy={stageIndex}>Stage</DataTable.ColumnHeader></Show>
          <Show when={shows("tasks")}><DataTable.ColumnHeader<WorkspaceWorkCard> id="tasks" sortable={false}>Tasks</DataTable.ColumnHeader></Show>
          <Show when={shows("milestone")}><DataTable.ColumnHeader<WorkspaceWorkCard> id="milestone" sortable={false}>Milestone</DataTable.ColumnHeader></Show>
          <Show when={shows("updated")}><DataTable.ColumnHeader<WorkspaceWorkCard> id="updatedAt" sortBy={updatedTime}>Updated</DataTable.ColumnHeader></Show>
        </DataTable.Header>
        <DataTable.Body<WorkspaceWorkCard>>
          {(item) => (
            <DataTable.Row row={item} rowId={item.slug} onActivate={() => props.onActivate(item.slug)} onPeek={() => props.onPeek(item.slug)}>
              <Show when={bulk()}><DataTable.SelectionCell rowId={item.slug} label={`Select ${item.title}`} /></Show>
              <DataTable.PrimaryCell icon={<ListChecks size={16} />} iconTone="knowledge" iconSeed={item.slug} title={item.title} />
              <Show when={shows("slug")}><DataTable.Cell class="font-mono pw-selectable text-[12px]">{item.slug}</DataTable.Cell></Show>
              <Show when={shows("stage")}><DataTable.Cell><StatusChip tone={workStageTone(item.stage)} label={workStageLabel(item.stage)} /></DataTable.Cell></Show>
              <Show when={shows("tasks")}>
                <DataTable.Cell class="tabular-nums text-[var(--color-text-muted)]">
                  {cardTaskProgress(item).total > 0 ? `${cardTaskProgress(item).done}/${cardTaskProgress(item).total}` : "—"}
                </DataTable.Cell>
              </Show>
              <Show when={shows("milestone")}><DataTable.Cell class="text-[var(--color-text-muted)]">{milestoneName(item.milestoneId)}</DataTable.Cell></Show>
              <Show when={shows("updated")}><DataTable.Cell class="text-[var(--color-text-muted)]">{item.updatedAt}</DataTable.Cell></Show>
            </DataTable.Row>
          )}
        </DataTable.Body>
      </DataTable.Table>
      <Show when={bulk()}>
        <DataTable.SelectionToolbar<WorkspaceWorkCard>>
          {(selection) => (
            <>
              <Show when={props.onSetCardsStage}>
                <MoveToStage disabled={busy()} onPick={(stage) => void moveSelected(stage, selection.clearSelection)} />
              </Show>
              <Show when={props.onRemoveCards}>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy()}
                  onClick={() => {
                    props.onRemoveCards?.([...selection.selectedRowIds()]);
                    selection.clearSelection();
                  }}
                >
                  <Archive size={14} />
                  Archive
                </Button>
              </Show>
            </>
          )}
        </DataTable.SelectionToolbar>
      </Show>
    </DataTable.Root>
  );

  return (
    // Showing or hiding a property measures the columns again.
    <Show keyed when={props.display.properties.join(",") || "none"}>
      {(_properties) => table()}
    </Show>
  );
}
