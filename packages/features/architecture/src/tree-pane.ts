import { createEffect, onCleanup, type Accessor } from "solid-js";
import { animate } from "motion";
import { prefersReducedMotion, spring } from "@polterware/frontend-design-system";

/** The tree pane's open width (the 280px card plus its 8px left inset), from structure.css. */
export const TREE_PANE_WIDTH = 288;
const TREE_PANE_INSET = 8;

/**
 * Opens and closes the Structure tree pane like a document's properties rail: its width closes
 * on `spring.slow` (a quicker tween out) while the card, kept at full width, slides 16px to the
 * left and fades, so the document glides into the room instead of jumping. Snaps on first paint;
 * under reduced motion only the fade remains. A closed pane stays mounted, hidden and inert.
 */
export function createTreePane(pane: Accessor<HTMLElement | undefined>, open: Accessor<boolean>) {
  let controls: { stop: () => void } | undefined;
  let first = true;
  createEffect(() => {
    const element = pane();
    const visible = open();
    if (!element) return;
    controls?.stop();
    const inner = element.firstElementChild as HTMLElement | null;
    const settle = () => {
      element.style.width = visible ? "" : "0px";
      element.style.paddingLeft = visible ? "" : "0px";
      element.style.visibility = visible ? "" : "hidden";
      element.inert = !visible;
      if (inner) { inner.style.opacity = ""; inner.style.transform = ""; }
    };
    if (first) { first = false; settle(); return; }
    // A hidden pane starts its fade from nothing, not from the cleared opacity it settled with.
    const fromOpacity = element.style.visibility === "hidden" || !inner ? 0 : Number(getComputedStyle(inner).opacity);
    element.style.visibility = "";
    element.inert = !visible;
    const reduced = prefersReducedMotion();
    const from = element.getBoundingClientRect().width;
    const transition = visible ? spring.slow : ({ type: "tween", ...spring.slow.exit } as const);
    const fadeTransition = reduced ? (visible ? spring.fast : ({ type: "tween", ...spring.fast.exit } as const)) : transition;
    const runs = [
      ...(reduced ? [] : [animate(element, { width: [`${from}px`, `${visible ? TREE_PANE_WIDTH : 0}px`], paddingLeft: [`${Math.min(TREE_PANE_INSET, from)}px`, `${visible ? TREE_PANE_INSET : 0}px`] }, transition)]),
      ...(inner ? [animate(inner, { opacity: [fromOpacity, visible ? 1 : 0], ...(reduced ? {} : { x: [visible && from === 0 ? -16 : 0, visible ? 0 : -16] }) }, fadeTransition)] : []),
    ];
    if (reduced) { element.style.width = visible ? "" : "0px"; element.style.paddingLeft = visible ? "" : "0px"; }
    const current = { stop: () => runs.forEach((run) => run.stop()) };
    controls = current;
    void Promise.all(runs.map((run) => run.finished)).then(() => { if (controls === current) settle(); });
  });
  onCleanup(() => controls?.stop());
}
