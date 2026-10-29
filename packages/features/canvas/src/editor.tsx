import { For, Index, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  canRedo, canUndo, commit, createHistory, documentBounds, emptySelection, fitBounds,
  historyRedo, historyUndo, hitTest, layoutSync, moveNodes, panBy, resolveRelationshipRoute,
  pointsToSvgPath, screenToDocument, selectClick, setNodePositions, updateNode, zoomAt,
  type ArchNode, type ArchitectureDocument, type Point,
} from "@polterware/frontend-canvas";
import {
  Button, Card, ConnectIcon, Eye, Hand, Input, LayoutDashboard, MousePointer2, PageToolbar, ResizableSidebar, Separator,
  StatusChip, Tooltip, Plus, Delete, Undo2, Redo2, Maximize2, MinusSignIcon, ChevronLeft, HelpCircle, pushToast,
} from "@polterware/frontend-design-system";
import { createAutosave, type SaveState } from "./autosave";
import { connectNodes, insertNode, removeSelection, resizeFrom, resizeHandles, serializeCanvas,
  type CanvasPort, type CanvasRecord, type CanvasType, type ResizeHandle } from "./model";
import { CanvasInspector } from "./canvas-inspector";
import { EntityIcon } from "./inspector";
import { linkedFacts, readRef, referenceState, setReference, structureEntities, type StoreEntity } from "./references";
import { ENTITY_MIME, SHAPE_MIME, ShapeLibrary } from "./shape-library";
import { component, structureKind } from "./components";
import { kindLabel, paletteGroups, paletteLabel, shape } from "./shapes";
import { readStyle, textClass, type ShapeStyle } from "./style";
import { backdrop, canvasBehavior } from "./types";
import { propertyText, withProperties } from "./types/shared";
import { CanvasNode } from "./node-renderer";
import { StructurePicker } from "./structure-picker";
import "./canvas.css";

const tools = [
  { value: "select", label: "Select", icon: () => <MousePointer2 size={14} /> },
  { value: "pan", label: "Pan", icon: () => <Hand size={14} /> },
  { value: "connect", label: "Connect", icon: () => <ConnectIcon size={14} /> },
];
const handleCursor: Record<ResizeHandle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };

