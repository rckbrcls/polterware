import type { Accessor } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
/**
 * Fluid hover, after fluid-functionalism: ONE highlight per list that glides to the item
 * nearest the pointer, instead of per-row `:hover` fills that blink off between rows.
 *
 *   const hover = createFluidHover(() => listEl);
 *   <div ref={listEl} class="relative" {...hover.handlers}>
 *     <FluidHoverHighlight hover={hover} class="rounded-[var(--radius-item)]" />
 *     <Index each={rows()}>{(row, i) => <button ref={(el) => onCleanup(hover.registerItem(i, el))} class="relative" />}</Index>
 *   </div>
 *
 * The container must be the items' offsetParent (`position: relative`) and the highlight
 * its absolutely positioned child, so both share one coordinate space and scroll together.
 * Keyboard focus (`:focus-visible`) moves the same highlight as the pointer.
 */
import { animate, motionValue } from "motion";
import { prefersReducedMotion } from "./reduced-motion";
import { spring } from "./springs";
import "./fluid-hover.css";

export type FluidHoverAxis = "x" | "y" | "xy";

/** An item's box in the container's layout space (transform-immune offsets). */
export type ItemRect = { top: number; left: number; width: number; height: number };

export type PickNearestInput = {
  axis: FluidHoverAxis;
  /** The pointer, in viewport coordinates. */
  point: { x: number; y: number };
  /** Item rects in the container's layout space; unregistered slots are undefined. */
  rects: readonly (ItemRect | undefined)[];
  /** Maps layout rects into the pointer's viewport space. */
  containerRect: { left: number; top: number; width: number; height: number };
  scroll: { x: number; y: number };
  border: { x: number; y: number };
  /** Layout size of the container, to factor out an ancestor `transform: scale`. */
  layoutSize: { width: number; height: number };
  isDisabled?: (index: number) => boolean;
};

/**
 * The picking rule as one pure function: an item the pointer is inside wins; otherwise
 * the item whose centre is nearest does, so a pointer in a gap, in the padding, or past
 * the last row still lands. `y` and `x` measure one coordinate, `xy` the straight line
 * to each centre. Ties keep the first item.
 */
export function pickNearest(input: PickNearestInput): number | null {
  const { axis, point, rects, containerRect, scroll, border, layoutSize, isDisabled } = input;
  const scaleX = layoutSize.width > 0 ? containerRect.width / layoutSize.width : 1;
  const scaleY = layoutSize.height > 0 ? containerRect.height / layoutSize.height : 1;
  let closest: number | null = null;
  let closestDistance = Infinity;
  let containing: number | null = null;

  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index];
    if (!rect || isDisabled?.(index)) continue;
    const left = containerRect.left + (border.x + rect.left - scroll.x) * scaleX;
    const top = containerRect.top + (border.y + rect.top - scroll.y) * scaleY;
    const width = rect.width * scaleX;
    const height = rect.height * scaleY;
    const insideX = point.x >= left && point.x <= left + width;
    const insideY = point.y >= top && point.y <= top + height;
    const dx = point.x - (left + width / 2);
    const dy = point.y - (top + height / 2);
    let inside: boolean;
    let distance: number;
    if (axis === "xy") {
      inside = insideX && insideY;
      distance = Math.hypot(dx, dy);
    } else if (axis === "x") {
      inside = insideX;
      distance = Math.abs(dx);
    } else {
      inside = insideY;
      distance = Math.abs(dy);
    }
    if (inside) containing = index;
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = index;
    }
  }
  return containing ?? closest;
}

/** Set on the highlighted item (boolean attribute): style lit text off it. */
export const FLUID_HOVER_ACTIVE_ATTR = "data-fluid-hover-active";

const ACTIVATOR_SELECTOR =
  "a[href], button, [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [role='option'], [role='radio'], [role='checkbox'], [role='tab'], [role='link'], [role='button']";
const GAP_CONTROL_SELECTOR =
  "input, textarea, select, button, a, label, summary, [contenteditable], [role='textbox'], [role='searchbox'], [role='button'], [role='switch']";

