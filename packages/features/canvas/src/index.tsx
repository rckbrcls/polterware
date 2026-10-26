import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js";
import {
  A11yDialog, Button, Card, Delete, DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger, Eye, Field, FormStack,
  Input, MoreHorizontal, Network, PageEmpty, PageError, PageLoading,
  PageToolbar, Pencil, PinOff, Plus, Route, SchemeIcon, SearchBar, Select,
  StickyNote, TemplateCardGrid, Workflow, buttonClassName,
  ToolbarIconButton,
} from "@polterware/frontend-design-system";
import { CanvasEditor } from "./editor";
import { CanvasMinimap } from "./minimap";
import { toDocument, type CanvasPort, type CanvasRecord, type CanvasType } from "./model";
import type { ArchitectureDocument } from "@polterware/frontend-canvas";
export type { CanvasPort, CanvasRecord, CanvasPatch, CanvasType } from "./model";
export { readCanvas, readTypes } from "./model";
export type { StoreEntity } from "./references";
import type { StoreEntity } from "./references";

/** `openCanvasId` reopens the canvas the user last had open; `onOpenCanvasChange` reports opening and closing. */
export type CanvasNavigation = { openCanvasId?: string; onOpenCanvasChange?: (canvasId: string | undefined) => void };

export function CanvasView(props: { projectId: string; port: CanvasPort; entities?: readonly StoreEntity[] } & CanvasNavigation) {
  return <Show when={props.projectId} keyed>{(projectId) => <CanvasProject projectId={projectId} port={props.port} entities={props.entities} openCanvasId={props.openCanvasId} onOpenCanvasChange={props.onOpenCanvasChange} />}</Show>;
}

function CanvasTypeIcon(props: { type: string }) {
  return <Show when={props.type === "architecture"} fallback={<Show when={props.type === "roadmap"} fallback={<Show when={props.type === "flow"} fallback={<Show when={props.type === "brainstorm"} fallback={<SchemeIcon size={14} />}><StickyNote size={14} /></Show>}><Workflow size={14} /></Show>}><Route size={14} /></Show>}><Network size={14} /></Show>;
}

const CANVAS_TYPE_HINTS: Record<string, string> = {
  architecture: "Systems and how they connect.",
  roadmap: "What ships, and when.",
  flow: "Steps and decisions in order.",
  brainstorm: "Loose notes and ideas.",
  ideas: "Ideas to promote later.",
  free: "No rules, any shape.",
};

