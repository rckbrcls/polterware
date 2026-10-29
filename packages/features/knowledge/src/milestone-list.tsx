import { Show, createMemo, createSignal } from "solid-js";
import {
  A11yDialog,
  Archive,
  ArrowDown,
  ArrowUp,
  Button,
  DataTable,
  EntityContextMenu,
  EntityMenuButton,
  Field,
  FolderKanban,
  Input,
  Layers,
  PageContent,
  PageEmpty,
  PageToolbar,
  Pencil,
  Plus,
  ProgressBar,
  SearchBar,
  StatusChip,
  ToolbarIconButton,
  createEntityContextMenu,
  pushToast,
  requestConfirm,
  type EntityAction,
  type StatusTone,
} from "@polterware/frontend-design-system";
import type { MilestoneState, WorkspaceMilestone, WorkspaceWorkCard } from "@polterware/feature-shell";
import { ALL_WORK, ALL_WORK_VIEW, cardsInView, listedMilestones, milestoneProgress, moveMilestone, type MilestoneAction } from "./milestones";

const STATE_TONE: Record<MilestoneState, StatusTone> = { planned: "muted", active: "syncing", done: "healthy" };
const STATE_LABEL: Record<MilestoneState, string> = { planned: "Planned", active: "Active", done: "Done" };

