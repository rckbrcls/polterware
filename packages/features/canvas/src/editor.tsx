import { For, Index, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  canRedo, canUndo, commit, createHistory, documentBounds, emptySelection, fitBounds,
  historyRedo, historyUndo, hitTest, layoutSync, moveNodes, panBy, resolveRelationshipRoute,
  pointsToSvgPath, screenToDocument, selectClick, setNodePositions, updateNode, zoomAt,
  type ArchitectureDocument, type Point,
} from "@polterware/frontend-canvas";
import {
  Button, Card, Input, PageToolbar, Select, StatusChip, StickyNote, SwitchRow,
  Plus, Delete, Undo2, Redo2, Maximize2, MinusSignIcon, ChevronLeft, pushToast,
} from "@polterware/frontend-design-system";
import { createAutosave, type SaveState } from "./autosave";
import { connectNodes, edgePalette, insertNode, nodePalette, removeSelection, resizeNode, serializeCanvas,
  type CanvasPort, type CanvasRecord, type CanvasType } from "./model";
import "./canvas.css";

export const AGENT_HINT = "Agents read only shared canvases. Content without references is unverified.";

export function CanvasEditor(props: {
  canvas: CanvasRecord; definition: CanvasType; document: ArchitectureDocument; port: CanvasPort;
  onBack: () => void;
}) {
  const canvas = props.canvas;
  const [doc, setDoc] = createSignal(props.document);
  const [selection, setSelection] = createSignal(emptySelection());
  const [history, setHistory] = createSignal(createHistory());
  const [tool, setTool] = createSignal("select");
  const [kind, setKind] = createSignal(nodePalette(props.definition)[0] ?? "");
  const [edgeKind, setEdgeKind] = createSignal(edgePalette(props.definition)[0] ?? "");
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
    const result = commit(history(), doc(), next, mode);
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
    const hit = hitTest(doc(), screenToDocument(doc().viewport, start), { showPorts: false });
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
  function add() {
    const p = screenToDocument(doc().viewport, { x: host.clientWidth / 2, y: host.clientHeight / 2 });
    const id = crypto.randomUUID();
    change(insertNode(doc(), props.definition, kind(), { x: p.x - 90, y: p.y - 50 }, id));
    setSelection({ ...emptySelection(), nodeIds: [id] }); host.focus();
  }
  function keydown(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest("input,textarea,button,[contenteditable=true]")) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); undo(event.shiftKey); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); }
    else if (event.key === "Escape") { setTool("select"); setConnectFrom(undefined); setSelection(emptySelection()); }
    else if (event.key === "Enter" && selected()) { event.preventDefault(); setEditing(selected()!.id); }
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
  return <div class="flex h-full min-h-0 flex-col">
    <PageToolbar.Root>
      <Button size="sm" variant="ghost" disabled={leaving()} onClick={() => void back()}><ChevronLeft size={14} />Canvases</Button>
      <Input aria-label="Canvas name" class="w-48" value={name()} onInput={(e) => { setName(e.currentTarget.value); schedule(); }} />
      <StatusChip tone={state() === "error" ? "danger" : "muted"} label={state() === "pending" ? "Unsaved" : state() === "saving" ? "Saving…" : state() === "error" ? "Not saved" : "Saved"} />
      <PageToolbar.Actions>
        <SwitchRow label="Agent-visible" checked={agentVisible()} onCheckedChange={(value) => { setAgentVisible(value); schedule(); }} />
      </PageToolbar.Actions>
    </PageToolbar.Root>
    <p class="px-4 text-xs text-[var(--color-text-muted)]">{AGENT_HINT}</p>
    <Show when={error()}><div role="alert" class="flex items-center gap-2 px-4 py-2 text-sm text-[var(--color-danger)]"><span>{error()}</span><Button size="sm" variant="ghost" onClick={() => void save.flush()}>Retry save</Button></div></Show>
    <div class="flex flex-wrap items-center gap-2 p-2" aria-label="Canvas tools">
      <Select aria-label="Tool" class="w-28" value={tool()} onChange={(value) => { setTool(value); setConnectFrom(undefined); }} options={[{ value: "select", label: "Select" }, { value: "pan", label: "Pan" }, { value: "connect", label: "Connect" }]} />
      <Select aria-label="Shape kind" class="w-36" value={kind()} onChange={setKind} options={nodePalette(props.definition).map((value) => ({ value, label: value }))} />
      <Button size="sm" disabled={!kind()} onClick={add}><Plus size={14} />Add shape</Button>
      <Show when={props.definition.unrestricted} fallback={<Select aria-label="Edge type" class="w-36" value={edgeKind()} onChange={setEdgeKind} options={edgePalette(props.definition).map((value) => ({ value, label: value }))} />}>
        <Input aria-label="Edge type" class="w-36" value={edgeKind()} onInput={(e) => setEdgeKind(e.currentTarget.value)} />
      </Show>
      <Button size="icon" variant="ghost" aria-label="Undo" disabled={!canUndo(history())} onClick={() => undo()}><Undo2 size={14} /></Button>
      <Button size="icon" variant="ghost" aria-label="Redo" disabled={!canRedo(history())} onClick={() => undo(true)}><Redo2 size={14} /></Button>
      <Button size="icon" variant="ghost" aria-label="Delete selection" disabled={!selection().nodeIds.length && !selection().relationshipIds.length} onClick={deleteSelected}><Delete size={14} /></Button>
      <Button size="icon" variant="ghost" aria-label="Zoom out" onClick={() => zoom(0.8)}><MinusSignIcon size={14} /></Button>
      <span class="text-xs text-[var(--color-text-muted)]">{Math.round(doc().viewport.zoom * 100)}%</span>
      <Button size="icon" variant="ghost" aria-label="Zoom in" onClick={() => zoom(1.25)}><Plus size={14} /></Button>
      <Button size="icon" variant="ghost" aria-label="Fit canvas" onClick={fit}><Maximize2 size={14} /></Button>
      <Button size="sm" variant="ghost" disabled={!doc().nodes.length} onClick={() => { const layout = layoutSync({ nodes: doc().nodes, mode: "horizontal" }); change(setNodePositions(doc(), new Map(layout.nodes.map((n) => [n.id, n])))); fit(); }}>Arrange</Button>
      <Select aria-label="Select shape or edge" class="w-44" value={selection().nodeIds[0] ?? selection().relationshipIds[0] ?? ""} onChange={(id) => setSelection({ ...emptySelection(), ...(doc().nodes.some((n) => n.id === id) ? { nodeIds: [id] } : { relationshipIds: id ? [id] : [] }) })} options={[{ value: "", label: "No selection" }, ...doc().nodes.map((node) => ({ value: node.id, label: node.name || node.type })), ...doc().relationships.map((edge) => ({ value: edge.id, label: `Edge: ${edge.type}` }))]} />
    </div>
    <p class="px-4 pb-2 text-xs text-[var(--color-text-muted)]">{tool() === "connect" ? (connectFrom() ? "Choose the target shape." : "Choose the source shape, then the target.") : "Drag shapes to move. Drag empty space to pan; scroll to pan, Ctrl/⌘ + scroll to zoom. Double-click a label or press Enter to edit. Arrow keys move the selection."}</p>
    <Show when={props.definition.rules.length}><p class="px-4 pb-2 text-xs text-[var(--color-text-muted)]">{props.definition.rules.join(" ")}</p></Show>
    <div ref={host} class="pw-canvas-editor relative min-h-0 flex-1 overflow-hidden" tabIndex={0} role="group" aria-label="Canvas editor"
      onPointerDown={start} onPointerMove={move} onPointerUp={(event) => end(event)} onPointerCancel={(event) => end(event, true)} onKeyDown={keydown}>
      <Show when={!doc().nodes.length}><p class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[var(--color-text-muted)]">This canvas is empty. Choose a shape and select Add shape.</p></Show>
      <svg class="h-full w-full" aria-label={name()}>
        <g transform={`translate(${doc().viewport.x} ${doc().viewport.y}) scale(${doc().viewport.zoom})`}>
          <For each={doc().relationships}>{(edge) => {
            const source = () => doc().nodes.find((n) => n.id === edge.sourceNodeId);
            const target = () => doc().nodes.find((n) => n.id === edge.targetNodeId);
            const route = () => source() && target() ? resolveRelationshipRoute(source()!, target()!) : [];
            return <g><path d={pointsToSvgPath(route())} fill="none" stroke={selection().relationshipIds.includes(edge.id) ? "var(--color-text-primary)" : "var(--color-text-muted)"} stroke-width="2" />
              <Show when={route().length}><text x={route()[Math.floor(route().length / 2)]!.x} y={route()[Math.floor(route().length / 2)]!.y - 8} fill="var(--color-text-muted)" font-size="12">{edge.type}</text></Show></g>;
          }}</For>
          <Index each={doc().nodes}>{(node) => <g onDblClick={() => { setEditing(node().id); }}>
            <Show when={node().type === "ellipse"}><ellipse cx={node().x + node().width / 2} cy={node().y + node().height / 2} rx={node().width / 2} ry={node().height / 2} fill="var(--color-surface-subtle)" stroke={selection().nodeIds.includes(node().id) ? "var(--color-text-primary)" : "var(--color-border-subtle)"} /></Show>
            <foreignObject x={node().x} y={node().y} width={node().width} height={node().height}>
              <div class="h-full" classList={{ "pw-canvas-selected": selection().nodeIds.includes(node().id), "pw-canvas-text": node().type === "text" }}>
                <Show when={node().type !== "ellipse" && node().type !== "text"} fallback={<div class="flex h-full items-center justify-center p-3"><NodeLabel node={node()} editing={editing() === node().id} onInput={(name) => change(updateNode(doc(), node().id, { name }), "eventually")} onDone={finishLabel} /></div>}>
                  <Card class="flex h-full items-center justify-center gap-2 !p-3">
                    <Show when={node().type === "note"}><StickyNote size={14} /></Show>
                    <NodeLabel node={node()} editing={editing() === node().id} onInput={(name) => change(updateNode(doc(), node().id, { name }), "eventually")} onDone={finishLabel} />
                  </Card>
                </Show>
              </div>
            </foreignObject>
            <Show when={selection().nodeIds.includes(node().id)}><foreignObject x={node().x + node().width - 24} y={node().y + node().height - 24} width="24" height="24"><Button size="icon" variant="ghost" class="!h-6 !w-6 cursor-se-resize" aria-label="Resize shape" onPointerDown={(event) => resize(event, node().id)}><Maximize2 size={12} /></Button></foreignObject></Show>
          </g>}</Index>
        </g>
      </svg>
    </div>
  </div>;
}

function NodeLabel(props: { node: { name: string }; editing: boolean; onInput: (name: string) => void; onDone: () => void }) {
  return <Show when={props.editing} fallback={<span class="break-words text-center text-sm text-[var(--color-text-primary)]">{props.node.name}</span>}>
    <Input aria-label="Shape label" value={props.node.name} ref={(element) => queueMicrotask(() => { element.focus(); element.select(); })}
      onPointerDown={(event) => event.stopPropagation()} onInput={(event) => props.onInput(event.currentTarget.value)} onBlur={props.onDone}
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" || event.key === "Escape") props.onDone(); }} />
  </Show>;
}
