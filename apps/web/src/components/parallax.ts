import { onCleanup } from "solid-js";
import { animate, scroll } from "motion";

/**
 * Ref callback that drifts an element by +/-`distance` px while it crosses the viewport.
 * Different distances on siblings give the layered depth; reduced motion keeps it still.
 */
export function parallax(distance: number) {
  return (el: HTMLElement) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stop = scroll(animate(el, { y: [distance, -distance] }, { ease: "linear" }), {
      target: el,
      offset: ["start end", "end start"],
    });
    onCleanup(stop);
  };
}
