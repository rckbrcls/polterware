/**
 * Measured-height collapse, after fluid-functionalism's Accordion: the region animates to
 * its measured pixel height (never `auto`), opening on `spring.fast` and closing on the
 * quicker exit tween, because a close is a decision already made. Interruptible: a toggle
 * mid-run starts from the height on screen. Reduced motion snaps the height.
 *
 * The element carries its state for CSS: `data-state="open|closed"`, `inert` while
 * closed, and `hidden` once a close has finished. After a run the inline height is
 * cleared, so a child resizing later is followed by layout, never chased by a spring.
 *
 * `fade` also fades the content: it comes in with the height and, on a close, leaves early
 * (an ease-out over the fold's ease-in), so it is gone before the edge cuts it. `tier` picks
 * a slower spring for a larger region (`fast` by default). Reduced motion keeps only the
 * fade in.
 */
import { animate } from "motion";
import { prefersReducedMotion } from "./reduced-motion";
import { spring } from "./springs";

export type CollapseControls = { stop: () => void };

/** Slack past the tween before the fallback settles a run a stalled frame loop never ends. */
const FALLBACK_SLACK_MS = 100;

export function animateCollapse(
  element: HTMLElement,
  open: boolean,
  options: { previous?: CollapseControls; instant?: boolean; fade?: boolean; tier?: "fast" | "moderate" } = {},
): CollapseControls | undefined {
  const wasHidden = element.hidden;
  const from = options.previous ? element.offsetHeight : wasHidden ? 0 : element.scrollHeight;
  options.previous?.stop();

  element.hidden = false;
  if (wasHidden && open) {
    // Leaving display:none has no "before" style: start CSS transitions from closed.
    element.dataset.state = "closed";
    void element.offsetHeight;
  }
  element.dataset.state = open ? "open" : "closed";
  element.inert = !open;

  const to = open ? element.scrollHeight : 0;
  const tier = spring[options.tier ?? "fast"];
  const fromOpacity = wasHidden ? 0 : Number(getComputedStyle(element).opacity);
  const finish = () => {
    element.style.height = "";
    element.style.overflow = "";
    element.style.opacity = "";
    element.hidden = !open;
  };
  if (options.instant || from === to) {
    finish();
    return undefined;
  }
  if (prefersReducedMotion()) {
    finish();
    if (!options.fade || !open) return undefined;
    element.style.opacity = String(fromOpacity);
    const fade = animate(element, { opacity: [fromOpacity, 1] }, tier);
    void fade.finished.then(() => { element.style.opacity = ""; });
    return { stop: () => fade.stop() };
  }

  element.style.overflow = "hidden";
  element.style.height = `${from}px`;
  const transition = open
    ? tier
    : ({ type: "tween", ...tier.exit, ease: "easeIn" } as const);
  const animation = animate(element, { height: [`${from}px`, `${to}px`] }, transition);
  const fade = options.fade
    ? animate(element, { opacity: [fromOpacity, open ? 1 : 0] }, open ? tier : { type: "tween", ...tier.exit, ease: "easeOut" })
    : undefined;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(fallback);
    finish();
  };
  const fallback = window.setTimeout(
    settle,
    (open ? tier.duration : tier.exit.duration) * 1000 + FALLBACK_SLACK_MS,
  );
  void animation.finished.then(settle);

  return {
    stop: () => {
      settled = true;
      window.clearTimeout(fallback);
      animation.stop();
      fade?.stop();
    },
  };
}
