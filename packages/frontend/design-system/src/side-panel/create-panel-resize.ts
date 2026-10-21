import { createEffect, createSignal, onCleanup, onMount, untrack, type Accessor } from "solid-js";
import { DETAIL_PANEL_DEFAULT_WIDTH, DETAIL_PANEL_MAX_WIDTH, DETAIL_PANEL_MIN_WIDTH, clampDetailPanelWidth } from "./panel-width";

export function createPanelResize(options: {
  root: Accessor<HTMLElement | undefined>;
  enabled: Accessor<boolean>;
  preferredWidth: Accessor<number>;
  panelWidth: Accessor<number>;
  hostWidth: Accessor<number>;
  setPreferredWidth: (width: number) => void;
  persistWidth: (width: number) => void;
}) {
  const [gesturing, setGesturing] = createSignal(false);
  let cancelResize: (() => void) | undefined;
  let suppressClick = false;
  let clickReset: number | undefined;

  function beginResize(event: PointerEvent) {
    if (!options.enabled() || event.button !== 0 || cancelResize) return;
    event.preventDefault(); event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const pointerId = event.pointerId, startX = event.clientX;
    const saved = options.preferredWidth(), start = options.panelWidth();
    let moved = false;
    handle.focus({ preventScroll: true }); handle.setPointerCapture(pointerId);
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const dx = next.clientX - startX;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true; setGesturing(true);
      options.setPreferredWidth(clampDetailPanelWidth(start - dx, options.hostWidth()));
    };
    const finish = (commit: boolean) => {
      handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel); handle.removeEventListener("lostpointercapture", cancel);
      cancelResize = undefined;
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      if (moved) {
        if (commit) options.persistWidth(options.panelWidth()); else options.setPreferredWidth(saved);
        suppressClick = true;
        if (clickReset !== undefined) cancelAnimationFrame(clickReset);
        clickReset = requestAnimationFrame(() => { suppressClick = false; clickReset = undefined; });
      }
      setGesturing(false);
    };
    const up = (next: PointerEvent) => { if (next.pointerId === pointerId) finish(true); };
    const cancel = (next: PointerEvent) => { if (next.pointerId === pointerId) finish(false); };
    cancelResize = () => finish(false);
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel); handle.addEventListener("lostpointercapture", cancel);
  }
  function resizeByKey(event: KeyboardEvent) {
    if (!options.enabled() || cancelResize || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? 64 : 16;
    const next = event.key === "ArrowLeft" ? options.panelWidth() + step : event.key === "ArrowRight" ? options.panelWidth() - step
      : event.key === "Home" ? DETAIL_PANEL_MIN_WIDTH : event.key === "End" ? DETAIL_PANEL_MAX_WIDTH : undefined;
    if (next === undefined) return;
    event.preventDefault(); event.stopPropagation(); options.persistWidth(clampDetailPanelWidth(next, options.hostWidth()));
  }
  function resetWidth() {
    if (options.enabled()) options.persistWidth(clampDetailPanelWidth(DETAIL_PANEL_DEFAULT_WIDTH, options.hostWidth()));
  }
  const cancel = () => cancelResize?.();
  createEffect(() => { if (!options.enabled()) untrack(cancel); });
  onMount(() => {
    const root = options.root();
    const swallow = (event: MouseEvent) => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); } };
    root?.addEventListener("click", swallow, true);
    window.addEventListener("blur", cancel);
    onCleanup(() => {
      cancel();
      if (clickReset !== undefined) cancelAnimationFrame(clickReset);
      root?.removeEventListener("click", swallow, true);
      window.removeEventListener("blur", cancel);
    });
  });
  return { gesturing, beginResize, resizeByKey, resetWidth, cancel, active: () => Boolean(cancelResize), suppressClick: () => suppressClick };
}