function cardCountLabel(count: number): string {
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

/** A Roadmap row: All cards (every card of every board) first, then each milestone's board. */
type RoadmapRow = { id: string; name: string; milestone?: WorkspaceMilestone };

/**
 * Milestones opens on the Roadmap: one table of the boards, All cards first and then the
 * milestones in order, each with its state, delivery progress, and target date. Milestones are
 * created, renamed, reordered, and archived here.
 */
export function MilestoneList(props: {
  milestones: readonly WorkspaceMilestone[];
  cards: readonly Pick<WorkspaceWorkCard, "milestoneId" | "stage">[];
  /** Opens a board: a milestone id, or `all` for All cards. */
  onOpen: (id: string) => void;
  /** Called after the open milestone is archived. */
  onArchive: () => void;
  onAction?: (action: MilestoneAction) => Promise<string | null>;
  disabled?: boolean;
}) {
  const [dialog, setDialog] = createSignal<"create" | "rename" | null>(null);
  const [target, setTarget] = createSignal<WorkspaceMilestone>();
  const [name, setName] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [query, setQuery] = createSignal("");
  const listed = createMemo(() => listedMilestones(props.milestones));
  const rows = createMemo<RoadmapRow[]>(() => {
    const needle = query().trim().toLowerCase();
    return [{ id: ALL_WORK_VIEW, name: ALL_WORK.name }, ...listed().map((milestone) => ({ id: milestone.id, name: milestone.name, milestone }))]
      .filter((row) => !needle || row.name.toLowerCase().includes(needle));
  });
  const disabled = () => Boolean(props.disabled || busy());
  const nameError = () => {
    const value = name().trim();
    if (!value) return "Enter a milestone name.";
    if ([...value].length > 80) return "Use at most 80 characters.";
    if (listed().some((item) => item.id !== target()?.id && item.name.toLowerCase() === value.toLowerCase())) return "A milestone already uses this name.";
    return "";
  };

  function openDialog(kind: "create" | "rename", milestone?: WorkspaceMilestone) {
    setTarget(milestone);
    setName(kind === "create" ? "" : milestone?.name ?? "");
    setError("");
    setDialog(kind);
  }

  async function run(action: MilestoneAction) {
    if (!props.onAction || disabled()) return;
    setBusy(true);
    setError("");
    try {
      const id = await props.onAction(action);
      if (id === null) return;
      setDialog(null);
      if (action.kind === "create") props.onOpen(id);
      if (action.kind === "archive") props.onArchive();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save the milestone.";
      setError(message);
      pushToast(message, "danger");
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const kind = dialog();
    const milestone = target();
    if (!kind || nameError()) return;
    if (kind === "create") void run({ kind, name: name().trim() });
    else if (milestone) void run({ kind, id: milestone.id, name: name().trim() });
  }

  function move(milestone: WorkspaceMilestone, direction: -1 | 1) {
    const milestoneIds = moveMilestone(props.milestones, milestone.id, direction);
    if (milestoneIds) void run({ kind: "reorder", id: milestone.id, milestoneIds });
  }

  async function archive(milestone: WorkspaceMilestone) {
    const count = cardsInView(props.cards, milestone.id).length;
    const confirmed = await requestConfirm({
      title: `Archive “${milestone.name}”?`,
      description: count ? `Its ${cardCountLabel(count)} move to the Backlog.` : "It has no cards.",
      recovery: "The milestone stays in the store, archived. Its cards keep their stage and history but do not return to it.",
      confirmLabel: "Archive",
      tone: "danger",
    });
    if (confirmed) void run({ kind: "archive", id: milestone.id });
  }

  const rowMenu = createEntityContextMenu();
  /** One list for a milestone's "…" button and its right-click menu. */
  function milestoneActions(milestone: WorkspaceMilestone): EntityAction[] {
    if (!props.onAction) return [];
    return [
      { id: "rename", label: "Rename", icon: Pencil, disabled: disabled(), onSelect: () => openDialog("rename", milestone) },
      ...(moveMilestone(props.milestones, milestone.id, -1) ? [{ id: "up", label: "Move up", icon: ArrowUp, disabled: disabled(), onSelect: () => move(milestone, -1) }] : []),
      ...(moveMilestone(props.milestones, milestone.id, 1) ? [{ id: "down", label: "Move down", icon: ArrowDown, disabled: disabled(), onSelect: () => move(milestone, 1) }] : []),
      { id: "archive", label: "Archive", icon: Archive, danger: true, group: "archive", disabled: disabled(), onSelect: () => void archive(milestone) },
    ];
  }

  const progressOf = (row: RoadmapRow) =>
    row.milestone
      ? milestoneProgress(props.cards, row.milestone.id)
      : { done: props.cards.filter((card) => card.stage === "delivered").length, total: props.cards.length };

  return (
    <div class="flex h-full min-h-0 flex-col">
      <PageToolbar.Root>
        <PageToolbar.Leading>{null}</PageToolbar.Leading>
        <PageToolbar.Actions>
          <SearchBar placeholder="Search milestones" value={query()} onInput={setQuery} aria-label="Search milestones" />
          <ToolbarIconButton label="New milestone" disabled={disabled() || !props.onAction} onClick={() => openDialog("create")}>
            <Plus size={14} />
          </ToolbarIconButton>
        </PageToolbar.Actions>
      </PageToolbar.Root>

      <PageContent class="p-0">
        <Show
          when={rows().length > 0}
          fallback={
            <PageEmpty title="No board matches">
              <p class="m-0 text-[13px] text-[var(--color-text-muted)]">Try another name.</p>
            </PageEmpty>
          }
        >
          <DataTable.Root rows={rows()} getRowId={(row) => row.id} columnWidthsKey="roadmap" density="list" activateFirstRow>
            <DataTable.Table aria-label="Roadmap">
              <DataTable.Header>
                <DataTable.ColumnHeader<RoadmapRow> id="name" sortable={false}>Board</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<RoadmapRow> id="state" sortable={false}>State</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<RoadmapRow> id="progress" sortable={false}>Progress</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<RoadmapRow> id="target" sortable={false}>Target</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<RoadmapRow> id="actions" width="44px" align="right" sortable={false} resizable={false}>
                  <span class="sr-only">Actions</span>
                </DataTable.ColumnHeader>
              </DataTable.Header>
              <DataTable.Body<RoadmapRow>>
                {(row) => (
                  <DataTable.Row
                    row={row}
                    rowId={row.id}
                    aria-label={`Open ${row.name}`}
                    onActivate={() => props.onOpen(row.id)}
                    onContextMenu={(event) => { if (row.milestone) rowMenu.open(event, milestoneActions(row.milestone)); }}
                  >
                    <DataTable.PrimaryCell
                      icon={row.milestone ? <FolderKanban size={16} /> : <Layers size={16} />}
                      iconTone="knowledge"
                      iconSeed={row.id}
                      title={row.name}
                    />
                    <DataTable.Cell>
                      <Show when={row.milestone}>
                        {(milestone) => <StatusChip tone={STATE_TONE[milestone().state]}>{STATE_LABEL[milestone().state]}</StatusChip>}
                      </Show>
                    </DataTable.Cell>
                    <DataTable.Cell>
                      <span class="flex min-w-0 items-center gap-2.5">
                        <ProgressBar
                          class="w-24 shrink-0"
                          size="sm"
                          tone={progressOf(row).done === progressOf(row).total && progressOf(row).total > 0 ? "success" : "accent"}
                          value={progressOf(row).total ? (100 * progressOf(row).done) / progressOf(row).total : 0}
                          label={`${row.name} progress`}
                        />
                        <span class="tabular-nums text-[var(--color-text-muted)]">
                          {progressOf(row).total ? `${progressOf(row).done}/${progressOf(row).total}` : cardCountLabel(0)}
                        </span>
                      </span>
                    </DataTable.Cell>
                    <DataTable.Cell class="tabular-nums text-[var(--color-text-muted)]">{row.milestone?.targetDate || "—"}</DataTable.Cell>
                    <DataTable.Cell align="right">
                      <Show when={props.onAction && row.milestone}>
                        {(milestone) => <EntityMenuButton label={`Actions for ${row.name}`} actions={milestoneActions(milestone() as WorkspaceMilestone)} />}
                      </Show>
                    </DataTable.Cell>
                  </DataTable.Row>
                )}
              </DataTable.Body>
            </DataTable.Table>
          </DataTable.Root>
        </Show>
      </PageContent>

      <EntityContextMenu menu={rowMenu} />
      <A11yDialog
        open={dialog() !== null}
        size="sm"
        dismissible={!busy()}
        title={dialog() === "create" ? "New milestone" : "Rename milestone"}
        onClose={() => { if (!busy()) setDialog(null); }}
        footer={<>
          <Button size="sm" variant="ghost" disabled={busy()} onClick={() => setDialog(null)}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={busy() || Boolean(nameError())} onClick={submit}>
            {busy() ? "Saving…" : dialog() === "create" ? "Create" : "Save"}
          </Button>
        </>}
      >
        <Field label="Milestone name" hint="A milestone owns its cards; cards with no milestone stay in the Backlog.">
          <Input value={name()} disabled={busy()} onInput={(event) => setName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }} />
        </Field>
        <Show when={error() || (name().trim() && nameError())}>
          <p role="alert" class="text-sm text-[var(--color-danger)]">{error() || nameError()}</p>
        </Show>
      </A11yDialog>
    </div>
  );
}
