import { For, Index, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  canRedo, canUndo, commit, createHistory, documentBounds, emptySelection, fitBounds,
  historyRedo, historyUndo, hitTest, layoutSync, moveNodes, panBy, resolveRelationshipRoute,
  pointsToSvgPath, screenToDocument, selectClick, setNodePositions, updateNode, zoomAt,
  type ArchNode, type ArchitectureDocument, type Point,
} from "@polterware/frontend-canvas";
import {
  Button, ConnectIcon, DetailPanel, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, Eye, Field, Hand, Input, LayoutDashboard, MousePointer2, Network, PageToolbar,
  Card, SegmentedControl, StatusChip, Tooltip, Plus, Delete, Undo2, Redo2, buttonClassName,
  Maximize2, MinusSignIcon, ChevronLeft, HelpCircle, Route, pushToast,
} from "@polterware/frontend-design-system";
import { createAutosave, type SaveState } from "./autosave";
import { connectNodes, insertNode, removeSelection, resizeNode, serializeCanvas,
  type CanvasPort, type CanvasRecord, type CanvasType } from "./model";
import { EntityIcon, NodeInspector } from "./inspector";
import { readRef, referenceState, setReference, type StoreEntity } from "./references";
import { canvasBehavior } from "./types";
import { annotation, properties, propertyText, withProperties } from "./types/shared";
import { TypeInspector } from "./type-inspector";
import { CanvasNode } from "./node-renderer";
import { StructurePicker } from "./structure-picker";
import "./canvas.css";


function toolOptions() {
  return [
  { value: "select", label: <Tooltip.Root><Tooltip.Trigger asChild={(triggerProps) => <span {...triggerProps({ "aria-label": "Select" })} class="inline-flex"><MousePointer2 size={14} /><span class="sr-only">Select</span></span>} /><Tooltip.Content>Select</Tooltip.Content></Tooltip.Root> },
  { value: "pan", label: <Tooltip.Root><Tooltip.Trigger asChild={(triggerProps) => <span {...triggerProps({ "aria-label": "Pan" })} class="inline-flex"><Hand size={14} /><span class="sr-only">Pan</span></span>} /><Tooltip.Content>Pan</Tooltip.Content></Tooltip.Root> },
  { value: "connect", label: <Tooltip.Root><Tooltip.Trigger asChild={(triggerProps) => <span {...triggerProps({ "aria-label": "Connect" })} class="inline-flex"><ConnectIcon size={14} /><span class="sr-only">Connect</span></span>} /><Tooltip.Content>Connect</Tooltip.Content></Tooltip.Root> },
  ] as unknown as Array<{ value: string; label: string }>;
}

