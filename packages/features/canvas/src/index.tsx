import { For, Show, createResource, createSignal } from "solid-js";
import {
  A11yDialog, Button, Card, Field, FormStack, IconTile, Input, PageToolbar,
  Pencil, Plus, Select, StatusChip, SwitchRow, Delete,
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
    <PageToolbar.Root><PageToolbar.Actions>
      <Button size="sm" disabled={busy() || !data()?.types.length} onClick={() => showDialog("create")}><Plus size={14} />Create canvas</Button>
    </PageToolbar.Actions></PageToolbar.Root>
    <Show when={data.loading}><p role="status" class="p-4 text-sm text-[var(--color-text-muted)]">Loading canvases and available types…</p></Show>
    <Show when={data()?.loadError}><div role="alert" class="p-4 text-sm text-[var(--color-danger)]">{data()?.loadError} <Button variant="ghost" size="sm" onClick={() => void refetch()}>Retry</Button></div></Show>
    <Show when={error() && !dialog()}><p role="alert" class="p-4 text-sm text-[var(--color-danger)]">{error()}</p></Show>
    <Show when={data()?.loadError === "" && data()}>{(loaded) => <div class="pw-scroll-fade min-h-0 overflow-auto p-4">
      <p class="mb-4 text-xs text-[var(--color-text-muted)]">{AGENT_HINT}</p>
      <Show when={loaded().types.length} fallback={<p class="text-sm text-[var(--color-text-muted)]">The core reported no canvas types. Creation is unavailable.</p>}>
        <Show when={loaded().canvases.length} fallback={<p class="text-sm text-[var(--color-text-muted)]">No canvases yet. Create a canvas to sketch ideas or connect shapes.</p>}>
          <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <For each={loaded().canvases}>{(canvas) => <Card class="flex flex-col gap-3">
              <div class="flex items-center gap-2"><IconTile size={24} tone="neutral"><Pencil size={14} /></IconTile>
                <Button variant="ghost" size="sm" disabled={busy()} class="min-w-0 truncate" onClick={() => void open(canvas.id)}>{canvas.name}</Button>
                <StatusChip tone="muted" label={loaded().types.find((type) => type.type === canvas.type)?.label ?? canvas.type} />
              </div>
              <Show when={canvas.graph.nodes.some((node) => referenceState(node.ref, props.entities ?? []).trust === "unverified")}><StatusChip tone="warn" label="Unverified content" /></Show>
              <SwitchRow label="Agent-visible" checked={canvas.agentVisible} disabled={busy()} onCheckedChange={(value) => void run(async () => { await props.port.update(props.projectId, canvas.id, { agentVisible: value }); await refetch(); })} />
              <div class="flex gap-2"><Button size="sm" variant="ghost" disabled={busy()} onClick={() => showDialog("rename", canvas)}><Pencil size={14} />Rename</Button>
                <Button size="sm" variant="ghost" disabled={busy()} onClick={() => showDialog("delete", canvas)}><Delete size={14} />Delete</Button></div>
            </Card>}</For>
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
