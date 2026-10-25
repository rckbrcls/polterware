import { Show, createMemo, createResource, createSignal } from "solid-js";
import {
  A11yDialog, Button, DataTable, Delete, DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger, Eye, Field, FormStack, IconTile,
  Input, MoreHorizontal, Network, PageEmpty, PageError, PageLoading,
  PageToolbar, Pencil, PinOff, Plus, Route, SchemeIcon, SearchBar, Select,
  StatusChip, StickyNote, Workflow, buttonClassName,
} from "@polterware/frontend-design-system";
import { CanvasEditor, AGENT_HINT } from "./editor";
import { toDocument, type CanvasPort, type CanvasRecord, type CanvasType } from "./model";
import type { ArchitectureDocument } from "@polterware/frontend-canvas";
export type { CanvasPort, CanvasRecord, CanvasPatch, CanvasType } from "./model";
export { readCanvas, readTypes } from "./model";
export type { StoreEntity } from "./references";
import { referenceState, type StoreEntity } from "./references";

export function CanvasView(props: { projectId: string; port: CanvasPort; entities?: readonly StoreEntity[] }) {
  return <Show when={props.projectId} keyed>{(projectId) => <CanvasProject projectId={projectId} port={props.port} entities={props.entities} />}</Show>;
}

function CanvasTypeIcon(props: { type: string }) {
  return <Show when={props.type === "architecture"} fallback={<Show when={props.type === "roadmap"} fallback={<Show when={props.type === "flow"} fallback={<Show when={props.type === "brainstorm"} fallback={<SchemeIcon size={14} />}><StickyNote size={14} /></Show>}><Workflow size={14} /></Show>}><Route size={14} /></Show>}><Network size={14} /></Show>;
}

