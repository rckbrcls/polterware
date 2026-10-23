import { onCleanup, onMount } from "solid-js";
import { animate, inView, scroll, stagger } from "motion";
import { prefersReducedMotion, spring } from "@polterware/frontend-design-system";

// The hero and the product shot share the first half screen of page scroll, so the
// hand-off between them reads as one gesture. A range on the document (not a named
// offset on the element) keeps Motion driving the transforms in JS.
// Built per call: `document` does not exist while the page is rendered on the server.
const firstScroll = (): Parameters<typeof scroll>[1] => ({ target: document.documentElement, offset: ["0 0", "50vh 0"] });

/** Ref: the hero copy lifts away and fades as the product shot takes over the screen. */
export function heroExit() {
  return (el: HTMLElement) => {
    const keyframes = prefersReducedMotion() ? { opacity: [1, 0] } : { opacity: [1, 0], y: [0, -48] };
    onCleanup(scroll(animate(el, keyframes, { ease: "linear" }), firstScroll()));
  };
}

/** Ref: the product window starts tilted back and lies flat as the page scrolls to it. */
export function settle() {
  return (el: HTMLElement) => {
    if (prefersReducedMotion()) return;
    onCleanup(scroll(animate(el, { rotateX: [14, 0], scale: [0.92, 1] }, { ease: "linear" }), firstScroll()));
  };
}

type RevealOptions = {
  /** Reveal the direct children one after another instead of the element as a whole. */
  stagger?: boolean;
  /** Slide in sideways from this many px (a visual beside its copy) instead of rising. */
  x?: number;
};

/**
 * Ref: the element arrives once, the first time a quarter of it is on screen.
 * Reduced motion keeps the fade and drops the travel.
 */
export function reveal({ stagger: sequence = false, x = 0 }: RevealOptions = {}) {
  return (el: HTMLElement) => {
    onMount(() => {
      const targets = sequence ? Array.from(el.children) : [el];
      const travel = prefersReducedMotion() ? {} : x ? { x } : { y: 24 };
      animate(targets, { opacity: 0, ...travel }, { duration: 0 });
      const stop = inView(el, () => {
        animate(targets, { opacity: 1, x: 0, y: 0 }, { ...spring.slow, delay: stagger(0.08) });
      }, { amount: 0.25 });
      onCleanup(stop);
    });
  };
}
