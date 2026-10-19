import { createEffect, onCleanup, onMount, untrack, type Accessor } from "solid-js";
import { panelOwnsTarget, rememberPanelInteraction, type PanelInteractionOwner } from "../panel-interaction";
import { isPanelVisible } from "./panel-visible";

export function createOutsideDismiss(options: {
  root: Accessor<HTMLElement | undefined>;
  enabled: Accessor<boolean>;
  interaction: PanelInteractionOwner;
  suppressClick: Accessor<boolean>;
  close: () => void;
}) {
  // Observe presses without taking capture from controls or canvas gestures.
  let press: { pointerId: number; x: number; y: number; moved: boolean } | undefined;
  let ignoreClick = false;
  let clickReset: number | undefined;
  function reset() {
    press = undefined; ignoreClick = false;
    if (clickReset !== undefined) cancelAnimationFrame(clickReset);
    clickReset = undefined;
  }
  function resetAfterRelease() {
    if (clickReset !== undefined) cancelAnimationFrame(clickReset);
    clickReset = requestAnimationFrame(() => { ignoreClick = false; clickReset = undefined; });
  }
  function trackPress(event: PointerEvent) {
    rememberPanelInteraction(event.target);
    if (event.button !== 0 || event.isPrimary === false) return;
    reset();
    if (options.enabled() && isPanelVisible(options.root(), { allowModalBackground: true })) press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }
  function trackMove(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 3) press.moved = true;
  }
  function releasePress(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    trackMove(event); ignoreClick = press.moved; press = undefined;
    resetAfterRelease();
  }
  function cancelPress(event?: PointerEvent) {
    if (!press || (event && event.pointerId !== press.pointerId)) return;
    press = undefined; ignoreClick = true;
    resetAfterRelease();
  }
  function trackScroll() { if (press) press.moved = true; }
  function onClick(event: MouseEvent) {
    rememberPanelInteraction(event.target);
    if (!options.enabled() || event.defaultPrevented || !isPanelVisible(options.root(), { allowModalBackground: true })) return;
    const fromPointer = event.detail > 0 || ("pointerType" in event && Boolean(event.pointerType));
    if (fromPointer && (ignoreClick || press?.moved || options.suppressClick())) return;
    if (panelOwnsTarget(options.interaction, event.target) || (event.target instanceof Element && event.target.closest("[data-detail-opener]"))) return;
    options.close();
  }

  createEffect(() => { if (!options.enabled()) untrack(reset); });
  onMount(() => {
    const rememberFocus = (event: FocusEvent) => rememberPanelInteraction(event.target);
    const cancelOnBlur = () => cancelPress();
    document.addEventListener("pointerdown", trackPress, true);
    document.addEventListener("pointermove", trackMove, true);
    document.addEventListener("pointerup", releasePress, true);
    document.addEventListener("pointercancel", cancelPress, true);
    document.addEventListener("lostpointercapture", cancelPress, true);
    document.addEventListener("scroll", trackScroll, true);
    document.addEventListener("wheel", trackScroll, { capture: true, passive: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", rememberFocus);
    window.addEventListener("blur", cancelOnBlur);
    onCleanup(() => {
      reset();
      document.removeEventListener("pointerdown", trackPress, true);
      document.removeEventListener("pointermove", trackMove, true);
      document.removeEventListener("pointerup", releasePress, true);
      document.removeEventListener("pointercancel", cancelPress, true);
      document.removeEventListener("lostpointercapture", cancelPress, true);
      document.removeEventListener("scroll", trackScroll, true);
      document.removeEventListener("wheel", trackScroll, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", rememberFocus);
      window.removeEventListener("blur", cancelOnBlur);
    });
  });
  return { reset };
}
