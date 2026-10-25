import { Show, createMemo, createSignal } from "solid-js";
import {
  A11yDialog,
  Button,
  DataTable,
  Delete,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FolderKanban,
  Input,
  MoreHorizontal,
  PageContent,
  PageToolbar,
  Pencil,
  Plus,
  Tabs,
  ToolbarIconButton,
  buttonClassName,
  pushToast,
  type TabItem,
} from "@polterware/frontend-design-system";
import type { WorkspaceWorkBoard } from "@polterware/feature-shell";
import { DEFAULT_WORK_BOARD, orderWorkBoards, type WorkBoardAction } from "./work-boards";

type WorkBoardListRow = Pick<WorkspaceWorkBoard, "id" | "name"> & {
  key: string;
};

export function WorkBoardList(props: {
  boards: readonly WorkspaceWorkBoard[];
  cardCount: number;
  tabs: readonly TabItem[];
  activeTab: string;
  tabsLabel: string;
  onTabChange: (tab: string) => void;
  onOpen: (id: string) => void;
  onDelete: () => void;
  onAction?: (action: WorkBoardAction) => Promise<string | null>;
  disabled?: boolean;
}) {
  const [dialog, setDialog] = createSignal<"create" | "rename" | "delete" | null>(null);
  const [target, setTarget] = createSignal<WorkBoardListRow>();
  const [name, setName] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const rows = createMemo<WorkBoardListRow[]>(() => [
    { ...DEFAULT_WORK_BOARD, key: "default" },
    ...orderWorkBoards(props.boards).map((board) => ({ id: board.id, name: board.name, key: board.id })),
  ]);
  const disabled = () => Boolean(props.disabled || busy());
  const nameError = () => {
    const value = name().trim();
    if (!value) return "Enter a board name.";
    if ([...value].length > 80) return "Use at most 80 characters.";
    if (props.boards.some((board) => board.id !== target()?.id && board.name === value)) return "A board already uses this name.";
    return "";
  };

  function openDialog(kind: "create" | "rename" | "delete", board?: WorkBoardListRow) {
    setTarget(board);
    setName(kind === "create" ? "" : board?.name ?? "");
    setError("");
    setDialog(kind);
  }

  async function run(action: WorkBoardAction) {
    if (!props.onAction || disabled()) return;
    setBusy(true);
    setError("");
    try {
      const id = await props.onAction(action);
      if (id === null) return;
      setDialog(null);
      if (action.kind === "create") props.onOpen(id);
      if (action.kind === "delete") props.onDelete();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save the board.";
      setError(message);
      pushToast(message, "danger");
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const kind = dialog();
    const board = target();
    if (!kind || (kind !== "delete" && nameError())) return;
    if (kind === "create") void run({ kind, name: name().trim() });
    else if (board) void run(kind === "delete"
      ? { kind, id: board.id }
      : { kind, id: board.id, name: name().trim() });
  }

  return (
    <div class="flex h-full min-h-0 flex-col">
      <PageToolbar.Root>
        <PageToolbar.Tabs>
          <Tabs items={[...props.tabs]} value={props.activeTab} onChange={props.onTabChange} aria-label={props.tabsLabel} />
        </PageToolbar.Tabs>
        <PageToolbar.Actions>
          <ToolbarIconButton label="New board" disabled={disabled() || !props.onAction} onClick={() => openDialog("create")}>
            <Plus size={14} />
          </ToolbarIconButton>
        </PageToolbar.Actions>
      </PageToolbar.Root>

      <PageContent class="p-0">
        <DataTable.Root rows={rows()} getRowId={(board) => board.key} columnWidthsKey="work-boards">
          <DataTable.Table aria-label="Work boards">
            <DataTable.Header>
              <DataTable.ColumnHeader<WorkBoardListRow> id="name" minWidth={240}>Board</DataTable.ColumnHeader>
              <DataTable.ColumnHeader<WorkBoardListRow> id="cards" width="8rem" align="right">Cards</DataTable.ColumnHeader>
              <DataTable.ColumnHeader<WorkBoardListRow> id="actions" width="44px" align="right" sortable={false} resizable={false}><span class="sr-only">Actions</span></DataTable.ColumnHeader>
            </DataTable.Header>
            <DataTable.Body<WorkBoardListRow>>
              {(board) => (
                <DataTable.Row row={board} rowId={board.key} onActivate={() => props.onOpen(board.id)} aria-label={`Open board ${board.name}`}>
                  <DataTable.PrimaryCell icon={<FolderKanban size={16} />} iconTone="knowledge" iconSeed={board.key} title={board.name} />
                  <DataTable.Cell align="right" class="tabular-nums text-[var(--color-text-muted)]">{props.cardCount}</DataTable.Cell>
                  <DataTable.Cell align="right" onClick={(event) => event.stopPropagation()}>
                    <Show when={board.id}>
                      <DropdownMenu positioning={{ placement: "bottom-end" }}>
                        <DropdownMenuTrigger aria-label={`Actions for ${board.name}`} disabled={disabled()} class={buttonClassName("ghost", "icon")}>
                          <MoreHorizontal size={14} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent class="min-w-40">
                          <DropdownMenuItem value="rename" onSelect={() => openDialog("rename", board)}><Pencil size={14} />Rename board</DropdownMenuItem>
                          <DropdownMenuItem value="delete" danger onSelect={() => openDialog("delete", board)}><Delete size={14} />Delete board</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Show>
                  </DataTable.Cell>
                </DataTable.Row>
              )}
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      </PageContent>

      <A11yDialog
        open={dialog() !== null}
        size="sm"
        dismissible={!busy()}
        title={dialog() === "create" ? "New board" : dialog() === "rename" ? "Rename board" : "Delete board"}
        onClose={() => { if (!busy()) setDialog(null); }}
        footer={<>
          <Button size="sm" variant="ghost" disabled={busy()} onClick={() => setDialog(null)}>Cancel</Button>
          <Button size="sm" variant={dialog() === "delete" ? "danger" : "primary"} disabled={busy() || (dialog() !== "delete" && Boolean(nameError()))} onClick={submit}>
            {busy() ? "Saving…" : dialog() === "delete" ? "Delete" : dialog() === "create" ? "Create" : "Save"}
          </Button>
        </>}
      >
        <Show when={dialog() === "delete"} fallback={
          <Field label="Board name" hint="A saved view of all Work cards, grouped by stage.">
            <Input value={name()} disabled={busy()} onInput={(event) => setName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }} />
          </Field>
        }>
          <p class="text-sm text-[var(--color-text-primary)]">Delete “{target()?.name}”? Work cards stay in the project.</p>
        </Show>
        <Show when={error() || (name().trim() && dialog() !== "delete" && nameError())}>
          <p role="alert" class="text-sm text-[var(--color-danger)]">{error() || nameError()}</p>
        </Show>
      </A11yDialog>
    </div>
  );
}