/** Frames a measurement retries while items have no layout box (a popup not laid out yet). */
const MEASUREMENT_ATTEMPTS = 3;

export type FluidHoverOptions = {
  /** `y` lists (default), `x` strips, `xy` grids. */
  axis?: FluidHoverAxis;
  /** Skips an item without unregistering it (disabled or clipped rows). Keep it cheap. */
  isItemDisabled?: (element: HTMLElement) => boolean;
  /**
   * Route a click in a gap, the padding, or past the last row to the lit item. On by
   * default; `false` keeps empty space inert, `{ maxDistance }` caps it in pixels.
   */
  gapClick?: boolean | { maxDistance?: number };
  /** Keep the lit item when the pointer leaves (a command list, where Enter runs it). */
  keepOnLeave?: boolean;
};

export type FluidHover = {
  activeIndex: Accessor<number | null>;
  /** Drive the highlight from elsewhere (a menu's keyboard highlight). */
  setActiveIndex: (index: number | null) => void;
  /** Forget the pointer, so a keyboard move is not re-picked away when the list scrolls. */
  releasePointer: () => void;
  rects: Accessor<readonly (ItemRect | undefined)[]>;
  /** True once every registered item is measured and no pass is pending. Gate overlays on it. */
  isMeasured: Accessor<boolean>;
  /** Increments on each fresh pointer entry, so the highlight fades in instead of sliding. */
  session: Accessor<number>;
  /** Registers an item; returns its unregister function (pass it to `onCleanup`). */
  registerItem: (index: number, element: HTMLElement) => () => void;
  /** Invalidate rects and measure again (a popup that stays mounted between opens). */
  remeasure: () => void;
  handlers: {
    onPointerEnter: (event: PointerEvent) => void;
    onPointerMove: (event: PointerEvent) => void;
    onPointerLeave: () => void;
    onClick: (event: MouseEvent) => void;
    onFocusIn: (event: FocusEvent) => void;
    onFocusOut: (event: FocusEvent) => void;
  };
};

