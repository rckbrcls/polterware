import { onCleanup } from "solid-js";
/**
 * Spring presence for Ark popup surfaces (menus, popovers, tooltips), after
 * fluid-functionalism's popups: the surface enters on `spring.fast` with a fade, a 4px
 * slide from its anchor, and (menus) a slight vertical scale, and leaves on the quicker
 * `spring.fast.exit` tween. A reopen mid-exit reverses from where the surface is.
 *
 *   const motion = createPopupMotion({ scale: true });
 *   <ArkMenu.Content class="pw-dropdown-presence"><div ref={motion.ref} /></ArkMenu.Content>
 *
 * Ark owns open state, focus, dismissal, and placement; it unmounts on `animationend`,
 * so the Content keeps a CSS "clock" keyframe (see dropdown-menu.css) at least as long as
 * the exit tween. The slide and origin follow the RESOLVED side from `data-placement`,
 * so a popup that flips above its anchor grows upward. Reduced motion keeps the fade only.
 */
import { animate, motionValue } from "motion";
import { prefersReducedMotion } from "./reduced-motion";
import { spring } from "./springs";

/** Distance (px) a popup slides in from its anchor. */
const POPUP_SLIDE = 4;
/** Vertical scale a menu grows from. */
const POPUP_SCALE_FROM = 0.96;

type Pose = { alpha: number; x: number; y: number; scale: number };

function hiddenPose(placement: string | undefined, scale: boolean, reduced: boolean): Pose {
  const side = placement?.split("-")[0] ?? "bottom";
  const slide = reduced ? 0 : POPUP_SLIDE;
  return {
    alpha: 0,
    // Start a little closer to the anchor, then settle away from it.
    x: side === "left" ? slide : side === "right" ? -slide : 0,
    y: side === "top" ? slide : side === "bottom" ? -slide : 0,
    scale: scale && !reduced ? POPUP_SCALE_FROM : 1,
  };
}

const SHOWN: Pose = { alpha: 1, x: 0, y: 0, scale: 1 };

export function createPopupMotion(options: { scale?: boolean } = {}) {
  let surface: HTMLElement | undefined;
  const alpha = motionValue(0);
  const x = motionValue(0);
  const y = motionValue(0);
  const scale = motionValue(1);
  const values = [alpha, x, y, scale];
  const leave = { type: "tween", ...spring.fast.exit, ease: "easeIn" } as const;
  const fadeIn = { type: "tween", duration: spring.fast.duration, ease: "easeOut" } as const;

  const paint = () => {
    if (!surface) return;
    surface.style.opacity = String(alpha.get());
    surface.style.transform = `translate3d(${x.get()}px, ${y.get()}px, 0) scaleY(${scale.get()})`;
  };

  const apply = (open: boolean, placement: string | undefined, first: boolean) => {
    const reduced = prefersReducedMotion();
    const hidden = hiddenPose(placement, Boolean(options.scale), reduced);
    if (first) {
      alpha.set(hidden.alpha);
      x.set(hidden.x);
      y.set(hidden.y);
      scale.set(hidden.scale);
    }
    const to = open ? SHOWN : hidden;
    const travel = open ? spring.fast : leave;
    animate(alpha, to.alpha, open ? fadeIn : leave);
    if (reduced) {
      x.set(to.x);
      y.set(to.y);
      scale.set(to.scale);
      return;
    }
    animate(x, to.x, travel);
    animate(y, to.y, travel);
    animate(scale, to.scale, travel);
  };

  // Runs from `ref`, not onMount: lazy-mounted popups (tooltips) render their surface after
  // the owner has mounted, so `surface` is still unset at onMount time.
  const setup = () => {
    if (!surface) return;
    const element = surface;
    const stops = values.map((value) => value.on("change", paint));
    let observer: MutationObserver | undefined;
    // The ref runs before the surface is attached, so resolve the state host one frame later,
    // which also lets the positioner settle the side before the slide starts.
    const frame = requestAnimationFrame(() => {
      const stateHost = element.hasAttribute("data-state")
        ? element
        : element.parentElement?.closest<HTMLElement>("[data-state]");
      const read = () => stateHost?.getAttribute("data-state") === "open";
      let open = read();
      apply(open, stateHost?.dataset.placement, true);
      observer = new MutationObserver(() => {
        const next = read();
        if (next === open) return;
        open = next;
        apply(open, stateHost?.dataset.placement, false);
      });
      if (stateHost) observer.observe(stateHost, { attributes: true, attributeFilter: ["data-state"] });
    });
    onCleanup(() => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      for (const stop of stops) stop();
      for (const value of values) value.stop();
    });
  };

  return {
    ref: (element: HTMLElement) => {
      surface = element;
      // Hidden until the first frame, so the surface never flashes at full size.
      element.style.opacity = "0";
      setup();
    },
  };
}
