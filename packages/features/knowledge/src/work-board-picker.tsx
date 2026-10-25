import { Show, createMemo, createSignal } from "solid-js";
import {
  A11yDialog, ArrowDown, ArrowUp, Button, DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger, Field, Input, MoreHorizontal, Pencil,
  Plus, Select, Delete, buttonClassName,
} from "@polterware/frontend-design-system";
import type { WorkspaceWorkBoard } from "@polterware/feature-shell";
import { moveWorkBoard, selectedWorkBoard, workBoardOptions, type WorkBoardAction } from "./work-boards";

export function WorkBoardPicker(props: {
  boards: readonly WorkspaceWorkBoard[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAction?: (action: WorkBoardAction) => Promise<string | null>;
  disabled?: boolean;
}) {
  const selected = createMemo(() => selectedWorkBoard(props.boards, props.selectedId));
  const [dialog, setDialog] = createSignal<"create" | "rename" | "delete" | null>(null);
  const [targetId, setTargetId] = createSignal("");
  const [targetName, setTargetName] = createSignal("");
  const [name, setName] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const disabled = () => props.disabled || busy();
  const nameError = () => {
    const value = name().trim();
    if (!value) return "Enter a board name.";
    if ([...value].length > 80) return "Use at most 80 characters.";
    if (props.boards.some((board) => board.id !== targetId() && board.name === value)) return "A board already uses this name.";
    return "";
  };

  function open(kind: "create" | "rename" | "delete") {
    setTargetId(kind === "create" ? "" : selected().id);
    setTargetName(selected().name);
    setName(kind === "create" ? "" : selected().name);
    setError("");
    setDialog(kind);
  }

  async function run(action: WorkBoardAction) {
    if (!props.onAction || disabled()) return;
    setBusy(true);
    setError("");
    try {
      const id = await props.onAction(action);
      if (id !== null) {
        props.onSelect(id);
        setDialog(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the board.");
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const kind = dialog();
    if (!kind || (kind !== "delete" && nameError())) return;
    if (kind === "create") void run({ kind, name: name().trim() });
    else if (targetId()) void run(kind === "delete"
      ? { kind, id: targetId() }
      : { kind, id: targetId(), name: name().trim() });
  }

  function move(direction: -1 | 1) {
    const boardIds = moveWorkBoard(props.boards, selected().id, direction);
    if (boardIds) void run({ kind: "reorder", id: selected().id, boardIds });
  }

  return (
    <>
      <Select
        class="w-44" size="sm" aria-label="Work board"
        options={workBoardOptions(props.boards)} value={selected().id}
        onChange={props.onSelect} disabled={disabled()}
      />
      <Show when={props.onAction && selected().id}>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Board actions" disabled={disabled()} class={buttonClassName("ghost", "icon")}>
            <MoreHorizontal size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem value="rename" onSelect={() => open("rename")}><Pencil size={14} />Rename board</DropdownMenuItem>
            <DropdownMenuItem value="earlier" disabled={!moveWorkBoard(props.boards, selected().id, -1)} onSelect={() => move(-1)}><ArrowUp size={14} />Move earlier</DropdownMenuItem>
            <DropdownMenuItem value="later" disabled={!moveWorkBoard(props.boards, selected().id, 1)} onSelect={() => move(1)}><ArrowDown size={14} />Move later</DropdownMenuItem>
            <DropdownMenuItem value="delete" danger onSelect={() => open("delete")}><Delete size={14} />Delete board</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>
      <Show when={props.onAction}>
        <Button size="sm" variant="ghost" disabled={disabled()} onClick={() => open("create")}><Plus size={14} />New board</Button>
      </Show>
      <Show when={error() && !dialog()}><span role="alert" class="text-[12px] text-[var(--color-danger)]">{error()}</span></Show>
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
          <p>Delete “{targetName()}”? Work cards stay in the project.</p>
        </Show>
        <Show when={error() || (name().trim() && dialog() !== "delete" && nameError())}>
          <p role="alert" class="text-[12px] text-[var(--color-danger)]">{error() || nameError()}</p>
        </Show>
      </A11yDialog>
    </>
  );
}