const sameRect = (a: ItemRect | undefined, b: ItemRect | undefined) =>
  a === b ||
  (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

function resolveActivator(element: HTMLElement): HTMLElement {
  if (element.matches(ACTIVATOR_SELECTOR) || element.hasAttribute("tabindex")) return element;
  return element.querySelector<HTMLElement>(ACTIVATOR_SELECTOR) ?? element;
}

export function createFluidHover(
  container: () => HTMLElement | undefined,
  options: FluidHoverOptions = {},
): FluidHover {
  const axis = options.axis ?? "y";
  const gapClick = options.gapClick ?? true;
  const gapClickMaxDistance =
    typeof gapClick === "object" ? (gapClick.maxDistance ?? Infinity) : Infinity;
  const items = new Map<number, HTMLElement>();
  const [activeIndex, setActiveIndex] = createSignal<number | null>(null);
  const [rects, setRects] = createSignal<readonly (ItemRect | undefined)[]>([]);
  const [isMeasured, setIsMeasured] = createSignal(false);
  const [session, setSession] = createSignal(0);
  let pickFrame: number | null = null;
  let measureFrame: number | null = null;
  let lastPoint: { x: number; y: number } | null = null;

  const isDisabled = (index: number) => {
    const element = items.get(index);
    return !!element && !!options.isItemDisabled?.(element);
  };

  /** Publishes every registered item's rect; false (nothing published) if one has no box. */
  const runMeasurement = () => {
    const root = container();
    if (!root) return false;
    const next: (ItemRect | undefined)[] = [];
    for (const [index, element] of items) {
      const hasLayoutBox =
        element.offsetParent !== null || element.offsetWidth > 0 || element.offsetHeight > 0;
      if (!hasLayoutBox) return false;
      // offset* ignores transforms (a popup mid scale-in). Items inside positioned
      // descendants accumulate those offsets so every rect is in the container's space.
      let top = element.offsetTop;
      let left = element.offsetLeft;
      let ancestor = element.offsetParent as HTMLElement | null;
      while (ancestor && ancestor !== root && root.contains(ancestor)) {
        top += ancestor.offsetTop + ancestor.clientTop;
        left += ancestor.offsetLeft + ancestor.clientLeft;
        ancestor = ancestor.offsetParent as HTMLElement | null;
      }
      next[index] = { top, left, width: element.offsetWidth, height: element.offsetHeight };
    }
    const previous = rects();
    let changed = previous.length !== next.length;
    for (let i = 0; !changed && i < next.length; i++) changed = !sameRect(previous[i], next[i]);
    if (changed) setRects(next);
    // A lit item that left is only dropped here, so a row remounted at the same index
    // (a rebuilt list, a virtualized row) keeps the highlight instead of flickering it.
    const active = activeIndex();
    if (active !== null && !items.has(active)) setActiveIndex(null);
    return true;
  };

  /** The single coalesced pass; the only place readiness turns true. */
  const scheduleMeasurement = (attemptsLeft = MEASUREMENT_ATTEMPTS) => {
    if (measureFrame !== null) cancelAnimationFrame(measureFrame);
    measureFrame = requestAnimationFrame(() => {
      measureFrame = null;
      if (runMeasurement()) setIsMeasured(true);
      else if (attemptsLeft > 1) scheduleMeasurement(attemptsLeft - 1);
    });
  };

  const remeasure = () => {
    setIsMeasured(false);
    scheduleMeasurement();
  };

  const resizeObserver =
    typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => scheduleMeasurement());

  const pick = () => {
    const root = container();
    if (!root || !lastPoint) return;
    setActiveIndex(
      pickNearest({
        axis,
        point: lastPoint,
        rects: rects(),
        containerRect: root.getBoundingClientRect(),
        scroll: { x: root.scrollLeft, y: root.scrollTop },
        border: { x: root.clientLeft, y: root.clientTop },
        layoutSize: { width: root.offsetWidth, height: root.offsetHeight },
        isDisabled: options.isItemDisabled ? isDisabled : undefined,
      }),
    );
  };

  const schedulePick = () => {
    if (pickFrame !== null) cancelAnimationFrame(pickFrame);
    pickFrame = requestAnimationFrame(() => {
      pickFrame = null;
      pick();
    });
  };

  const cancelPick = () => {
    if (pickFrame !== null) cancelAnimationFrame(pickFrame);
    pickFrame = null;
  };

  const registerItem = (index: number, element: HTMLElement) => {
    items.set(index, element);
    resizeObserver?.observe(element);
    if (index === activeIndex()) element.setAttribute(FLUID_HOVER_ACTIVE_ATTR, "");
    // Rows joining or leaving keep the last complete measurement standing until the next
    // pass (a virtualized list scrolling), so a lit highlight never blinks out.
    scheduleMeasurement();
    return () => {
      resizeObserver?.unobserve(element);
      element.removeAttribute(FLUID_HOVER_ACTIVE_ATTR);
      // Another element may already hold this index (a keyed list re-ordered).
      if (items.get(index) !== element) return;
      items.delete(index);
      scheduleMeasurement();
    };
  };

  // The state in the DOM: lit rows style their text off the attribute.
  createEffect(() => {
    const index = activeIndex();
    const element = index === null ? undefined : items.get(index);
    element?.setAttribute(FLUID_HOVER_ACTIVE_ATTR, "");
    onCleanup(() => element?.removeAttribute(FLUID_HOVER_ACTIVE_ATTR));
  });

  onMount(() => {
    const root = container();
    if (!root) return;
    resizeObserver?.observe(root);
    // Rows move under a still pointer when the list scrolls: pick again.
    const onScroll = () => {
      if (lastPoint) schedulePick();
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => root.removeEventListener("scroll", onScroll));
  });

  onCleanup(() => {
    cancelPick();
    if (measureFrame !== null) cancelAnimationFrame(measureFrame);
    resizeObserver?.disconnect();
  });

  const itemIndexOf = (target: Node) => {
    for (const [index, element] of items) if (element.contains(target)) return index;
    return null;
  };

  const releasePointer = () => {
    lastPoint = null;
    cancelPick();
  };

  return {
    activeIndex,
    setActiveIndex,
    releasePointer,
    rects,
    isMeasured,
    session,
    registerItem,
    remeasure,
    handlers: {
      onPointerEnter: (event) => {
        if (event.pointerType !== "mouse") return;
        setSession((value) => value + 1);
      },
      onPointerMove: (event) => {
        // Touch and pen never enter a hover state.
        if (event.pointerType !== "mouse") return;
        lastPoint = { x: event.clientX, y: event.clientY };
        schedulePick();
      },
      onPointerLeave: () => {
        releasePointer();
        if (!options.keepOnLeave) setActiveIndex(null);
      },
      onClick: (event) => {
        const target = event.target as Node | null;
        if (!target || !target.isConnected || gapClick === false) return;
        if (itemIndexOf(target) !== null) return;
        if ((target as Element).closest?.(GAP_CONTROL_SELECTOR)) return;
        const index = activeIndex();
        if (index === null || isDisabled(index)) return;
        const element = items.get(index);
        if (!element) return;
        if (gapClickMaxDistance !== Infinity) {
          const box = element.getBoundingClientRect();
          const dx = Math.max(box.left - event.clientX, 0, event.clientX - box.right);
          const dy = Math.max(box.top - event.clientY, 0, event.clientY - box.bottom);
          if (Math.hypot(dx, dy) > gapClickMaxDistance) return;
        }
        // A real DOM click, so the item's own handlers run as if the pointer were inside.
        resolveActivator(element).click();
      },
      onFocusIn: (event) => {
        const target = event.target as HTMLElement | null;
        if (!target?.matches?.(":focus-visible")) return;
        const index = itemIndexOf(target);
        if (index !== null && !isDisabled(index)) setActiveIndex(index);
      },
      onFocusOut: (event) => {
        const next = event.relatedTarget as Node | null;
        if (options.keepOnLeave || lastPoint || (next && container()?.contains(next))) return;
        setActiveIndex(null);
      },
    },
  };
}