export function CanvasEditor(props: {
  canvas: CanvasRecord; definition: CanvasType; document: ArchitectureDocument; port: CanvasPort;
  onBack: () => void; entities?: readonly StoreEntity[];
}) {
  const canvas = props.canvas;
  const behavior = canvasBehavior(props.definition);
  const [doc, setDoc] = createSignal(behavior.layout?.(props.document) ?? props.document);
  const [structurePicker, setStructurePicker] = createSignal(false);
  const [structureKind, setStructureKind] = createSignal<string>();
  const [selection, setSelection] = createSignal(emptySelection());
  const [history, setHistory] = createSignal(createHistory());
  const [tool, setTool] = createSignal("select");
  const [kind, setKind] = createSignal(behavior.palette()[0] ?? "");
  const [edgeKind, setEdgeKind] = createSignal(behavior.edges()[0] ?? "");
  const [connectFrom, setConnectFrom] = createSignal<string>();
  const [editing, setEditing] = createSignal<string>();
  const [name, setName] = createSignal(canvas.name);
  const [agentVisible, setAgentVisible] = createSignal(canvas.agentVisible);
  const [state, setState] = createSignal<SaveState>("saved");
  const [error, setError] = createSignal("");
  const [leaving, setLeaving] = createSignal(false);
  let host!: HTMLDivElement;
  let disposed = false;
  let gesture: { pointerId: number; mode: "pan" | "move" | "resize"; start: Point; before: ArchitectureDocument; ids: string[] } | undefined;
  const selectedEdge = createMemo(() => doc().relationships.find((edge) => edge.id === selection().relationshipIds[0]
    && behavior.edgeFields(doc().nodes.find((node) => node.id === edge.sourceNodeId)?.type ?? "").length > 0));
  const selected = createMemo(() => doc().nodes.find((node) => node.id === selection().nodeIds[0]));
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
    const result = commit(history(), doc(), behavior.layout?.(next) ?? next, mode);
    setHistory(result.history); setDoc(result.doc); schedule();
  }
  function finishLabel() { if (editing()) change(doc()); setEditing(undefined); }
  function undo(redo = false) {
    finishLabel();
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
    const hit = hitTest({ ...doc(), nodes: doc().nodes.map((node) => ["lane", "frame"].includes(behavior.variant(node.type)) ? { ...node, zIndex: -1 } : node) }, screenToDocument(doc().viewport, start), { showPorts: false });
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
  function resize(event: PointerEvent, id: string) {
    event.preventDefault(); event.stopPropagation(); host.focus();
    gesture = { pointerId: event.pointerId, mode: "resize", start: point(event), before: doc(), ids: [id] };
    host.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const p = point(event); const dx = p.x - gesture.start.x; const dy = p.y - gesture.start.y;
    const base = gesture.before;
    if (gesture.mode === "pan") setDoc({ ...doc(), viewport: panBy(base.viewport, dx, dy) });
    else if (gesture.mode === "move") setDoc(moveNodes(base, new Map(gesture.ids.map((id) => [id, { dx: dx / base.viewport.zoom, dy: dy / base.viewport.zoom }]))));
    else {
      const node = base.nodes.find((node) => node.id === gesture!.ids[0]);
      if (node) setDoc(resizeNode(base, node.id, node.width + dx / base.viewport.zoom, node.height + dy / base.viewport.zoom));
    }
  }
  function end(event: PointerEvent, cancel = false) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const before = gesture.before; const mode = gesture.mode; const ids = gesture.ids; gesture = undefined;
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    if (cancel) { setDoc(before); return; }
    if (mode !== "pan") {
      setDoc(mode === "move" && behavior.drop ? behavior.drop(doc(), ids) : behavior.layout?.(doc()) ?? doc());
      setHistory(commit(history(), before, doc(), "immediately").history);
    }
    schedule();
  }
  function zoom(factor: number) {
    setDoc({ ...doc(), viewport: zoomAt(doc().viewport, { x: host.clientWidth / 2, y: host.clientHeight / 2 }, doc().viewport.zoom * factor) }); schedule();
  }
  function fit() {
    if (!doc().nodes.length) return;
    setDoc({ ...doc(), viewport: fitBounds(doc().viewport, documentBounds(doc()), host.clientWidth, host.clientHeight) }); schedule();
  }
  function add(entity?: StoreEntity) {
    const structural = behavior.structureReferences && !annotation(kind());
    if (structural && !entity) { setStructureKind(kind()); setStructurePicker(true); return; }
    const shape = entity ? structureKind() ?? entity.level! : kind();
    if (!behavior.palette().includes(shape)) { setError("This shape is not allowed by the core."); return; }
    const p = screenToDocument(doc().viewport, { x: host.clientWidth / 2, y: host.clientHeight / 2 });
    const id = crypto.randomUUID();
    let next = insertNode(doc(), props.definition, shape, { x: p.x - 90, y: p.y - 50 }, id);
    next = { ...next, nodes: next.nodes.map((node) => node.id === id ? withProperties({ ...node,
      ...(entity ? { name: entity.title } : {}),
      ...behavior.initialGeometry?.(shape),
    }, behavior.defaults(shape)) : node) };
    if (entity) next = setReference(next, id, { kind: "node", id: entity.id });
    change(next); setStructurePicker(false);
    setSelection({ ...emptySelection(), nodeIds: [id] }); host.focus();
  }
  function renderNode(node: () => ArchNode) {
    return <g onDblClick={() => { if (!readRef(node())) setEditing(node().id); }}>
      <CanvasNode node={node()} variant={behavior.variant(node().type)} selected={selection().nodeIds.includes(node().id)} roadmap={canvas.type === "roadmap"}>
        <Show when={readRef(node())}>{(ref) => <EntityIcon kind={ref().kind} />}</Show>
        <Show when={referenceState(readRef(node()), props.entities ?? []).trust === "unverified"}><StatusChip tone="warn" label={readRef(node()) ? "Missing · Unverified" : "Unverified"} /></Show>
        <NodeLabel node={{ name: readRef(node()) ? referenceState(readRef(node()), props.entities ?? []).title : node().name }} editing={editing() === node().id && !readRef(node())} onInput={(name) => change(updateNode(doc(), node().id, { name }), "eventually")} onDone={finishLabel} />
      </CanvasNode>
      <Show when={selection().nodeIds.includes(node().id)}><foreignObject x={node().x + node().width - 24} y={node().y + node().height - 24} width="24" height="24"><Button size="icon" variant="ghost" class="!h-6 !w-6 cursor-se-resize" aria-label="Resize shape" onPointerDown={(event) => resize(event, node().id)}><Maximize2 size={12} /></Button></foreignObject></Show>
    </g>;
  }
  function keydown(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest("input,textarea,button,[contenteditable=true]")) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); undo(event.shiftKey); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); }
    else if (event.key === "Escape") { setTool("select"); setConnectFrom(undefined); setSelection(emptySelection()); }
    else if (event.key === "Enter" && selected() && !readRef(selected()!)) { event.preventDefault(); setEditing(selected()!.id); }
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selected()) {
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
  return <DetailPanel.Root open={!!selected() || !!selectedEdge()} expandable={false} shortcuts={false} dismissOnOutsideClick={false} activeEntityId={selected()?.id ?? selectedEdge()?.id} onOpenChange={(open) => { if (!open) setSelection(emptySelection()); }} class="h-full min-h-0">
    <DetailPanel.Collection><div class="flex h-full min-h-0 flex-col">
    <PageToolbar.Root class="items-center">
      <PageToolbar.Leading class="flex items-center gap-2">
        <Button variant="texture" size="icon" aria-label="Canvases" disabled={leaving()} onClick={() => void back()}><ChevronLeft size={14} /></Button>
        <div class="w-56 shrink-0"><Input aria-label="Canvas name" value={name()} onInput={(e) => { setName(e.currentTarget.value); schedule(); }} /></div>
        <span role="status" class="whitespace-nowrap text-xs" classList={{ "text-[var(--color-danger)]": state() === "error", "text-[var(--color-text-muted)]": state() !== "error" }}>{state() === "pending" ? "Unsaved" : state() === "saving" ? "Saving…" : state() === "error" ? "Not saved" : "Saved"}</span>
      </PageToolbar.Leading>
      <PageToolbar.Actions class="flex items-center gap-1">
        <Button size="icon" variant="texture" aria-label="Undo" disabled={!canUndo(history())} onClick={() => undo()}><Undo2 size={14} /></Button>
        <Button size="icon" variant="texture" aria-label="Redo" disabled={!canRedo(history())} onClick={() => undo(true)}><Redo2 size={14} /></Button>
        <Button size="icon" variant="texture" aria-label="Delete selection" disabled={!selection().nodeIds.length && !selection().relationshipIds.length} onClick={deleteSelected}><Delete size={14} /></Button>
        <Button size="icon" variant="texture" aria-label="Arrange" disabled={!doc().nodes.length} onClick={() => { if (behavior.layout) change(behavior.layout(doc())); else { const layout = layoutSync({ nodes: doc().nodes, mode: "horizontal" }); change(setNodePositions(doc(), new Map(layout.nodes.map((n) => [n.id, n])))); } fit(); }}><LayoutDashboard size={14} /></Button>
        <Button size="icon" variant="texture" aria-label={agentVisible() ? "Agent-visible (on)" : "Agent-visible (off)"} aria-pressed={agentVisible()} selected={agentVisible()} onClick={() => { setAgentVisible(!agentVisible()); schedule(); }}><Eye size={14} /></Button>
        <Tooltip.Root>
          <Tooltip.Trigger asChild={(triggerProps) => <Button {...triggerProps({ "aria-label": `${props.definition.label} rules` })} size="icon" variant="texture"><HelpCircle size={14} /></Button>} />
          <Tooltip.Content>{props.definition.label}: {props.definition.rules.length ? props.definition.rules.join(" ") : "No additional type rules."} Drag to move, scroll to pan, Ctrl/⌘+scroll to zoom.</Tooltip.Content>
        </Tooltip.Root>
      </PageToolbar.Actions>
    </PageToolbar.Root>
    <Show when={error()}><div role="alert" class="flex flex-wrap items-center gap-2 px-4 py-2 text-sm text-[var(--color-danger)]"><span>{error()}</span><Button size="sm" variant="ghost" onClick={() => void save.flush()}>Retry save</Button></div></Show>
    <div class="relative flex min-h-0 flex-1 flex-col">
    <div ref={host} class="pw-canvas-editor relative min-h-0 flex-1 overflow-hidden" tabIndex={0} role="group" aria-label="Canvas editor" style={{ "background-size": `${24 * doc().viewport.zoom}px ${24 * doc().viewport.zoom}px`, "background-position": `${doc().viewport.x}px ${doc().viewport.y}px` }}
      onPointerDown={start} onPointerMove={move} onPointerUp={(event) => end(event)} onPointerCancel={(event) => end(event, true)} onKeyDown={keydown}>
      <Show when={!doc().nodes.length}><p class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[var(--color-text-muted)]">This canvas is empty. Add a shape from the toolbar below.</p></Show>
      <svg class="h-full w-full" aria-label={name()}>
        <defs><marker id={`canvas-arrow-${canvas.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
        <g transform={`translate(${doc().viewport.x} ${doc().viewport.y}) scale(${doc().viewport.zoom})`}>
          <Index each={doc().nodes.filter((node) => ["lane", "frame"].includes(behavior.variant(node.type)))}>{renderNode}</Index>
          <For each={doc().relationships}>{(edge) => {
            const source = () => doc().nodes.find((n) => n.id === edge.sourceNodeId);
            const target = () => doc().nodes.find((n) => n.id === edge.targetNodeId);
            const route = () => source() && target() ? resolveRelationshipRoute(source()!, target()!) : [];
            return <g onPointerDown={(event) => {
              if (event.button !== 0 || tool() !== "select") return;
              event.preventDefault(); event.stopPropagation(); host.focus();
              setSelection({ ...emptySelection(), relationshipIds: [edge.id] });
            }}><path d={pointsToSvgPath(route())} fill="none" stroke={selection().relationshipIds.includes(edge.id) ? "var(--color-text-primary)" : "var(--color-text-muted)"} stroke-width="2" stroke-dasharray={behavior.edgeStyle(edge.type).dashed ? "6 4" : undefined} marker-end={behavior.edgeStyle(edge.type).arrow ? `url(#canvas-arrow-${canvas.id})` : undefined} />
              <Show when={route().length}><text x={route()[Math.floor(route().length / 2)]!.x} y={route()[Math.floor(route().length / 2)]!.y - 8} fill="var(--color-text-muted)" font-size="12">{(behavior.edgeFields(source()?.type ?? "").length && propertyText(edge, "label")) || edge.type}</text></Show></g>;
          }}</For>
          <Index each={doc().nodes.filter((node) => !["lane", "frame"].includes(behavior.variant(node.type)))}>{renderNode}</Index>
        </g>
      </svg>
    </div>
    <div class="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
      <Show when={tool() === "connect"}><span class="text-xs text-[var(--color-text-muted)]">{connectFrom() ? "Select a target shape." : "Select a source shape, then a target."}</span></Show>
      <For each={behavior.hints(doc())}>{(hint) => <StatusChip tone="warn" label={hint} />}</For>
    </div>
    <Card variant="texture" texture="compact" class="pw-canvas-dock">
      <SegmentedControl aria-label="Canvas tool" class="[&_.pw-segmented__item]:w-8 [&_.pw-segmented__item]:px-0" value={tool()} onValueChange={(details) => { if (details.value) { setTool(details.value); setConnectFrom(undefined); } }} options={toolOptions()} />
      <DropdownMenu positioning={{ placement: "top" }}>
        <DropdownMenuTrigger aria-label="Add shape" title="Add shape" class={buttonClassName("ghost", "icon")}><Plus size={14} /></DropdownMenuTrigger>
        <DropdownMenuContent class="min-w-40">
          <For each={behavior.palette()}>{(value) => <DropdownMenuItem value={value} onSelect={() => { setKind(value); add(); }}>{value}</DropdownMenuItem>}</For>
        </DropdownMenuContent>
      </DropdownMenu>
      <Show when={behavior.structureReferences}><Button size="icon" variant="ghost" aria-label="Add from Structure" onClick={() => { setStructureKind(undefined); setStructurePicker(true); }}><Network size={14} /></Button></Show>
      <Show when={props.definition.unrestricted} fallback={
        <DropdownMenu positioning={{ placement: "top" }}>
          <DropdownMenuTrigger aria-label={`Edge type: ${edgeKind()}`} title={`Edge type: ${edgeKind()}`} class={buttonClassName("ghost", "icon")}><Route size={14} /></DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-40">
            <For each={behavior.edges()}>{(value) => <DropdownMenuItem value={value} selected={edgeKind() === value} onSelect={() => setEdgeKind(value)}>{value}</DropdownMenuItem>}</For>
          </DropdownMenuContent>
        </DropdownMenu>
      }>
        <Input aria-label="Edge type" placeholder="Edge type" class="w-28" value={edgeKind()} onInput={(e) => setEdgeKind(e.currentTarget.value)} />
      </Show>
    </Card>
    <Card variant="texture" texture="compact" class="pw-canvas-zoom">
      <Button size="icon" variant="ghost" aria-label="Zoom out" onClick={() => zoom(0.8)}><MinusSignIcon size={14} /></Button>
      <span class="w-10 text-center text-xs tabular-nums text-[var(--color-text-secondary)]">{Math.round(doc().viewport.zoom * 100)}%</span>
      <Button size="icon" variant="ghost" aria-label="Zoom in" onClick={() => zoom(1.25)}><Plus size={14} /></Button>
      <Button size="icon" variant="ghost" aria-label="Fit canvas" onClick={fit}><Maximize2 size={14} /></Button>
    </Card>
    </div>
  </div></DetailPanel.Collection>
    <Show when={selected()?.id} keyed>{(id) => <DetailPanel.Content><NodeInspector node={selected()!} entities={props.entities ?? []} canvasName={name()} structureRequired={behavior.structureReferences && !annotation(selected()!.type)}
      onLink={(ref) => change(setReference(doc(), id, ref))}
      promote={props.port.promote ? (input) => props.port.promote!(canvas.projectId, input) : undefined}>
      <TypeInspector node={selected()!} document={doc()} type={canvas.type} fields={behavior.fields(selected()!.type)} onApply={(values) => change(updateNode(doc(), id, withProperties(selected()!, values)))} />
    </NodeInspector></DetailPanel.Content>}</Show>
    <Show when={selectedEdge()}>{(edge) => <DetailPanel.Content><DetailPanel.Header /><DetailPanel.Body><DetailPanel.Main>
      <DetailPanel.Title title={`Edge: ${edge().type}`} />
      <Show when={behavior.edgeFields(doc().nodes.find((node) => node.id === edge().sourceNodeId)?.type ?? "").length}>
        <DetailPanel.Section title="Arrow properties" icon={<Route size={14} />}><For each={behavior.edgeFields(doc().nodes.find((node) => node.id === edge().sourceNodeId)?.type ?? "")}>{(field) => <Field label={field.label}><Input aria-label={field.label} value={propertyText(edge(), field.key)} onInput={(event) => {
          const value = event.currentTarget.value;
          change({ ...doc(), relationships: doc().relationships.map((item) => item.id === edge().id ? withProperties(item, { ...properties(item), [field.key]: value }) : item) }, "eventually");
        }} /></Field>}</For></DetailPanel.Section>
      </Show>
    </DetailPanel.Main></DetailPanel.Body></DetailPanel.Content>}</Show>
    <Show when={behavior.structureReferences}><StructurePicker open={structurePicker()} entities={props.entities ?? []} onClose={() => setStructurePicker(false)} onAdd={add} /></Show>
  </DetailPanel.Root>;
}

function NodeLabel(props: { node: { name: string }; editing: boolean; onInput: (name: string) => void; onDone: () => void }) {
  return <Show when={props.editing} fallback={<span class="break-words text-center text-sm text-[var(--color-text-primary)]">{props.node.name}</span>}>
    <Input aria-label="Shape label" value={props.node.name} ref={(element) => queueMicrotask(() => { element.focus(); element.select(); })}
      onPointerDown={(event) => event.stopPropagation()} onInput={(event) => props.onInput(event.currentTarget.value)} onBlur={props.onDone}
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" || event.key === "Escape") props.onDone(); }} />
  </Show>;
}
