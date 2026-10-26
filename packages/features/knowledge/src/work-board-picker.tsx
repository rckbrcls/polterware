import { For, Show, createMemo, createSignal } from "solid-js";
import {
  A11yDialog,
  Button,
  Card,
  Delete,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FolderKanban,
  IconTile,
  Input,
  MoreHorizontal,
  PageContent,
  PageToolbar,
  Pencil,
  Plus,
  SearchBar,
  ToolbarIconButton,
  buttonClassName,
  pushToast,
} from "@polterware/frontend-design-system";
import type { WorkspaceWorkBoard } from "@polterware/feature-shell";
import { DEFAULT_WORK_BOARD, orderWorkBoards, type WorkBoardAction } from "./work-boards";

type WorkBoardListRow = Pick<WorkspaceWorkBoard, "id" | "name"> & {
  key: string;
};

export function WorkBoardList(props: {
  boards: readonly WorkspaceWorkBoard[];
  cardCount: number;
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
  const [query, setQuery] = createSignal("");
  const rows = createMemo<WorkBoardListRow[]>(() => {
    const needle = query().trim().toLowerCase();
    return [
      { ...DEFAULT_WORK_BOARD, key: "default" },
      ...orderWorkBoards(props.boards).map((board) => ({ id: board.id, name: board.name, key: board.id })),
    ].filter((board) => !needle || board.name.toLowerCase().includes(needle));
  });
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
        <PageToolbar.Leading>{null}</PageToolbar.Leading>
        <PageToolbar.Actions>
          <SearchBar placeholder="Search boards" value={query()} onInput={setQuery} aria-label="Search boards" />
          <ToolbarIconButton label="New board" disabled={disabled() || !props.onAction} onClick={() => openDialog("create")}>
            <Plus size={14} />
          </ToolbarIconButton>
        </PageToolbar.Actions>
      </PageToolbar.Root>

      <PageContent class="pw-scroll-fade overflow-auto p-4">
        <div class="grid auto-rows-fr gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]" role="list" aria-label="Work boards">
          <For each={rows()}>
            {(board) => (
              <div
                role="listitem"
                class="min-w-0 cursor-pointer rounded-[var(--radius-control)]"
                tabIndex={0}
                aria-label={`Open board ${board.name}`}
                onClick={() => props.onOpen(board.id)}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    props.onOpen(board.id);
                  }
                }}
              >
              <Card class="flex h-full min-w-0 items-center gap-3 p-3.5">
                <IconTile size={28} tone="knowledge" seed={board.key}><FolderKanban size={16} /></IconTile>
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-[13.5px] font-medium text-[var(--color-text-primary)]">{board.name}</p>
                  <p class="m-0 text-[12px] tabular-nums text-[var(--color-text-muted)]">{props.cardCount} {props.cardCount === 1 ? "card" : "cards"}</p>
                </div>
                <Show when={board.id}>
                  <div onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu positioning={{ placement: "bottom-end" }}>
                      <DropdownMenuTrigger aria-label={`Actions for ${board.name}`} disabled={disabled()} class={buttonClassName("ghost", "icon")}>
                        <MoreHorizontal size={14} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent class="min-w-40">
                        <DropdownMenuItem value="rename" onSelect={() => openDialog("rename", board)}><Pencil size={14} />Rename board</DropdownMenuItem>
                        <DropdownMenuItem value="delete" danger onSelect={() => openDialog("delete", board)}><Delete size={14} />Delete board</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
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
