import { Show, createMemo, createSignal, type JSX } from "solid-js";
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
import { cardsInView, listedMilestones, milestoneProgress, moveMilestone, type MilestoneAction } from "./milestones";

const STATE_TONE: Record<MilestoneState, StatusTone> = { planned: "muted", active: "syncing", done: "healthy" };
const STATE_LABEL: Record<MilestoneState, string> = { planned: "Planned", active: "Active", done: "Done" };

function cardCountLabel(count: number): string {
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

/**
 * Work opens on the Roadmap: the milestones in order, each with its state, delivery
 * progress, and target date. Milestones are created, renamed, reordered, and archived here.
 */
export function MilestoneList(props: {
  milestones: readonly WorkspaceMilestone[];
  cards: readonly Pick<WorkspaceWorkCard, "milestoneId" | "stage">[];
  onOpen: (id: string) => void;
  /** The Work view tabs, at the start of the toolbar. */
  leading?: JSX.Element;
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
  const rows = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return listed().filter((milestone) => !needle || milestone.name.toLowerCase().includes(needle));
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

  const progressOf = (milestone: WorkspaceMilestone) => milestoneProgress(props.cards, milestone.id);

  return (
    <div class="flex h-full min-h-0 flex-col">
      <PageToolbar.Root>
        <PageToolbar.Leading>{props.leading ?? null}</PageToolbar.Leading>
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
            <PageEmpty title={query().trim() ? "No milestone matches" : "No milestones yet"}>
              <p class="m-0 text-[13px] text-[var(--color-text-muted)]">
                {query().trim() ? "Try another name." : "A milestone groups the cards that ship together. Cards with no milestone stay in the Backlog."}
              </p>
            </PageEmpty>
          }
        >
          <DataTable.Root rows={rows()} getRowId={(milestone) => milestone.id} columnWidthsKey="roadmap" density="list" activateFirstRow>
            <DataTable.Table aria-label="Roadmap">
              <DataTable.Header>
                <DataTable.ColumnHeader<WorkspaceMilestone> id="name" sortable={false}>Milestone</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceMilestone> id="state" sortable={false}>State</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceMilestone> id="progress" sortable={false}>Progress</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceMilestone> id="target" sortable={false}>Target</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceMilestone> id="actions" width="44px" align="right" sortable={false} resizable={false}>
                  <span class="sr-only">Actions</span>
                </DataTable.ColumnHeader>
              </DataTable.Header>
              <DataTable.Body<WorkspaceMilestone>>
                {(milestone) => (
                  <DataTable.Row
                    row={milestone}
                    rowId={milestone.id}
                    aria-label={`Open ${milestone.name}`}
                    onActivate={() => props.onOpen(milestone.id)}
                    onContextMenu={(event) => rowMenu.open(event, milestoneActions(milestone))}
                  >
                    <DataTable.PrimaryCell icon={<FolderKanban size={16} />} iconTone="knowledge" iconSeed={milestone.id} title={milestone.name} />
                    <DataTable.Cell>
                      <StatusChip tone={STATE_TONE[milestone.state]}>{STATE_LABEL[milestone.state]}</StatusChip>
                    </DataTable.Cell>
                    <DataTable.Cell>
                      <span class="flex min-w-0 items-center gap-2.5">
                        <ProgressBar
                          class="w-24 shrink-0"
                          size="sm"
                          tone={progressOf(milestone).done === progressOf(milestone).total && progressOf(milestone).total > 0 ? "success" : "accent"}
                          value={progressOf(milestone).total ? (100 * progressOf(milestone).done) / progressOf(milestone).total : 0}
                          label={`${milestone.name} progress`}
                        />
                        <span class="tabular-nums text-[var(--color-text-muted)]">
                          {progressOf(milestone).total ? `${progressOf(milestone).done}/${progressOf(milestone).total}` : cardCountLabel(0)}
                        </span>
                      </span>
                    </DataTable.Cell>
                    <DataTable.Cell class="tabular-nums text-[var(--color-text-muted)]">{milestone.targetDate || "—"}</DataTable.Cell>
                    <DataTable.Cell align="right">
                      <Show when={props.onAction}>
                        <EntityMenuButton label={`Actions for ${milestone.name}`} actions={milestoneActions(milestone)} />
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
