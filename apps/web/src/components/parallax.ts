import { onCleanup } from "solid-js";
import { animate, scroll } from "motion";

type Options = {
  /** Start neutral at the top of the page and drift up on scroll (for the hero). */
  fromTop?: boolean;
  /** Also fade and scale the element in as it enters the viewport. */
  reveal?: boolean;
};

/**
 * Ref callback that moves an element by up to `distance` px while it crosses the viewport.
 * Different distances on siblings give the layered depth; reduced motion keeps it still.
 */
export function parallax(distance: number, { fromTop = false, reveal = false }: Options = {}) {
  return (el: HTMLElement) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const keyframes: Record<string, number[]> = { y: fromTop ? [0, -distance] : [distance, -distance] };
    if (reveal) {
      keyframes.opacity = [0, 1, 1];
      keyframes.scale = [0.92, 1, 1];
    }
    const stop = scroll(
      animate(el, keyframes, {
        ease: "linear",
        opacity: { ease: "linear", times: [0, 0.3, 1] },
        scale: { ease: "linear", times: [0, 0.3, 1] },
      }),
      { target: el, offset: fromTop ? ["start start", "end start"] : ["start end", "end start"] },
    );
    onCleanup(stop);
  };
}