export function CanvasEditor(props: {
  canvas: CanvasRecord; definition: CanvasType; document: ArchitectureDocument; port: CanvasPort;
  onBack: () => void; entities?: readonly StoreEntity[];
}) {
  const canvas = props.canvas;
  const behavior = canvasBehavior(props.definition);
  const groups = paletteGroups(behavior.palette());
  const [doc, setDoc] = createSignal(props.document);
  const [structurePick, setStructurePick] = createSignal<{ kind: string; at?: Point }>();
  const [selection, setSelection] = createSignal(emptySelection());
  const [history, setHistory] = createSignal(createHistory());
  const [tool, setTool] = createSignal("select");
  // Connections are drawn from shapes with the Connect tool; their kind is changed afterwards in the inspector.
  const edgeKind = () => behavior.edges()[0] ?? "";
  const [connectFrom, setConnectFrom] = createSignal<string>();
  const [editing, setEditing] = createSignal<string>();
  const [name, setName] = createSignal(canvas.name);
  const [agentVisible, setAgentVisible] = createSignal(canvas.agentVisible);
  const [state, setState] = createSignal<SaveState>("saved");
  const [error, setError] = createSignal("");
  const [leaving, setLeaving] = createSignal(false);
  let host!: HTMLDivElement;
  let disposed = false;
  let gesture: { pointerId: number; mode: "pan" | "move" | "resize"; start: Point; before: ArchitectureDocument; ids: string[]; handle?: ResizeHandle } | undefined;
  const selectedNodes = createMemo(() => doc().nodes.filter((node) => selection().nodeIds.includes(node.id)));
  const selected = createMemo(() => selectedNodes().length === 1 ? selectedNodes()[0] : undefined);
  const selectedEdge = createMemo(() => selection().nodeIds.length ? undefined : doc().relationships.find((edge) => edge.id === selection().relationshipIds[0]));
  const save = createAutosave(async (value: { document: ArchitectureDocument; name: string; agentVisible: boolean }) => {
    if (!value.name.trim()) throw new Error("Canvas name is required.");
    return props.port.update(canvas.projectId, canvas.id, { ...serializeCanvas(value.document, canvas.layoutJson),
      name: value.name.trim(), agentVisible: value.agentVisible });
  }, (status, message) => {
    if (disposed) {
      if (message) pushToast(`Could not save canvas “${name()}”: ${message}`, "danger");
      return;
    }
    setState(status); if (status === "saved") setError(""); if (message) setError(message);
  });
  function schedule() { save.schedule({ document: doc(), name: name(), agentVisible: agentVisible() }); }
  function change(next: ArchitectureDocument, mode: "immediately" | "eventually" = "immediately") {
    const result = commit(history(), doc(), next, mode);
    setHistory(result.history); setDoc(result.doc); schedule();
  }
  function finishLabel() { if (editing()) change(doc()); setEditing(undefined); }
  function undo(redo = false) {
    finishLabel();
    // Settle a pending typed edit first so undo reverts it instead of dropping it.
    if (history().pendingBefore) setHistory(commit(history(), doc(), doc(), "immediately").history);
    const result = redo ? historyRedo(history(), doc()) : historyUndo(history(), doc());
    setHistory(result.history); setDoc(result.doc); setSelection(emptySelection()); schedule();
  }
  function deleteSelected() {
    change(removeSelection(doc(), selection())); setSelection(emptySelection()); setConnectFrom(undefined);
  }
  function point(event: { clientX: number; clientY: number }): Point {
    const rect = host.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function start(event: PointerEvent) {
    if (event.button !== 0 && event.button !== 1) return;
    if (editing()) return;
    event.preventDefault(); host.focus();
    const start = point(event);
    const hit = hitTest({ ...doc(), nodes: doc().nodes.map((node) => backdrop(node.type) ? { ...node, zIndex: -1 } : node) }, screenToDocument(doc().viewport, start), { showPorts: false });
    if (tool() === "connect" && event.button === 0 && hit.kind === "node") {
      if (!connectFrom()) { setConnectFrom(hit.id); setSelection({ ...emptySelection(), nodeIds: [hit.id] }); }
      else {
        try { change(connectNodes(doc(), props.definition, connectFrom()!, hit.id, edgeKind(), crypto.randomUUID())); setError(""); }
        catch (error) { setError(String(error)); }
        setConnectFrom(undefined);
      }
      return;
    }
    let ids: string[] = [];
    let mode: "move" | "pan" = "pan";
    if (tool() !== "pan" && event.button !== 1) {
      if (hit.kind === "node") {
        const current = selection();
        const next = !event.shiftKey && current.nodeIds.includes(hit.id) ? current
          : selectClick(current, { kind: "node", id: hit.id }, event.shiftKey);
        setSelection(next); ids = next.nodeIds; mode = "move";
      } else if (hit.kind === "relationship") {
        setSelection({ ...emptySelection(), relationshipIds: [hit.id] }); return;
      } else { setSelection(emptySelection()); setConnectFrom(undefined); }
    }
    gesture = { pointerId: event.pointerId, mode, start, before: doc(), ids };
    host.setPointerCapture(event.pointerId);
  }
  function resize(event: PointerEvent, id: string, handle: ResizeHandle) {
    event.preventDefault(); event.stopPropagation(); host.focus();
    gesture = { pointerId: event.pointerId, mode: "resize", start: point(event), before: doc(), ids: [id], handle };
    host.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const p = point(event); const dx = p.x - gesture.start.x; const dy = p.y - gesture.start.y;
    const base = gesture.before; const zoom = base.viewport.zoom;
    if (gesture.mode === "pan") setDoc({ ...doc(), viewport: panBy(base.viewport, dx, dy) });
    else if (gesture.mode === "move") setDoc(moveNodes(base, new Map(gesture.ids.map((id) => [id, { dx: dx / zoom, dy: dy / zoom }]))));
    else {
      const node = base.nodes.find((node) => node.id === gesture!.ids[0]);
      if (node) setDoc(resizeFrom(base, node, gesture.handle ?? "se", dx / zoom, dy / zoom));
    }
  }
  function end(event: PointerEvent, cancel = false) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const before = gesture.before; const mode = gesture.mode; gesture = undefined;
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    if (cancel) { setDoc(before); return; }
    if (mode !== "pan") setHistory(commit(history(), before, doc(), "immediately").history);
    schedule();
  }
  function zoom(factor: number) {
    setDoc({ ...doc(), viewport: zoomAt(doc().viewport, { x: host.clientWidth / 2, y: host.clientHeight / 2 }, doc().viewport.zoom * factor) }); schedule();
  }
  function fit() {
    if (!doc().nodes.length) return;
    setDoc({ ...doc(), viewport: fitBounds(doc().viewport, documentBounds(doc()), host.clientWidth, host.clientHeight) }); schedule();
  }
  function arrange() {
    const layout = layoutSync({ nodes: doc().nodes, mode: "horizontal" });
    change(setNodePositions(doc(), new Map(layout.nodes.map((n) => [n.id, n]))));
    fit();
  }
  /** System, domain and component shapes need a Structure node; the picker supplies it before insertion. */
  function add(kind: string, at?: Point) {
    if (behavior.structureReferences && structureKind(kind)) { setStructurePick({ kind, at }); return; }
    insert(kind, at);
  }
  function insert(kind: string, at?: Point, entity?: StoreEntity) {
    if (!behavior.palette().includes(kind)) { setError("This shape is not allowed by the core."); return; }
    const center = at ?? screenToDocument(doc().viewport, { x: host.clientWidth / 2, y: host.clientHeight / 2 });
    const geometry = { width: 180, height: 100, ...behavior.initialGeometry?.(kind), ...shape(kind)?.geometry };
    const id = crypto.randomUUID();
    let next = insertNode(doc(), props.definition, kind, { x: Math.round(center.x - geometry.width / 2), y: Math.round(center.y - geometry.height / 2) }, id);
    next = { ...next, nodes: next.nodes.map((node) => node.id === id ? withProperties({ ...node, ...geometry,
      ...(entity ? { name: entity.title } : shape(kind) || component(kind) ? { name: paletteLabel(kind) } : {}),
    }, behavior.defaults(kind)) : node) };
    if (entity) next = setReference(next, id, { kind: "node", id: entity.id });
    change(next); setStructurePick(undefined); setError("");
    setSelection({ ...emptySelection(), nodeIds: [id] }); host.focus();
  }
  function drop(event: DragEvent) {
    const kind = event.dataTransfer?.getData(SHAPE_MIME);
    const entityId = event.dataTransfer?.getData(ENTITY_MIME);
    if (!kind && !entityId) return;
    event.preventDefault();
    const at = screenToDocument(doc().viewport, point(event));
    if (kind) { add(kind, at); return; }
    const entity = structureEntities(props.entities ?? []).find((item) => item.id === entityId);
    if (entity) insert(entity.level!, at, entity);
  }
  /** Only shapes that stand for something can be unverified; drawing shapes carry no claim. */
  function unverified(node: ArchNode) {
    const ref = readRef(node);
    if (!ref && !structureKind(node.type)) return false;
    return referenceState(ref, props.entities ?? []).trust === "unverified";
  }
  function renderNode(node: () => ArchNode) {
    const handles = () => selection().nodeIds.length === 1 && selection().nodeIds[0] === node().id;
    return <g onDblClick={() => { if (!readRef(node())) setEditing(node().id); }}>
      <CanvasNode node={node()} variant={behavior.variant(node().type)} selected={selection().nodeIds.includes(node().id)} linked={linkedFacts(node(), props.entities ?? [])}>
        {/* The semantic card already shows its sign in the icon tile. */}
        <Show when={!component(node().type) && !structureKind(node().type) && readRef(node())}>{(ref) => <EntityIcon kind={ref().kind} />}</Show>
        <Show when={unverified(node())}><StatusChip tone="warn" label={readRef(node()) ? "Missing · Unverified" : "Unverified"} /></Show>
        <NodeLabel name={readRef(node()) ? referenceState(readRef(node()), props.entities ?? []).title : node().name} style={readStyle(node())}
          editing={editing() === node().id && !readRef(node())} onInput={(name) => change(updateNode(doc(), node().id, { name }), "eventually")} onDone={finishLabel} />
      </CanvasNode>
      <Show when={handles()}><For each={resizeHandles}>{(handle) => {
        const size = () => 8 / doc().viewport.zoom;
        const x = () => node().x + (handle.includes("w") ? 0 : handle.includes("e") ? node().width : node().width / 2) - size() / 2;
        const y = () => node().y + (handle.includes("n") ? 0 : handle.includes("s") ? node().height : node().height / 2) - size() / 2;
        return <rect class="pw-canvas-handle" role="button" aria-label={`Resize ${handle}`} data-handle={handle} x={x()} y={y()} width={size()} height={size()}
          style={{ cursor: handleCursor[handle] }} onPointerDown={(event) => resize(event, node().id, handle)} />;
      }}</For></Show>
    </g>;
  }
  function keydown(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest("input,textarea,button,[contenteditable=true]")) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); undo(event.shiftKey); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); }
    else if (event.key === "Escape") { setTool("select"); setConnectFrom(undefined); setSelection(emptySelection()); }
    else if (event.key === "Enter" && selected() && !readRef(selected()!)) { event.preventDefault(); setEditing(selected()!.id); }
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selectedNodes().length) {
      event.preventDefault(); const step = event.shiftKey ? 40 : 10;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      change(moveNodes(doc(), new Map(selection().nodeIds.map((id) => [id, { dx, dy }]))));
    }
  }
  onMount(() => {
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const vp = doc().viewport;
      const viewport = event.ctrlKey || event.metaKey ? zoomAt(vp, point(event), vp.zoom * Math.exp(-event.deltaY * 0.004)) : panBy(vp, -event.deltaX, -event.deltaY);
      setDoc({ ...doc(), viewport }); schedule();
    };
    host.addEventListener("wheel", wheel, { passive: false });
    onCleanup(() => host.removeEventListener("wheel", wheel));
  });
  // Keep the captured project/canvas identity when navigation unmounts this editor.
  onCleanup(() => { disposed = true; void save.flush(); });
  async function back() {
    finishLabel(); setLeaving(true);
    if (await save.flush()) props.onBack();
    setLeaving(false);
  }
  const saveLabel = () => state() === "pending" ? "Unsaved" : state() === "saving" ? "Saving…" : state() === "error" ? "Not saved" : "Saved";
  return <div class="pw-canvas-editor-page">
    <Show when={error()}><div role="alert" class="pw-canvas-alert"><span>{error()}</span><Button size="sm" variant="ghost" onClick={() => void save.flush()}>Retry save</Button></div></Show>
    <div class="pw-canvas-workspace">
      <ResizableSidebar side="left" class="pw-canvas-panel" storageKey="polterware.canvas.library" defaultWidth={192} minWidth={168} maxWidth={256} ariaLabel="Shape library"
        sidebar={<ShapeLibrary groups={groups} onAdd={(kind) => add(kind)}
          entities={props.entities} onAddEntity={behavior.structureReferences ? (entity) => insert(entity.level!, undefined, entity) : undefined} />}>
        {/* The inspector opens only for a selected shape or connection. */}
        <ResizableSidebar side="right" class="pw-canvas-panel" storageKey="polterware.canvas.inspector" defaultWidth={272} minWidth={256} maxWidth={336} ariaLabel="Inspector"
          open={selectedNodes().length > 0 || !!selectedEdge()}
          sidebar={<CanvasInspector doc={doc()} nodes={selectedNodes()} edge={selectedEdge()} definition={props.definition} behavior={behavior}
            canvasName={name()}
            entities={props.entities ?? []} change={change}
            promote={props.port.promote ? (input) => props.port.promote!(canvas.projectId, input) : undefined} />}>
          <div class="pw-canvas-stage">
            {/* No bar behind the toolbar: it floats over the canvas like the tool dock. */}
          <PageToolbar.Root class="pw-canvas-topbar items-center">
            <PageToolbar.Leading class="pw-canvas-editor-leading">
              <Button variant="texture" size="icon" aria-label="Canvases" disabled={leaving()} onClick={() => void back()}><ChevronLeft size={14} /></Button>
              <Input aria-label="Canvas name" class="pw-canvas-name !rounded-full !px-3" value={name()} onInput={(e) => { setName(e.currentTarget.value); schedule(); }} />
              <span role="status" class="pw-canvas-save" data-state={state()}>{saveLabel()}</span>
            </PageToolbar.Leading>
          </PageToolbar.Root>
            <div ref={host} class="pw-canvas-editor pw-canvas-surface relative h-full min-h-0 overflow-hidden" tabIndex={0} role="group" aria-label="Canvas editor"
              style={{ "--canvas-grid-size": `${24 * doc().viewport.zoom}px`, "--canvas-grid-position": `${doc().viewport.x}px ${doc().viewport.y}px` }}
              onPointerDown={start} onPointerMove={move} onPointerUp={(event) => end(event)} onPointerCancel={(event) => end(event, true)} onKeyDown={keydown}
              onDragOver={(event) => { if (event.dataTransfer?.types.some((type) => type === SHAPE_MIME || type === ENTITY_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
              onDrop={drop}>
              <Show when={!doc().nodes.length}><p class="pw-canvas-empty">This canvas is empty. Click or drag a shape from the library.</p></Show>
              <svg class="h-full w-full" aria-label={name()}>
                <defs><marker id={`canvas-arrow-${canvas.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
                <g transform={`translate(${doc().viewport.x} ${doc().viewport.y}) scale(${doc().viewport.zoom})`}>
                  <Index each={doc().nodes.filter((node) => backdrop(node.type))}>{renderNode}</Index>
                  <For each={doc().relationships}>{(edge) => {
                    const source = () => doc().nodes.find((n) => n.id === edge.sourceNodeId);
                    const target = () => doc().nodes.find((n) => n.id === edge.targetNodeId);
                    const route = () => source() && target() ? resolveRelationshipRoute(source()!, target()!) : [];
                    return <g class="pw-canvas-edge pw-canvas-edge--interactive" data-selected={selection().relationshipIds.includes(edge.id) ? "" : undefined} onPointerDown={(event) => {
                      if (event.button !== 0 || tool() !== "select") return;
                      event.preventDefault(); event.stopPropagation(); host.focus();
                      setSelection({ ...emptySelection(), relationshipIds: [edge.id] });
                    }}><path d={pointsToSvgPath(route())} fill="none" stroke-width="2" stroke-dasharray={behavior.edgeStyle(edge.type).dashed ? "6 4" : undefined} marker-end={behavior.edgeStyle(edge.type).arrow ? `url(#canvas-arrow-${canvas.id})` : undefined} />
                      <Show when={route().length}><text x={route()[Math.floor(route().length / 2)]!.x} y={route()[Math.floor(route().length / 2)]!.y - 8}>{propertyText(edge, "label") || (edge.type === "relates" ? "" : kindLabel(edge.type))}</text></Show></g>;
                  }}</For>
                  <Index each={doc().nodes.filter((node) => !backdrop(node.type))}>{renderNode}</Index>
                </g>
              </svg>
            </div>
            <Show when={connectFrom()}><Card variant="texture" texture="compact" class="pw-canvas-dock pw-canvas-dock--hint"><p role="status" class="m-0">Pick the target shape for the {edgeKind() || "new"} connection.</p></Card></Show>
            <Card variant="texture" texture="compact" class="pw-canvas-dock pw-canvas-dock--tools">
              <div role="toolbar" aria-label="Canvas tool" class="pw-canvas-dock-group">
                <For each={tools}>{(item) => <Button size="icon" variant="ghost" aria-label={item.label} aria-pressed={tool() === item.value} onClick={() => { setTool(item.value); setConnectFrom(undefined); }}>{item.icon()}</Button>}</For>
              </div>
              {/* History, selection, zoom and canvas settings share the floating dock with the tools. */}
              <Separator orientation="vertical" class="pw-canvas-toolbar-separator" />
              <div role="toolbar" aria-label="Canvas actions" class="pw-canvas-dock-group">
                <Button size="icon" variant="ghost" aria-label="Undo" disabled={!canUndo(history())} onClick={() => undo()}><Undo2 size={14} /></Button>
                <Button size="icon" variant="ghost" aria-label="Redo" disabled={!canRedo(history())} onClick={() => undo(true)}><Redo2 size={14} /></Button>
                <Separator orientation="vertical" class="pw-canvas-toolbar-separator" />
                <Button size="icon" variant="ghost" aria-label="Delete selection" disabled={!selection().nodeIds.length && !selection().relationshipIds.length} onClick={deleteSelected}><Delete size={14} /></Button>
                <Button size="icon" variant="ghost" aria-label="Arrange" disabled={!doc().nodes.length} onClick={arrange}><LayoutDashboard size={14} /></Button>
                <Separator orientation="vertical" class="pw-canvas-toolbar-separator" />
                <Button size="icon" variant="ghost" aria-label="Zoom out" onClick={() => zoom(0.8)}><MinusSignIcon size={14} /></Button>
                <span class="pw-canvas-zoom-level" aria-live="polite">{Math.round(doc().viewport.zoom * 100)}%</span>
                <Button size="icon" variant="ghost" aria-label="Zoom in" onClick={() => zoom(1.25)}><Plus size={14} /></Button>
                <Button size="icon" variant="ghost" aria-label="Fit canvas" onClick={fit}><Maximize2 size={14} /></Button>
                <Separator orientation="vertical" class="pw-canvas-toolbar-separator" />
                <Button size="icon" variant="ghost" aria-label={agentVisible() ? "Agent-visible (on)" : "Agent-visible (off)"} aria-pressed={agentVisible()} onClick={() => { setAgentVisible(!agentVisible()); schedule(); }}><Eye size={14} /></Button>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild={(triggerProps) => <Button {...triggerProps({ "aria-label": "Canvas rules" })} size="icon" variant="ghost"><HelpCircle size={14} /></Button>} />
                  <Tooltip.Content>{props.definition.rules.join(" ")} Drag to move, scroll to pan, Ctrl/⌘+scroll to zoom.</Tooltip.Content>
                </Tooltip.Root>
              </div>
            </Card>
          </div>
        </ResizableSidebar>
      </ResizableSidebar>
    </div>
    <Show when={behavior.structureReferences}><StructurePicker open={!!structurePick()} entities={props.entities ?? []} onClose={() => setStructurePick(undefined)}
      onAdd={(entity) => insert(structurePick()?.kind ?? entity.level!, structurePick()?.at, entity)} /></Show>
  </div>;
}

function NodeLabel(props: { name: string; style: ShapeStyle; editing: boolean; onInput: (name: string) => void; onDone: () => void }) {
  return <Show when={props.editing} fallback={<span class={`w-full break-words ${textClass(props.style)}`}>{props.name}</span>}>
    <Input aria-label="Shape label" value={props.name} ref={(element) => queueMicrotask(() => { element.focus(); element.select(); })}
      onPointerDown={(event) => event.stopPropagation()} onInput={(event) => props.onInput(event.currentTarget.value)} onBlur={props.onDone}
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" || event.key === "Escape") props.onDone(); }} />
  </Show>;
}
