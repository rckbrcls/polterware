import {
  Show,
  batch,
  For,
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  untrack,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { Portal, isServer } from "solid-js/web";
import { FloatingSurfaceProvider } from "./floating-surface";
import { animate, motionValue, type AnimationPlaybackControls } from "motion";
import { createDragMotion } from "./drag-motion";
import { prefersReducedMotion } from "./reduced-motion";
import {
  FLOATING_WINDOW_DEFAULT_WIDTH, FLOATING_WINDOW_DEFAULT_HEIGHT, defaultFloatingWindowGeometry,
  windowArea, readFloatingWindowGeometry, resolveFloatingWindowRect, windowGeometryAt, moveFloatingWindowRect, resizeFloatingWindowRect,
  type FloatingWindowGeometry, type FloatingWindowBounds, type FloatingWindowRect, type FloatingWindowResizeEdge,
} from "./floating-window-geometry";
export { FLOATING_WINDOW_DEFAULT_WIDTH, FLOATING_WINDOW_MIN_WIDTH, FLOATING_WINDOW_MAX_WIDTH, clampFloatingWindowWidth } from "./floating-window-geometry";
import { spring } from "./springs";
import { CollapseIcon, ExpandIcon, SidebarRightIcon, X, MinusSignIcon } from "./hugeicons";
import { PanelInteractionContext, panelOwnerAt, rememberPanelInteraction, registerPanelInteraction, type PanelInteractionOwner } from "./panel-interaction";
import "./floating-window.css";

export type FloatingWindowRootProps = {
  /** The card is visible; visibility is never persisted. */
  open: boolean;
  /** The floating card fills the main surface. */
  expanded: boolean;
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
  /** Hide both card and bubble without discarding geometry. */
  available?: boolean;
  onOpenChange: (open: boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
  /** localStorage key for versioned floating geometry (accepts a legacy numeric width). */
  storageKey?: string;
  children: JSX.Element;
  class?: string;
  "aria-label"?: string;
  /** Icon shown when the window is the floating bubble. */
  bubble?: JSX.Element;
  /** `traffic` keeps the three window dots. `close` is a single card button. */
  controls?: "traffic" | "close";
};

export type FloatingWindowHeaderProps = { class?: string };

type FloatingWindowContextValue = {
  expanded: Accessor<boolean>;
  contentHost: Accessor<HTMLElement | undefined>;
  setHeaderClass: (value: string) => void;
  interaction: PanelInteractionOwner;
};
const FloatingWindowContext = createContext<FloatingWindowContextValue>();
function useFloatingWindow(part: string): FloatingWindowContextValue {
  const context = useContext(FloatingWindowContext);
  if (!context) throw new Error(`FloatingWindow.${part} must be used inside FloatingWindow.Root`);
  return context;
}

const RESIZE_EDGES: FloatingWindowResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const EDGE_LABELS: Record<FloatingWindowResizeEdge, string> = {
  n: "top", s: "bottom", e: "right", w: "left",
  ne: "top right", nw: "top left", se: "bottom right", sw: "bottom left",
};
const DEAD_ZONE = 3;

function FloatingWindowRoot(props: FloatingWindowRootProps) {
  const [contentHost, setContentHost] = createSignal<HTMLElement>();
  const [headerClass, setHeaderClass] = createSignal("");
  const [geometry, setGeometry] = createSignal(readStoredGeometry(props.storageKey));
  const [bounds, setBounds] = createSignal<FloatingWindowBounds>({ width: 0, height: 0 });
  const [gesturing, setGesturing] = createSignal(false);
  const [settled, setSettled] = createSignal(true);
  const minimized = () => !props.open && props.minimized;
  const frameId = `pw-floating-window-${createUniqueId()}`;
  let returnFocus: HTMLElement | undefined;
  const [present, setPresent] = createSignal(props.open || minimized());
  const available = () => props.available !== false;
  const visible = () => available() && props.open;
  const expanded = () => visible() && props.expanded;
  const floatingRect = () => resolveFloatingWindowRect(geometry(), bounds());
  const targetRect = () => expanded()
    ? { x: 0, y: 0, ...bounds() }
    : resolveFloatingWindowRect(geometry(), bounds(), minimized());
  const controls = () => props.controls ?? "traffic";
  const toggleLabel = () => props.open ? "Minimize window" : (props["aria-label"] ?? "Show window");
  const expandLabel = () => expanded() ? "Restore window" : "Expand window";

  let root: HTMLDivElement | undefined;
  let positioner: HTMLDivElement | undefined;
  let dragLayer: HTMLDivElement | undefined;
  let shell: HTMLDivElement | undefined;
  let frame: HTMLDivElement | undefined;
  let toggle: HTMLButtonElement | undefined;
  let drag: ReturnType<typeof createDragMotion> | undefined;
  let disposed = false;
  let firstPaint = false;
  let base = { width: FLOATING_WINDOW_DEFAULT_WIDTH, height: FLOATING_WINDOW_DEFAULT_HEIGHT };
  let radius = 18;
  let run = 0;
  let timer: number | undefined;
  let clickSuppressed = false;
  let clickReset: number | undefined;
  let cancelGesture: (() => void) | undefined;
  let preserveOutsideFocus = false;
  let dockSettlement = false;
  let previousMode = props.open ? (props.expanded ? "expanded" : "open") : minimized() ? "minimized" : "closed";
  let motionQuery: MediaQueryList | undefined;
  const [reduced, setReduced] = createSignal(prefersReducedMotion());
  const x = motionValue(0), y = motionValue(0), width = motionValue(1), height = motionValue(1);
  const openness = motionValue(minimized() ? 0 : 1);
  const contentOpacity = motionValue(props.open ? 1 : 0);
  const cornerRadius = motionValue(props.expanded ? 0 : minimized() ? 24 : radius);
  const presence = motionValue(props.open || minimized() ? 1 : 0);
  const interaction: PanelInteractionOwner = { enabled: () => visible() || (available() && minimized()), elements: new Set() };
  let animations: AnimationPlaybackControls[] = [];

  function clearTimer() {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  }
  function stopMotion() {
    run++;
    clearTimer();
    for (const control of animations) control.stop();
    animations = [];
  }
  function screenRect(): FloatingWindowRect {
    return { x: x.get(), y: y.get(), width: width.get(), height: height.get() };
  }

  // A projected shell changes shape; the separately clipped content never scales.
  // All measurements are cached on mount/resize, never read inside paint or pointermove.
  function paint() {
    if (!positioner || !shell || !frame || !toggle) return;
    const rect = screenRect();
    const progress = Math.max(0, Math.min(1, openness.get()));
    const sx = Math.max(0.001, rect.width / base.width);
    const sy = Math.max(0.001, rect.height / base.height);
    const corner = Math.max(0, Math.min(cornerRadius.get(), rect.width / 2, rect.height / 2));
    positioner.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
    shell.style.transform = `scale(${sx}, ${sy})`;
    shell.style.borderRadius = `${corner / sx}px / ${corner / sy}px`;
    frame.style.opacity = String(contentOpacity.get());
    frame.style.clipPath = `inset(0 ${Math.max(0, base.width - rect.width)}px ${Math.max(0, base.height - rect.height)}px 0 round ${corner}px)`;
    positioner.style.opacity = String(presence.get());
    const size = Math.min(48 - 24 * progress, rect.width, rect.height);
    const insetX = Math.min(28 * progress, Math.max(0, rect.width - size));
    const insetY = Math.min(4 * progress, Math.max(0, rect.height - size));
    toggle.style.transform = `translate3d(${insetX}px, ${insetY}px, 0) scale(${size / 24})`;
    root?.style.setProperty("--floating-window-width", `${base.width}px`);
    root?.style.setProperty("--floating-window-height", `${base.height}px`);
  }

  function snap(rect: FloatingWindowRect) {
    x.set(rect.x); y.set(rect.y); width.set(rect.width); height.set(rect.height);
    presence.set(available() && (props.open || minimized()) ? 1 : 0);
    openness.set(minimized() ? 0 : 1);
    contentOpacity.set(visible() ? 1 : 0);
    cornerRadius.set(expanded() ? 0 : minimized() ? Math.min(rect.width, rect.height) / 2 : radius);
    paint();
    setSettled(true);
  }

  createEffect(() => {
    const rect = targetRect();
    const open = visible();
    const full = expanded();
    const reduce = reduced();
    const held = gesturing();
    const mini = minimized();
    const mode = open ? full ? "expanded" : "open" : mini ? "minimized" : "closed";
    const oldMode = previousMode;
    previousMode = mode;
    if (isServer || !root || bounds().width <= 0 || bounds().height <= 0 || held) return;
    const contentSize = full ? bounds() : floatingRect();
    base = { width: contentSize.width, height: contentSize.height };
    stopMotion();
    paint();
    const current = screenRect();
    if (open || mini) setPresent(true);
    if (mode === "closed" && firstPaint && available()) {
      // Hard dismissal never morphs to the reopen circle and becomes inert immediately.
      cancelGesture?.();
      const currentRun = run;
      const finishClose = () => {
        if (currentRun !== run || props.open || minimized()) return;
        stopMotion(); snap(targetRect()); setPresent(false);
      };
      const fade = animate(presence, 0, { type: "tween", ...spring.fast.exit });
      animations = [fade];
      void fade.finished.then(finishClose, finishClose);
      timer = window.setTimeout(finishClose, spring.fast.exit.duration * 1000);
      return;
    }
    const unchanged = ["x", "y", "width", "height"].every((key) => Math.abs(current[key as keyof FloatingWindowRect] - rect[key as keyof FloatingWindowRect]) < 0.01)
      && openness.get() === (mini ? 0 : 1) && presence.get() === (open || mini ? 1 : 0);
    if (!firstPaint || !available() || unchanged) {
      snap(rect);
      setPresent(open || mini);
      return;
    }
    if (reduce) {
      const previousOpacity = contentOpacity.get();
      const previousPresence = presence.get();
      snap(rect);
      contentOpacity.set(previousOpacity);
      presence.set(previousPresence);
      animations = [animate(presence, open || mini ? 1 : 0, spring.fast), animate(contentOpacity, open ? 1 : 0, open ? spring.fast : { type: "tween" as const, ...spring.fast.exit })];
      dockSettlement = false;
      return;
    }
    setSettled(false);
    const currentRun = run;
    const entering = open && (oldMode === "closed" || oldMode === "minimized" || (full && oldMode !== "expanded"));
    const transition = dockSettlement ? spring.moderate : entering ? spring.slow : { type: "tween" as const, ...spring.slow.exit };
    dockSettlement = false;
    animations = [
      animate(presence, 1, entering ? spring.slow : spring.fast),
      animate(x, rect.x, transition), animate(y, rect.y, transition),
      animate(width, rect.width, transition), animate(height, rect.height, transition),
      animate(openness, mini ? 0 : 1, transition),
      animate(cornerRadius, full ? 0 : props.open ? radius : Math.min(rect.width, rect.height) / 2, transition),
      animate(contentOpacity, open ? 1 : 0, open ? spring.fast : { type: "tween" as const, ...spring.fast.exit }),
    ];
    const finish = () => {
      if (currentRun !== run) return;
      stopMotion();
      snap(rect);
    };
    void Promise.all(animations.map((control) => control.finished.catch(() => undefined))).then(finish);
    timer = window.setTimeout(finish, spring.slow.duration * 1000 + 100);
  });

  function persist(next: FloatingWindowGeometry) {
    setGeometry(next);
    if (!props.storageKey || isServer) return;
    try { window.localStorage.setItem(props.storageKey, JSON.stringify(next)); }
    catch { /* The session remains usable when local storage is unavailable. */ }
  }

  function focusInFrame() {
    return !isServer && Boolean(frame?.contains(document.activeElement));
  }
  function restoreFocus() {
    if (isServer) return;
    queueMicrotask(() => {
      if (disposed) return;
      const target = returnFocus?.isConnected ? returnFocus : minimized() ? toggle : root;
      target?.focus({ preventScroll: true });
    });
  }
  createEffect(() => {
    const open = props.open;
    const mini = minimized();
    const enabled = available();
    if (!isServer && open && !untrack(focusInFrame) && document.activeElement instanceof HTMLElement
      && document.activeElement !== toggle && document.activeElement !== document.body) returnFocus = document.activeElement;
    if (!isServer && !open && !mini && !preserveOutsideFocus
      && (untrack(focusInFrame) || document.activeElement === toggle)) restoreFocus();
    if (!enabled && !isServer && (untrack(focusInFrame) || document.activeElement === toggle)) restoreFocus();
    preserveOutsideFocus = false;
  });

  function close() {
    cancelGesture?.();
    batch(() => { props.onMinimizedChange(false); props.onExpandedChange(false); props.onOpenChange(false); });
  }
  function reopen() {
    batch(() => { props.onMinimizedChange(false); props.onOpenChange(true); });
  }
  function minimize() {
    cancelGesture?.();
    batch(() => { props.onExpandedChange(false); props.onOpenChange(false); props.onMinimizedChange(true); });
    queueMicrotask(() => { if (!disposed && available() && minimized()) toggle?.focus({ preventScroll: true }); });
  }
  function onOutsidePointerDown(event: PointerEvent | MouseEvent) {
    // Pointer capture may retarget a release click to the underlying workspace.
    // Physical clicks were handled at pointerdown; zero-detail clicks cover keyboard activation.
    if (event.type === "click" && event.detail > 0) return;
    rememberPanelInteraction(event.target);
    if (!(visible() || minimized()) || !available()) return;
    const target = event.target;
    if (panelOwnerAt(target) === interaction || (target instanceof Element && target.closest("[data-floating-window-opener]"))) return;
    preserveOutsideFocus = true;
    close();
  }

  createEffect(() => {
    if (!available() || expanded() || (!visible() && !minimized())) untrack(() => cancelGesture?.());
  });

  function toggleExpanded() {
    batch(() => { if (!props.open) reopen(); props.onExpandedChange(!props.expanded); });
  }
  function onWindowKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (event.defaultPrevented) return;
      if (cancelGesture) { event.preventDefault(); cancelGesture(); return; }
      if (expanded() && (focusInFrame() || document.activeElement === toggle)) {
        event.preventDefault(); props.onExpandedChange(false); return;
      }
      if (focusInFrame()) { event.preventDefault(); restoreFocus(); }
      return;
    }
  }

  function suppressClick() {
    clickSuppressed = true;
    if (clickReset !== undefined) cancelAnimationFrame(clickReset);
    clickReset = requestAnimationFrame(() => { clickSuppressed = false; clickReset = undefined; });
  }

  function beginGesture(event: PointerEvent, edge?: FloatingWindowResizeEdge) {
    if (!available() || expanded() || (!edge && props.open && event.currentTarget === toggle) || event.button !== 0 || cancelGesture) return;
    event.preventDefault(); event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    const pointerId = event.pointerId;
    const initialGeometry = geometry();
    const initialRect = settled() ? (edge ? floatingRect() : targetRect()) : screenRect();
    const startX = event.clientX, startY = event.clientY;
    let moved = false;
    let rect = initialRect;
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      const dx = move.clientX - startX, dy = move.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DEAD_ZONE) return;
      if (!moved) {
        moved = true;
        setGesturing(true);
        stopMotion();
        // Freeze the displayed pose; a re-grab never jumps to the animation target.
        if (root) root.style.cursor = edge ? (edge.length === 1 ? (edge === "n" || edge === "s" ? "ns-resize" : "ew-resize") : edge === "ne" || edge === "sw" ? "nesw-resize" : "nwse-resize") : "grabbing";
      }
      rect = edge ? resizeFloatingWindowRect(initialRect, edge, dx, dy, bounds()) : moveFloatingWindowRect(initialRect, dx, dy, bounds());
      if (edge) {
        base = { width: rect.width, height: rect.height };
        x.set(rect.x); y.set(rect.y); width.set(rect.width); height.set(rect.height); paint();
      } else {
        drag?.follow(rect.x - initialRect.x, rect.y - initialRect.y);
        // Keep the live box inside the surface; no gesture scale changes its bounds.
      }
    };
    const finish = (commit: boolean) => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      handle.removeEventListener("lostpointercapture", onCancel);
      cancelGesture = undefined;
      if (root) root.style.cursor = "";
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      if (!moved) return;
      suppressClick();
      drag?.follow(0, 0);
      drag?.lift(false);
      dockSettlement = commit;
      if (commit) persist(windowGeometryAt(rect, bounds(), initialGeometry, Boolean(edge)));
      else setGeometry(initialGeometry);
      const landing = commit ? rect : initialRect;
      x.set(landing.x); y.set(landing.y); width.set(landing.width); height.set(landing.height);
      paint();
      setGesturing(false);
      if (!edge) void drag?.settle();
    };
    const onUp = (up: PointerEvent) => { if (up.pointerId === pointerId) finish(true); };
    const onCancel = (cancel: PointerEvent) => { if (cancel.pointerId === pointerId) finish(false); };
    cancelGesture = () => finish(false);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);
    handle.addEventListener("lostpointercapture", onCancel);
  }

  let keyboardRect: FloatingWindowRect | undefined;
  let keyboardGeometry: FloatingWindowGeometry | undefined;
  let keyboardEdge: FloatingWindowResizeEdge | undefined;
  function finishKeyboard(commit = true) {
    if (!keyboardRect || !keyboardGeometry) return;
    const rect = keyboardRect, initial = keyboardGeometry;
    keyboardRect = undefined; keyboardGeometry = undefined; cancelGesture = undefined;
    dockSettlement = commit;
    if (commit) persist(windowGeometryAt(rect, bounds(), initial, Boolean(keyboardEdge)));
    else {
      setGeometry(initial);
      const previous = resolveFloatingWindowRect(initial, bounds(), minimized());
      base = { width: resolveFloatingWindowRect(initial, bounds()).width, height: resolveFloatingWindowRect(initial, bounds()).height };
      x.set(previous.x); y.set(previous.y); width.set(previous.width); height.set(previous.height); paint();
    }
    setGesturing(false);
  }
  function onGeometryKeyDown(event: KeyboardEvent, edge?: FloatingWindowResizeEdge) {
    if (expanded() || !available() || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? 64 : 16;
    let dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    let dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    if (edge && (event.key === "Home" || event.key === "End")) {
      const reach = Math.max(bounds().width, bounds().height) * (event.key === "Home" ? 1 : -1);
      dx = edge.includes("w") ? reach : edge.includes("e") ? -reach : 0;
      dy = edge.includes("n") ? reach : edge.includes("s") ? -reach : 0;
    }
    if (!dx && !dy) return;
    event.preventDefault(); event.stopPropagation();
    if (!keyboardRect) {
      if (cancelGesture) return;
      keyboardRect = edge ? floatingRect() : targetRect();
      keyboardGeometry = geometry(); keyboardEdge = edge;
      setGesturing(true); stopMotion();
      cancelGesture = () => finishKeyboard(false);
    }
    keyboardRect = edge ? resizeFloatingWindowRect(keyboardRect, edge, dx, dy, bounds()) : moveFloatingWindowRect(keyboardRect, dx, dy, bounds());
    if (edge) base = { width: keyboardRect.width, height: keyboardRect.height };
    x.set(keyboardRect.x); y.set(keyboardRect.y); width.set(keyboardRect.width); height.set(keyboardRect.height); paint();
  }
  function onWindowKeyUp(event: KeyboardEvent) {
    if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") finishKeyboard();
  }

  function resetSize(edge: FloatingWindowResizeEdge) {
    const rect = floatingRect();
    const dx = edge.includes("w") ? rect.width - FLOATING_WINDOW_DEFAULT_WIDTH : edge.includes("e") ? FLOATING_WINDOW_DEFAULT_WIDTH - rect.width : 0;
    const dy = edge.includes("n") ? rect.height - FLOATING_WINDOW_DEFAULT_HEIGHT : edge.includes("s") ? FLOATING_WINDOW_DEFAULT_HEIGHT - rect.height : 0;
    dockSettlement = true;
    persist(windowGeometryAt(resizeFloatingWindowRect(rect, edge, dx, dy, bounds()), bounds(), geometry(), true));
  }

  onMount(() => {
    if (!root || !dragLayer) return;
    radius = Number.parseFloat(getComputedStyle(root).getPropertyValue("--radius-window")) || 24;
    drag = createDragMotion(dragLayer);
    const unregisterInteraction = registerPanelInteraction(interaction);
    if (frame) interaction.elements.add(frame);
    if (toggle) interaction.elements.add(toggle);
    let migrate = true;
    const subscriptions = [x, y, width, height, openness, contentOpacity, cornerRadius, presence].map((value) => value.on("change", paint));
    const measure = () => {
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const measured = { width: rect.width, height: rect.height };
      const previous = untrack(bounds);
      if (!migrate && Math.abs(previous.width - measured.width) < 1 && Math.abs(previous.height - measured.height) < 1) return;
      cancelGesture?.();
      // Viewport changes fit the preferred box without writing storage.
      stopMotion();
      firstPaint = false;
      if (migrate) { migrate = false; setGeometry(readStoredGeometry(props.storageKey, measured)); }
      setBounds(measured);
      paint();
      firstPaint = true;
    };
    measure();
    firstPaint = false;
    const ready = requestAnimationFrame(() => { firstPaint = true; });
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(root);
    window.addEventListener("resize", measure);
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);
    const cancelOnBlur = () => cancelGesture?.();
    window.addEventListener("blur", cancelOnBlur);
    document.addEventListener("pointerdown", onOutsidePointerDown, true);
    document.addEventListener("click", onOutsidePointerDown, true);
    const rememberFocus = (event: FocusEvent) => { rememberPanelInteraction(event.target); if (keyboardRect) finishKeyboard(); };
    document.addEventListener("focusin", rememberFocus);
    const swallow = (event: MouseEvent) => {
      if (!clickSuppressed) return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    dragLayer.addEventListener("click", swallow, true);
    const preferenceChanged = (event: MediaQueryListEvent) => setReduced(event.matches);
    if (typeof window.matchMedia === "function") {
      motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(motionQuery.matches);
      motionQuery.addEventListener("change", preferenceChanged);
    }
    onCleanup(() => {
      disposed = true;
      firstPaint = false;
      cancelGesture?.();
      stopMotion();
      observer?.disconnect();
      cancelAnimationFrame(ready);
      if (clickReset !== undefined) cancelAnimationFrame(clickReset);
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
      window.removeEventListener("blur", cancelOnBlur);
      document.removeEventListener("pointerdown", onOutsidePointerDown, true);
      document.removeEventListener("click", onOutsidePointerDown, true);
      document.removeEventListener("focusin", rememberFocus);
      unregisterInteraction();
      motionQuery?.removeEventListener("change", preferenceChanged);
      dragLayer?.removeEventListener("click", swallow, true);
      subscriptions.forEach((stop) => stop());
      [x, y, width, height, openness, contentOpacity, cornerRadius, presence].forEach((value) => value.stop());
      drag?.stop();
    });
  });

  const context: FloatingWindowContextValue = { expanded, contentHost, setHeaderClass, interaction };
  return (
    <FloatingWindowContext.Provider value={context}>
      <div ref={root} tabIndex={-1} class={`pw-floating-window-root ${props.class ?? ""}`}
        data-state={!available() ? "unavailable" : expanded() ? "expanded" : visible() ? "open" : minimized() ? "minimized" : "closed"}
        data-dock={geometry().dock}
        data-open={visible() ? "true" : "false"} data-expanded={expanded() ? "true" : "false"}
        data-available={available() ? "true" : "false"} data-gesturing={gesturing() ? "true" : undefined}>
        <div class="pw-floating-window__collection-panel">{props.children}</div>
        <div ref={positioner} class="pw-floating-window__positioner" hidden={!available() || !present()}
          inert={!visible() && !minimized() ? true : undefined}
          onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
          <div ref={dragLayer} class="pw-floating-window__drag-layer">
            <div ref={shell} class="pw-floating-window__shell" aria-hidden="true" />
            <div ref={frame} id={frameId} class="pw-floating-window__frame"
              inert={!visible() ? true : undefined} aria-hidden={!visible() ? true : undefined}
              data-interactive={visible() ? "true" : undefined}>
              <header class={`pw-floating-window__header ${headerClass()}`} data-controls={controls()}>
                <Show when={controls() === "traffic"}>
                  <button type="button" class="pw-floating-window__window-control" data-control="close"
                    aria-label="Close window" title="Close window" onClick={close}><X size={10} aria-hidden /></button>
                  <span class="pw-floating-window__minimize-slot" aria-hidden />
                  <button type="button" class="pw-floating-window__window-control" data-control="expand"
                    aria-label={expandLabel()} aria-pressed={expanded()} title={expandLabel()} onClick={toggleExpanded}>
                    <Show when={expanded()} fallback={<ExpandIcon size={10} aria-hidden />}><CollapseIcon size={10} aria-hidden /></Show>
                  </button>
                </Show>
                <div class="pw-floating-window__move-handle" role="button" tabIndex={expanded() ? -1 : 0}
                  aria-label="Move window" aria-disabled={expanded()} title="Move window (arrow keys; Shift for larger steps)"
                  onPointerDown={(event) => beginGesture(event)} onKeyDown={(event) => onGeometryKeyDown(event)} />
                <Show when={controls() === "close"}>
                  <button type="button" class="pw-floating-window__close" aria-label="Close window" title="Close window" onClick={close}><X size={14} aria-hidden /></button>
                </Show>
              </header>
              <section ref={setContentHost} class="pw-floating-window__surface" role="region" aria-label={props["aria-label"] ?? "Window"} />
              <Show when={visible() && !expanded()}>
                <For each={RESIZE_EDGES}>{(edge) => (
                  <div class="pw-floating-window__resize-handle" data-edge={edge} role="separator" tabIndex={0}
                    aria-label={`Resize window from ${EDGE_LABELS[edge]} (arrow keys)`}
                    aria-orientation={edge === "n" || edge === "s" ? "horizontal" : "vertical"}
                    aria-valuenow={edge === "n" || edge === "s" ? floatingRect().height : floatingRect().width}
                    aria-valuemin={edge === "n" || edge === "s" ? Math.min(280, windowArea(bounds()).height) : Math.min(320, windowArea(bounds()).width)}
                    aria-valuemax={edge === "n" || edge === "s" ? windowArea(bounds()).height : windowArea(bounds()).width}
                    aria-valuetext={`${Math.round(floatingRect().width)} by ${Math.round(floatingRect().height)} pixels`}
                    aria-controls={frameId}
                    onPointerDown={(event) => beginGesture(event, edge)} onKeyDown={(event) => onGeometryKeyDown(event, edge)} onDblClick={() => resetSize(edge)} />
                )}</For>
              </Show>
            </div>
            <button ref={toggle} type="button" class="pw-floating-window__toggle" hidden={controls() === "close" && props.open}
              data-floating-window-toggle="" data-bubble={minimized() ? "true" : undefined}
              aria-label={toggleLabel()} aria-pressed={visible()} aria-controls={frameId}
              title={toggleLabel()} disabled={!available() || (!props.open && !minimized())}
              onPointerDown={(event) => { if (!props.open) beginGesture(event); else event.stopPropagation(); }}
              onKeyDown={(event) => { if (!props.open) onGeometryKeyDown(event); }}
              onClick={() => { if (!clickSuppressed) { if (props.open) minimize(); else reopen(); } }}>
              <Show when={props.open} fallback={props.bubble ?? <SidebarRightIcon size={14} />}><MinusSignIcon size={10} aria-hidden /></Show>
            </button>
          </div>
        </div>
      </div>
    </FloatingWindowContext.Provider>
  );
}