function CanvasProject(props: { projectId: string; port: CanvasPort; entities?: readonly StoreEntity[] }) {
  const [data, { refetch }] = createResource(async () => {
    try {
      const [canvases, types] = await Promise.all([props.port.list(props.projectId), props.port.types()]);
      return { canvases, types, loadError: "" };
    } catch (error) {
      return { canvases: [], types: [], loadError: error instanceof Error ? error.message : String(error) };
    }
  });
  const [selected, setSelected] = createSignal<{ canvas: CanvasRecord; document: ArchitectureDocument; definition: CanvasType }>();
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
  function showDialog(kind: "create" | "rename" | "delete", canvas?: CanvasRecord) {
    setTarget(canvas); setName(canvas?.name ?? ""); setType(data()?.types[0]?.type ?? ""); setError(""); setDialog(kind);
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
      <PageToolbar.Leading><SearchBar placeholder="Search canvases" value={query()} onInput={setQuery} aria-label="Search canvases" /></PageToolbar.Leading>
      <PageToolbar.Actions><Button size="sm" variant="primary" disabled={busy() || !data()?.types.length} onClick={() => showDialog("create")}><Plus size={14} />New canvas</Button></PageToolbar.Actions>
    </PageToolbar.Root>
    <p class="px-4 py-2 text-xs text-[var(--color-text-muted)]">{AGENT_HINT}</p>
    <Show when={data.loading}><PageLoading layout="table" label="Loading canvases and available types…" /></Show>
    <Show when={data()?.loadError}><PageError message={data()!.loadError} onRetry={() => void refetch()} /></Show>
    <Show when={error() && !dialog()}><PageError message={error()} onRetry={() => { setError(""); void refetch(); }} /></Show>
    <Show when={data()?.loadError === "" && data()}>{(loaded) => <div class="min-h-0 flex-1 overflow-auto">
      <Show when={loaded().types.length} fallback={<PageEmpty title="Canvas types are unavailable" description="The core reported no canvas types, so creation is unavailable." />}>
        <Show when={visibleCanvases().length} fallback={<PageEmpty title={query() ? "No canvases match this search" : "No canvases yet"} description={query() ? "Try a different canvas name or type." : "Create a canvas to sketch ideas or connect shapes."} action={!query() ? <Button size="sm" onClick={() => showDialog("create")}><Plus size={14} />New canvas</Button> : undefined} />}>
          <DataTable.Root rows={visibleCanvases()} getRowId={(canvas) => canvas.id} columnWidthsKey="canvases">
            <DataTable.Table aria-label="Canvases">
              <DataTable.Header>
                <DataTable.ColumnHeader<CanvasRecord> id="name" minWidth={240}>Name</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<CanvasRecord> id="type" width="9rem">Type</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<CanvasRecord> id="agentVisible" width="9rem">Agent-visible</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<CanvasRecord> id="unverified" width="10rem" sortable={false}>Unverified</DataTable.ColumnHeader>
                <Show when={loaded().canvases.some((canvas) => canvas.updatedAt)}><DataTable.ColumnHeader<CanvasRecord> id="updatedAt" width="10rem">Updated</DataTable.ColumnHeader></Show>
                <DataTable.ColumnHeader<CanvasRecord> id="actions" width="44px" align="right" sortable={false} resizable={false}><span class="sr-only">Actions</span></DataTable.ColumnHeader>
              </DataTable.Header>
              <DataTable.Body<CanvasRecord>>{(canvas) => {
                const definition = () => loaded().types.find((type) => type.type === canvas.type);
                const unverified = () => canvas.graph.nodes.some((node) => referenceState(node.ref, props.entities ?? []).trust === "unverified");
                return <DataTable.Row row={canvas} rowId={canvas.id} onActivate={() => void open(canvas.id)} aria-label={`Open canvas ${canvas.name}`}>
                  <DataTable.Cell leading={<IconTile size={24} tone="neutral" seed={canvas.id}><CanvasTypeIcon type={canvas.type} /></IconTile>}><span class="font-medium">{canvas.name}</span></DataTable.Cell>
                  <DataTable.Cell>{definition()?.label ?? canvas.type}</DataTable.Cell>
                  <DataTable.Cell><StatusChip tone="muted" label={canvas.agentVisible ? "Visible" : "Private"} /></DataTable.Cell>
                  <DataTable.Cell><Show when={unverified()}><StatusChip tone="warn" label="Unverified" /></Show></DataTable.Cell>
                  <Show when={loaded().canvases.some((item) => item.updatedAt)}><DataTable.Cell class="text-[var(--color-text-muted)]">{canvas.updatedAt || "—"}</DataTable.Cell></Show>
                  <DataTable.Cell align="right" onClick={(event: MouseEvent) => event.stopPropagation()}>
                    <DropdownMenu positioning={{ placement: "bottom-end" }}><DropdownMenuTrigger aria-label={`Actions for ${canvas.name}`} disabled={busy()} class={buttonClassName("ghost", "icon")}><MoreHorizontal size={14} /></DropdownMenuTrigger>
                      <DropdownMenuContent class="min-w-40">
                        <DropdownMenuItem value="open" onSelect={() => void open(canvas.id)}><SchemeIcon size={14} />Open</DropdownMenuItem>
                        <DropdownMenuItem value="rename" onSelect={() => showDialog("rename", canvas)}><Pencil size={14} />Rename</DropdownMenuItem>
                        <DropdownMenuItem value="agent-visible" onSelect={() => void run(async () => { await props.port.update(props.projectId, canvas.id, { agentVisible: !canvas.agentVisible }); await refetch(); })}>{canvas.agentVisible ? <PinOff size={14} /> : <Eye size={14} />}{canvas.agentVisible ? "Hide from agents" : "Make agent-visible"}</DropdownMenuItem>
                        <DropdownMenuItem value="delete" danger onSelect={() => showDialog("delete", canvas)}><Delete size={14} />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </DataTable.Cell>
                </DataTable.Row>;
              }}</DataTable.Body>
            </DataTable.Table>
          </DataTable.Root>
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