const scrollAnimations = new WeakMap<HTMLElement, { stop: () => void }>();

/**
 * Keyboard scrolling for a command list, decided at the moment of the move: the item stays
 * at the centre of the viewport (as the ends allow) and the viewport travels on the same
 * `spring.fast` as the highlight, so row and fill move together. `toTop` (the first row, a
 * query reset) snaps to the top, heading included. Offsets, never `scrollIntoView`.
 */
export function centerItemInView(
  container: HTMLElement,
  rect: ItemRect,
  options: { toTop?: boolean } = {},
) {
  const max = Math.max(0, container.scrollHeight - container.clientHeight);
  const target = options.toTop
    ? 0
    : Math.min(max, Math.max(0, rect.top + rect.height / 2 - container.clientHeight / 2));
  scrollAnimations.get(container)?.stop();
  scrollAnimations.delete(container);
  if (options.toTop || prefersReducedMotion() || Math.abs(target - container.scrollTop) < 1) {
    container.scrollTop = target;
    return;
  }
  scrollAnimations.set(
    container,
    animate(container.scrollTop, target, {
      ...spring.fast,
      onUpdate: (value) => {
        container.scrollTop = value;
      },
    }),
  );
}

type HighlightFromHover = {
  /** The list's fluid hover: sits on `rects()[activeIndex()]` once measured. */
  hover: Pick<FluidHover, "activeIndex" | "rects" | "isMeasured" | "session">;
  /** Keep the list's state but show nothing (a closed popup). Runs the exit fade. */
  hidden?: boolean;
  rect?: never;
  session?: never;
};

type HighlightFromRect = {
  /** For consumers that resolve their own target (an active marker): `null` hides it. */
  rect: ItemRect | null;
  /** A change fades the highlight in at `from ?? rect` instead of sliding there. */
  session?: number;
  /** Identity of the target (an index or id). Its rect changing while it stays the same is a reflow: snap. */
  targetKey?: number | string | null;
  hover?: never;
  hidden?: never;
};

