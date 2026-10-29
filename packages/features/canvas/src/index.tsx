import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import {
  A11yDialog, Button, Card, Delete, DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger, Eye, Field, FormStack, IconTile,
  Input, MoreHorizontal, PageEmpty, PageError, PageLoading,
  PageToolbar, Pencil, PinOff, Plus, SchemeIcon, SearchBar, buttonClassName,
  ToolbarIconButton, Blocks,
} from "@polterware/frontend-design-system";
import { CanvasEditor } from "./editor";
import { CanvasMinimap } from "./minimap";
import { ShapeGallery } from "./shape-gallery";
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
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [query, setQuery] = createSignal("");
  const [gallery, setGallery] = createSignal(false);
  const visibleCanvases = createMemo(() => {
    const needle = query().trim().toLowerCase();
    if (!needle) return data()?.canvases ?? [];
    return (data()?.canvases ?? []).filter((canvas) => canvas.name.toLowerCase().includes(needle));
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
  function showDialog(kind: "create" | "rename" | "delete", canvas?: CanvasRecord) {
    setTarget(canvas); setName(canvas?.name ?? ""); setError(""); setDialog(kind);
  }
  function submit() {
    void run(async () => {
      if (dialog() === "create") {
        // The core reports one generalist canvas type.
        const definition = data()?.types[0];
        if (!definition) throw new Error("The server reported no canvas type.");
        const canvas = await props.port.create(props.projectId, name().trim(), definition.type);
        setSelected({ canvas, document: toDocument(canvas), definition });
      } else if (dialog() === "rename" && target()) {
        await props.port.update(props.projectId, target()!.id, { name: name().trim() });
      } else if (dialog() === "delete" && target()) {
        await props.port.remove(props.projectId, target()!.id);
      }
      setDialog(undefined); await refetch();
    });
  }
  return <Show when={selected()} keyed fallback={<Show when={!gallery()} fallback={<ShapeGallery types={data()?.types ?? []} onBack={() => setGallery(false)} />}><div class="flex h-full min-h-0 flex-col">
    <PageToolbar.Root>
      <PageToolbar.Leading>{null}</PageToolbar.Leading>
      <PageToolbar.Actions>
        <SearchBar placeholder="Search canvases" value={query()} onInput={setQuery} aria-label="Search canvases" />
        <ToolbarIconButton label="Shape gallery" onClick={() => setGallery(true)}><Blocks size={14} /></ToolbarIconButton>
        <ToolbarIconButton label="New canvas" disabled={busy() || !data()?.types.length} onClick={() => showDialog("create")}><Plus size={14} /></ToolbarIconButton></PageToolbar.Actions>
    </PageToolbar.Root>
    <Show when={data.loading}><PageLoading layout="table" label="Loading canvases…" /></Show>
    <Show when={data()?.loadError}><PageError message={data()!.loadError} onRetry={() => void refetch()} /></Show>
    <Show when={error() && !dialog()}><PageError message={error()} onRetry={() => { setError(""); void refetch(); }} /></Show>
    <Show when={data()?.loadError === "" && data()}>{(loaded) => <div class="min-h-0 flex-1 overflow-auto pw-scroll-fade">
      <Show when={loaded().types.length} fallback={<PageEmpty title="Canvas is unavailable" mood="sad" />}>
        <Show when={visibleCanvases().length} fallback={<PageEmpty title={query() ? "No matches" : "No canvases yet"} mood={query() ? "lost" : "sleeping"} action={!query() ? <Button variant="secondary" onClick={() => showDialog("create")}><Plus size={14} />New canvas</Button> : undefined} />}>
          <ul role="list" aria-label="Canvases" class="pw-canvas-grid">
            <For each={visibleCanvases()}>{(canvas) => <li>
              <CanvasCard canvas={canvas} definition={loaded().types.find((type) => type.type === canvas.type)} entities={props.entities} busy={busy()}
                onOpen={() => void open(canvas.id)} onRename={() => showDialog("rename", canvas)} onDelete={() => showDialog("delete", canvas)}
                onToggleAgents={() => void run(async () => { await props.port.update(props.projectId, canvas.id, { agentVisible: !canvas.agentVisible }); await refetch(); })} />
            </li>}</For>
          </ul>
        </Show>
      </Show>
    </div>}</Show>
    <A11yDialog open={!!dialog()} title={dialog() === "create" ? "Create canvas" : dialog() === "rename" ? "Rename canvas" : "Delete canvas"} onClose={() => { if (!busy()) setDialog(undefined); }} dismissible={!busy()}
      footer={<><Button variant="ghost" disabled={busy()} onClick={() => setDialog(undefined)}>Cancel</Button><Button variant={dialog() === "delete" ? "danger" : "primary"} disabled={busy() || (dialog() !== "delete" && !name().trim())} onClick={submit}>{busy() ? "Saving…" : dialog() === "delete" ? "Delete" : "Save"}</Button></>}>
      <Show when={dialog() === "delete"} fallback={<FormStack>
        <Field label="Name"><Input value={name()} onInput={(event) => setName(event.currentTarget.value)} /></Field>
      </FormStack>}><p class="text-sm text-[var(--color-text-primary)]">Delete “{target()?.name}” and its shapes? This cannot be undone.</p></Show>
      <Show when={error()}><p role="alert" class="mt-3 text-sm text-[var(--color-danger)]">{error()}</p></Show>
    </A11yDialog>
  </div></Show>}>{(value) => <CanvasEditor canvas={value.canvas} document={value.document} definition={value.definition} port={props.port} entities={props.entities} onBack={() => { setSelected(undefined); void refetch(); }} />}</Show>;
}

/** One canvas in the grid: the minimap fills the card and the title row floats over it. */
function CanvasCard(props: {
  canvas: CanvasRecord; definition?: CanvasType; entities?: readonly StoreEntity[]; busy: boolean;
  onOpen: () => void; onRename: () => void; onDelete: () => void; onToggleAgents: () => void;
}) {
  // The miniature keeps its content above the floating title row.
  const [reserve, setReserve] = createSignal(96);
  let card!: HTMLDivElement;
  let head!: HTMLDivElement;
  onMount(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setReserve(card.clientHeight - head.offsetTop + 8));
    observer.observe(card);
    onCleanup(() => observer.disconnect());
  });
  return <Card variant="texture" class="pw-canvas-card" ref={(element) => {
    card = element;
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", `Open canvas ${props.canvas.name}`);
    // The menu trigger lives inside the card; stopping propagation would also starve Ark's delegated handlers.
    const inMenu = (event: Event) => event.target instanceof Element && event.target.closest(".pw-canvas-card-menu") !== null;
    element.onclick = (event) => { if (!inMenu(event)) props.onOpen(); };
    element.onkeydown = (event) => {
      if (inMenu(event)) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault(); props.onOpen();
    };
  }}>
    <div class="pw-canvas-card-preview" aria-hidden="true">
      <CanvasMinimap canvas={props.canvas} definition={props.definition} entities={props.entities} reserveBottom={reserve()} />
    </div>
    <div ref={head} class="pw-canvas-card-head">
      <IconTile size={24} seed={props.canvas.id} class="shrink-0"><SchemeIcon size={14} /></IconTile>
      <h2 class="truncate text-[14px] font-medium text-[var(--color-text-primary)]">{props.canvas.name}</h2>
      <Show when={props.canvas.agentVisible}><span class="pw-canvas-card-flag" role="img" aria-label="Agent-visible" title="Agent-visible"><Eye size={14} aria-hidden="true" /></span></Show>
      <span class="pw-canvas-card-menu">
        <DropdownMenu positioning={{ placement: "bottom-end" }}>
          <DropdownMenuTrigger aria-label={`Actions for ${props.canvas.name}`} disabled={props.busy} class={buttonClassName("texture", "icon")}><MoreHorizontal size={14} aria-hidden="true" /></DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-40">
            <DropdownMenuItem value="open" onSelect={props.onOpen}><SchemeIcon size={14} aria-hidden="true" />Open</DropdownMenuItem>
            <DropdownMenuItem value="rename" onSelect={props.onRename}><Pencil size={14} aria-hidden="true" />Rename</DropdownMenuItem>
            <DropdownMenuItem value="agent-visible" onSelect={props.onToggleAgents}>{props.canvas.agentVisible ? <PinOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{props.canvas.agentVisible ? "Hide from agents" : "Make agent-visible"}</DropdownMenuItem>
            <DropdownMenuItem value="delete" danger onSelect={props.onDelete}><Delete size={14} aria-hidden="true" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  </Card>;
}