function CanvasProject(props: { projectId: string; port: CanvasPort; entities?: readonly StoreEntity[] } & CanvasNavigation) {
  const [data, { refetch }] = createResource(async () => {
    try {
      const [canvases, types] = await Promise.all([props.port.list(props.projectId), props.port.types()]);
      return { canvases, types, loadError: "" };
    } catch (error) {
      return { canvases: [], types: [], loadError: error instanceof Error ? error.message : String(error) };
    }
  });
  const [selected, setSelectedCanvas] = createSignal<{ canvas: CanvasRecord; document: ArchitectureDocument; definition: CanvasType }>();
  const setSelected = (value: { canvas: CanvasRecord; document: ArchitectureDocument; definition: CanvasType } | undefined) => {
    setSelectedCanvas(value);
    props.onOpenCanvasChange?.(value?.canvas.id);
  };
  // Reopen the last open canvas once the list loads, when it still exists.
  let restored = false;
  createEffect(() => {
    const loaded = data();
    if (restored || !loaded) return;
    restored = true;
    const id = props.openCanvasId;
    if (id && loaded.canvases.some((canvas) => canvas.id === id)) void open(id);
  });
  const [dialog, setDialog] = createSignal<"create" | "rename" | "delete">();
  const [target, setTarget] = createSignal<CanvasRecord>();
  const [name, setName] = createSignal("");
  const [type, setType] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [query, setQuery] = createSignal("");
  const visibleCanvases = createMemo(() => {
    const needle = query().trim().toLowerCase();
    if (!needle) return data()?.canvases ?? [];
    return (data()?.canvases ?? []).filter((canvas) => {
      const label = data()?.types.find((type) => type.type === canvas.type)?.label ?? canvas.type;
      return `${canvas.name} ${label}`.toLowerCase().includes(needle);
    });
  });
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  async function open(id: string) {
    await run(async () => {
      const canvas = await props.port.get(props.projectId, id);
      const definition = data()?.types.find((type) => type.type === canvas.type);
      if (!definition) throw new Error("The server did not report this canvas type. Reload types before editing.");
      setSelected({ canvas, document: toDocument(canvas), definition });
    });
  }
  function showDialog(kind: "create" | "rename" | "delete", canvas?: CanvasRecord, presetType?: string) {
    setTarget(canvas); setName(canvas?.name ?? ""); setType(presetType ?? data()?.types[0]?.type ?? ""); setError(""); setDialog(kind);
  }
  function submit() {
    void run(async () => {
      if (dialog() === "create") {
        const value = type();
        if (!data()?.types.some((type) => type.type === value)) throw new Error("Choose a type reported by the server.");
        const canvas = await props.port.create(props.projectId, name().trim(), value);
        setSelected({ canvas, document: toDocument(canvas), definition: data()!.types.find((type) => type.type === value)! });
      } else if (dialog() === "rename" && target()) {
        await props.port.update(props.projectId, target()!.id, { name: name().trim() });
      } else if (dialog() === "delete" && target()) {
        await props.port.remove(props.projectId, target()!.id);
      }
      setDialog(undefined); await refetch();
    });
  }
  return <Show when={selected()} keyed fallback={<div class="flex h-full min-h-0 flex-col">
    <PageToolbar.Root>
      <PageToolbar.Leading>{null}</PageToolbar.Leading>
      <PageToolbar.Actions>
        <SearchBar placeholder="Search canvases" value={query()} onInput={setQuery} aria-label="Search canvases" />
        <ToolbarIconButton label="New canvas" disabled={busy() || !data()?.types.length} onClick={() => showDialog("create")}><Plus size={14} /></ToolbarIconButton></PageToolbar.Actions>
    </PageToolbar.Root>
    <Show when={data.loading}><PageLoading layout="table" label="Loading canvases and available types…" /></Show>
    <Show when={data()?.loadError}><PageError message={data()!.loadError} onRetry={() => void refetch()} /></Show>
    <Show when={error() && !dialog()}><PageError message={error()} onRetry={() => { setError(""); void refetch(); }} /></Show>
    <Show when={data()?.loadError === "" && data()}>{(loaded) => <div class="min-h-0 flex-1 overflow-auto">
      <Show when={loaded().types.length} fallback={<PageEmpty title="No canvas types" mood="sad" />}>
        <Show when={visibleCanvases().length} fallback={<PageEmpty title={query() ? "No matches" : "No canvases yet"} mood={query() ? "lost" : "sleeping"}>{!query() ? <TemplateCardGrid items={data()!.types.slice(0, 3).map((definition) => ({ id: definition.type, title: definition.label, description: CANVAS_TYPE_HINTS[definition.type] ?? (definition.unrestricted ? "No rules, any shape." : "A typed canvas."), icon: <CanvasTypeIcon type={definition.type} />, onSelect: () => showDialog("create", undefined, definition.type) }))} /> : undefined}</PageEmpty>}>
          <div role="list" aria-label="Canvases" class="grid auto-rows-fr gap-3 p-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]">
            <For each={visibleCanvases()}>{(canvas) => {
              const definition = () => loaded().types.find((type) => type.type === canvas.type);
              return <div role="listitem" tabIndex={0} aria-label={`Open canvas ${canvas.name}`} class="cursor-pointer rounded-[var(--radius-lg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                onClick={() => void open(canvas.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void open(canvas.id); } }}>
                <Card variant="texture" class="flex h-full flex-col overflow-hidden !p-0">
                  <div class="h-36 overflow-hidden"><CanvasMinimap canvas={canvas} definition={definition()} entities={props.entities} /></div>
                  <div class="flex items-center gap-2 p-3">
                    <div class="min-w-0 flex-1 truncate text-[13px] font-medium">{canvas.name}</div>
                    <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                      <DropdownMenu positioning={{ placement: "bottom-end" }}><DropdownMenuTrigger aria-label={`Actions for ${canvas.name}`} disabled={busy()} class={buttonClassName("ghost", "icon")}><MoreHorizontal size={14} /></DropdownMenuTrigger>
                        <DropdownMenuContent class="min-w-40">
                          <DropdownMenuItem value="open" onSelect={() => void open(canvas.id)}><SchemeIcon size={14} />Open</DropdownMenuItem>
                          <DropdownMenuItem value="rename" onSelect={() => showDialog("rename", canvas)}><Pencil size={14} />Rename</DropdownMenuItem>
                          <DropdownMenuItem value="agent-visible" onSelect={() => void run(async () => { await props.port.update(props.projectId, canvas.id, { agentVisible: !canvas.agentVisible }); await refetch(); })}>{canvas.agentVisible ? <PinOff size={14} /> : <Eye size={14} />}{canvas.agentVisible ? "Hide from agents" : "Make agent-visible"}</DropdownMenuItem>
                          <DropdownMenuItem value="delete" danger onSelect={() => showDialog("delete", canvas)}><Delete size={14} />Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </Card>
              </div>;
            }}</For>
          </div>
        </Show>
      </Show>
    </div>}</Show>
    <A11yDialog open={!!dialog()} title={dialog() === "create" ? "Create canvas" : dialog() === "rename" ? "Rename canvas" : "Delete canvas"} onClose={() => { if (!busy()) setDialog(undefined); }} dismissible={!busy()}
      footer={<><Button variant="ghost" disabled={busy()} onClick={() => setDialog(undefined)}>Cancel</Button><Button variant={dialog() === "delete" ? "danger" : "primary"} disabled={busy() || (dialog() !== "delete" && !name().trim()) || (dialog() === "create" && !type())} onClick={submit}>{busy() ? "Saving…" : dialog() === "delete" ? "Delete" : "Save"}</Button></>}>
      <Show when={dialog() === "delete"} fallback={<FormStack>
        <Field label="Name"><Input value={name()} onInput={(event) => setName(event.currentTarget.value)} /></Field>
        <Show when={dialog() === "create"}><Field label="Type"><Select value={type()} onChange={setType} options={(data()?.types ?? []).map((type) => ({ value: type.type, label: type.label }))} /></Field></Show>
      </FormStack>}><p class="text-sm text-[var(--color-text-primary)]">Delete “{target()?.name}” and its shapes? This cannot be undone.</p></Show>
      <Show when={error()}><p role="alert" class="mt-3 text-sm text-[var(--color-danger)]">{error()}</p></Show>
    </A11yDialog>
  </div>}>{(value) => <CanvasEditor canvas={value.canvas} document={value.document} definition={value.definition} port={props.port} entities={props.entities} onBack={() => { setSelected(undefined); void refetch(); }} />}</Show>;
}