export type FluidHoverHighlightProps = (HighlightFromHover | HighlightFromRect) & {
  /** Where a fresh session fades in from (a menu's checked row, a nav's active route). */
  from?: ItemRect | null;
  /** Where a hide travels to while it fades (a tab hover pill returning to the selected tab). */
  exitTo?: ItemRect | null;
  class?: string;
  /** Positional transition; defaults to `spring.fast`. `false` snaps (a reflow, not a hover). */
  transition?: typeof spring.fast | typeof spring.moderate | false;
};

/**
 * The one highlight every fluid list renders: an absolute fill pinned to the container's
 * padding corner, travelling on a transform. Width and height are layout values but only
 * change when the target's size does. A new target springs; the same target resized
 * (a reflow, a font swap) snaps. Reduced motion snaps the travel, keeps the fade.
 */
export function FluidHoverHighlight(props: FluidHoverHighlightProps) {
  let element: HTMLDivElement | undefined;
  let mounted = false;
  let visible = false;
  let lastSession: number | undefined;
  let lastKey: number | string | null | undefined;
  const x = motionValue(0);
  const y = motionValue(0);
  const width = motionValue(0);
  const height = motionValue(0);
  const alpha = motionValue(0);
  const values = [x, y, width, height, alpha];
  const fadeIn = { type: "tween", duration: spring.fast.duration, ease: "easeOut" } as const;
  const fadeOut = { type: "tween", ...spring.fast.exit, ease: "easeIn" } as const;

  const paint = () => {
    if (!element) return;
    element.style.width = `${width.get()}px`;
    element.style.height = `${height.get()}px`;
    element.style.transform = `translate3d(${x.get()}px, ${y.get()}px, 0)`;
    element.style.opacity = String(alpha.get());
  };

  const target = () => {
    if (props.hover) {
      const index = props.hover.activeIndex();
      const measured = props.hover.isMeasured();
      const rects = props.hover.rects();
      return {
        rect: !props.hidden && measured && index !== null ? (rects[index] ?? null) : null,
        session: props.hover.session(),
        key: index,
      };
    }
    return { rect: props.rect ?? null, session: props.session, key: props.targetKey };
  };

  const place = (rect: ItemRect, snap: boolean, transition = props.transition || spring.fast) => {
    const pairs = [
      [x, rect.left],
      [y, rect.top],
      [width, rect.width],
      [height, rect.height],
    ] as const;
    if (snap) {
      for (const [value, to] of pairs) {
        value.stop();
        value.set(to);
      }
      return;
    }
    for (const [value, to] of pairs) animate(value, to, transition);
  };

  createEffect(() => {
    const { rect, session, key } = target();
    const from = props.from;
    const exitTo = props.exitTo;
    const snapTravel = !mounted || props.transition === false || prefersReducedMotion();
    if (!rect) {
      if (!mounted) alpha.set(0);
      else {
        if (visible && exitTo && !snapTravel) place(exitTo, false, spring.moderate);
        animate(alpha, 0, fadeOut);
      }
      visible = false;
      return;
    }
    const fresh = !visible || session !== lastSession;
    const reflow = key !== undefined && key === lastKey;
    lastSession = session;
    lastKey = key;
    visible = true;
    if (fresh) {
      // A fresh entry fades in where it lands (or at `from`), never slides from the last row.
      place(from ?? rect, true);
      if (from && !snapTravel) place(rect, false);
      else if (from) place(rect, true);
      if (!mounted) alpha.set(1);
      else animate(alpha, 1, fadeIn);
      return;
    }
    place(rect, snapTravel || reflow);
  });

  onMount(() => {
    const stops = values.map((value) => value.on("change", paint));
    paint();
    const ready = requestAnimationFrame(() => {
      mounted = true;
    });
    onCleanup(() => {
      cancelAnimationFrame(ready);
      for (const stop of stops) stop();
      for (const value of values) value.stop();
    });
  });

  return (
    <div
      ref={element}
      aria-hidden="true"
      data-slot="fluid-hover-highlight"
      class={`pw-fluid-hover-highlight ${props.class ?? ""}`}
    />
  );
}
