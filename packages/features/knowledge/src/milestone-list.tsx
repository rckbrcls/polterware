import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import {
  A11yDialog,
  Archive,
  ArrowDown,
  ArrowUp,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FolderKanban,
  IconTile,
  Inbox,
  Input,
  Layers,
  MoreHorizontal,
  PageContent,
  PageToolbar,
  Pencil,
  Plus,
  SearchBar,
  StatusChip,
  ToolbarIconButton,
  buttonClassName,
  pushToast,
  requestConfirm,
  type StatusTone,
} from "@polterware/frontend-design-system";
import type { MilestoneState, WorkspaceMilestone, WorkspaceWorkCard } from "@polterware/feature-shell";
import { ALL_WORK, BACKLOG, cardsInView, listedMilestones, moveMilestone, type MilestoneAction } from "./milestones";

type MilestoneListRow = {
  id: string;
  name: string;
  milestone?: WorkspaceMilestone;
  icon: () => JSX.Element;
};

const STATE_TONE: Record<MilestoneState, StatusTone> = { planned: "muted", active: "syncing", done: "healthy" };
const STATE_LABEL: Record<MilestoneState, string> = { planned: "Planned", active: "Active", done: "Done" };

function cardCountLabel(count: number): string {
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

/**
 * Work opens on this list: All work, the Backlog (cards with no milestone),
 * then the milestones in order. Milestones are created and archived here.
 */
export function MilestoneList(props: {
  milestones: readonly WorkspaceMilestone[];
  cards: readonly Pick<WorkspaceWorkCard, "milestoneId" | "stage">[];
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
  const rows = createMemo<MilestoneListRow[]>(() => {
    const needle = query().trim().toLowerCase();
    return [
      { ...ALL_WORK, icon: () => <Layers size={16} /> },
      { ...BACKLOG, icon: () => <Inbox size={16} /> },
      ...listed().map((milestone) => ({ id: milestone.id, name: milestone.name, milestone, icon: () => <FolderKanban size={16} /> })),
    ].filter((row) => !needle || row.name.toLowerCase().includes(needle));
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

  function summary(row: MilestoneListRow): string {
    const cards = cardsInView(props.cards, row.id);
    if (!row.milestone) return cardCountLabel(cards.length);
    const delivered = cards.filter((card) => card.stage === "delivered").length;
    const progress = cards.length ? `${delivered}/${cards.length} delivered` : "No cards yet";
    return row.milestone.targetDate ? `${progress} · target ${row.milestone.targetDate}` : progress;
  }

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

      <PageContent class="pw-scroll-fade overflow-auto p-4">
        <div class="grid auto-rows-fr gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]" role="list" aria-label="Milestones">
          <For each={rows()}>
            {(row) => (
              <div
                role="listitem"
                class="min-w-0 cursor-pointer rounded-[var(--radius-control)]"
                tabIndex={0}
                aria-label={`Open ${row.name}`}
                onClick={() => props.onOpen(row.id)}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    props.onOpen(row.id);
                  }
                }}
              >
              <Card class="flex h-full min-w-0 items-center gap-3 p-3.5">
                <IconTile size={28} tone="knowledge" seed={row.id || "all"}>{row.icon()}</IconTile>
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-[13.5px] font-medium text-[var(--color-text-primary)]">{row.name}</p>
                  <p class="m-0 truncate text-[12px] tabular-nums text-[var(--color-text-muted)]">{summary(row)}</p>
                </div>
                <Show when={row.milestone}>
                  {(milestone) => (
                    <>
                      <StatusChip tone={STATE_TONE[milestone().state]}>{STATE_LABEL[milestone().state]}</StatusChip>
                      <div onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu positioning={{ placement: "bottom-end" }}>
                          <DropdownMenuTrigger aria-label={`Actions for ${milestone().name}`} disabled={disabled() || !props.onAction} class={buttonClassName("ghost", "icon")}>
                            <MoreHorizontal size={14} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent class="min-w-40">
                            <DropdownMenuItem value="rename" onSelect={() => openDialog("rename", milestone())}><Pencil size={14} />Rename</DropdownMenuItem>
                            <Show when={moveMilestone(props.milestones, milestone().id, -1)}>
                              <DropdownMenuItem value="up" onSelect={() => move(milestone(), -1)}><ArrowUp size={14} />Move up</DropdownMenuItem>
                            </Show>
                            <Show when={moveMilestone(props.milestones, milestone().id, 1)}>
                              <DropdownMenuItem value="down" onSelect={() => move(milestone(), 1)}><ArrowDown size={14} />Move down</DropdownMenuItem>
                            </Show>
                            <DropdownMenuItem value="archive" danger onSelect={() => void archive(milestone())}><Archive size={14} />Archive</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </>
                  )}
                </Show>
              </Card>
              </div>
            )}
          </For>
        </div>
      </PageContent>

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