function readStoredGeometry(key: string | undefined, bounds?: FloatingWindowBounds): FloatingWindowGeometry {
  if (isServer || !key) return { ...defaultFloatingWindowGeometry };
  try { return readFloatingWindowGeometry(window.localStorage.getItem(key), bounds); }
  catch { return { ...defaultFloatingWindowGeometry }; }
}

function FloatingWindowWorkspace(props: { children: JSX.Element; class?: string }) {
  const context = useFloatingWindow("Workspace");
  return <div inert={context.expanded() ? true : undefined} class={`pw-floating-window__collection ${props.class ?? ""}`}>{props.children}</div>;
}

/** Customize shared header styling; controls remain available even without Content. */
function FloatingWindowHeader(props: FloatingWindowHeaderProps) {
  const context = useFloatingWindow("Header");
  createEffect(() => context.setHeaderClass(props.class ?? ""));
  onCleanup(() => context.setHeaderClass(""));
  return null;
}

function FloatingWindowContent(props: { children: JSX.Element; class?: string }) {
  const context = useFloatingWindow("Content");
  return (
    <Show when={context.contentHost()}>
      {(mount) => (
        <Portal
          mount={mount()}
          ref={(container) => container.classList.add("pw-floating-window__portal")}
        >
          <PanelInteractionContext.Provider value={context.interaction}>
            <FloatingSurfaceProvider>
              <div class={`pw-floating-window__content ${props.class ?? ""}`}>{props.children}</div>
            </FloatingSurfaceProvider>
          </PanelInteractionContext.Provider>
        </Portal>
      )}
    </Show>
  );
}


export const FloatingWindow = {
  Root: FloatingWindowRoot,
  Workspace: FloatingWindowWorkspace,
  Header: FloatingWindowHeader,
  Content: FloatingWindowContent,
};
