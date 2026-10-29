import type { JSX } from "solid-js";
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
/**
 * Toggle switch: **Ark UI Switch** (behavior) + fluid thumb motion (look).
 * The thumb stretches on hover, squashes on press, follows the pointer on drag,
 * and settles on the shared `spring.moderate` (Motion, vanilla).
 * Use for on/off settings; selection lists use `CheckboxRow`.
 */
import { Switch as ArkSwitch } from "@ark-ui/solid/switch";
import { animate, motionValue } from "motion";
import { prefersReducedMotion } from "./reduced-motion";
import { spring } from "./springs";
import "./switch.css";

export type SwitchSize = "sm" | "default";

export type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  value?: string;
  size?: SwitchSize;
  class?: string;
  "aria-label"?: string;
};

export type SwitchRowProps = SwitchProps & {
  label: JSX.Element;
  leading?: JSX.Element;
  trailing?: JSX.Element;
};

/** Pointer travel (px) before a press becomes a drag. */
const DRAG_DEAD_ZONE = 2;

/**
 * Thumb geometry per size, matching the track in `switch.css`. Hover stretches the
 * thumb by `hoverExtend`; press stretches it by `pressExtend` and squashes it by `squash`.
 */
const METRICS = {
  default: { track: 38, thumb: 16, offset: 3, hoverExtend: 2, pressExtend: 4, squash: 4 },
  sm: { track: 30, thumb: 12, offset: 3, hoverExtend: 2, pressExtend: 3, squash: 3 },
} as const;

/**
 * Fluid switch gesture, after fluid-functionalism. The thumb's x, y, width, and height are
 * Motion values springing on `spring.moderate`; hover stretches it, press squashes it, and
 * a new target interrupts the last one with its velocity kept. Drag-to-toggle: the thumb
 * follows the pointer and snaps to on/off at the track midpoint on release. A click that
 * follows a drag is swallowed so it cannot toggle twice.
 */
function createSwitchGesture(props: SwitchProps) {
  const [pressed, setPressed] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);
  let root: HTMLElement | undefined;
  let thumb: HTMLElement | undefined;
  let start: { clientX: number; originX: number } | undefined;
  let dragging = false;
  let didDrag = false;
  let mounted = false;
  const x = motionValue(0);
  const y = motionValue(0);
  const width = motionValue(0);
  const height = motionValue(0);

  const m = () => METRICS[props.size ?? "default"];
  const restX = (checked: boolean, extend: number) => {
    const { track, thumb: size, offset } = m();
    // Checked: the thumb stretches leftward so it stays flush with the right edge.
    return checked ? track - offset - size - extend : offset;
  };
  const dragBounds = () => {
    const { track, thumb: size, offset, pressExtend } = m();
    return { min: offset, max: track - offset - size - pressExtend };
  };

  const paint = () => {
    if (!thumb) return;
    thumb.style.width = `${width.get()}px`;
    thumb.style.height = `${height.get()}px`;
    thumb.style.transform = `translate3d(${x.get()}px, ${y.get()}px, 0)`;
  };

  const settleX = () => {
    const { hoverExtend, pressExtend } = m();
    const extend = pressed() ? pressExtend : hovered() ? hoverExtend : 0;
    animate(x, restX(props.checked, extend), spring.moderate);
  };

  createEffect(() => {
    const { thumb: size, offset, hoverExtend, pressExtend, squash } = m();
    const extend = pressed() ? pressExtend : hovered() ? hoverExtend : 0;
    const squeeze = pressed() ? squash : 0;
    const targets = [
      [width, size + extend],
      [height, size - squeeze],
      [y, offset + squeeze / 2],
    ] as const;
    const targetX = restX(props.checked, extend);
    if (!mounted || prefersReducedMotion()) {
      for (const [value, target] of targets) value.set(target);
      if (!dragging) x.set(targetX);
      return;
    }
    for (const [value, target] of targets) animate(value, target, spring.moderate);
    if (!dragging) animate(x, targetX, spring.moderate);
  });

  const swallowClick = (event: Event) => {
    if (!didDrag) return;
    event.preventDefault();
    event.stopPropagation();
  };

  onMount(() => {
    // The effect above snapped to the initial state; springs run only after first paint.
    const stops = [x, y, width, height].map((value) => value.on("change", paint));
    paint();
    const ready = requestAnimationFrame(() => {
      mounted = true;
    });
    root?.addEventListener("click", swallowClick, true);
    onCleanup(() => {
      cancelAnimationFrame(ready);
      for (const stop of stops) stop();
      for (const value of [x, y, width, height]) value.stop();
      root?.removeEventListener("click", swallowClick, true);
    });
  });

  const finish = (commit: boolean) => {
    if (!start) return;
    const wasDragging = dragging;
    const releasedAt = x.get();
    start = undefined;
    dragging = false;
    setPressed(false);
    if (!wasDragging) return;
    didDrag = true;
    requestAnimationFrame(() => {
      didDrag = false;
    });
    if (commit) {
      const { min, max } = dragBounds();
      const shouldBeOn = releasedAt > (min + max) / 2;
      if (shouldBeOn !== props.checked) props.onCheckedChange(shouldBeOn);
    }
    // Spring from where the thumb was released to its resting place.
    settleX();
  };

  return {
    rootRef: (el: HTMLElement) => {
      root = el;
    },
    thumbRef: (el: HTMLElement) => {
      thumb = el;
    },
    rootHandlers: {
      onPointerEnter: (event: PointerEvent) => {
        if (event.pointerType === "mouse") setHovered(true);
      },
      onPointerLeave: () => setHovered(false),
      onPointerDown: (event: PointerEvent) => {
        if (props.disabled) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const { min, max } = dragBounds();
        start = { clientX: event.clientX, originX: props.checked ? max : min };
        setPressed(true);
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: PointerEvent) => {
        if (!start) return;
        const delta = event.clientX - start.clientX;
        if (!dragging) {
          if (Math.abs(delta) < DRAG_DEAD_ZONE) return;
          dragging = true;
        }
        const { min, max } = dragBounds();
        x.stop();
        x.set(Math.max(min, Math.min(max, start.originX + delta)));
      },
      onPointerUp: () => finish(true),
      onPointerCancel: () => finish(false),
    },
  };
}

function SwitchControl(props: {
  size: SwitchSize;
  ariaLabel?: string;
  gesture: ReturnType<typeof createSwitchGesture>;
}) {
  return (
    <>
      <ArkSwitch.HiddenInput aria-label={props.ariaLabel} />
      <ArkSwitch.Control
        class="pw-switch__control"
        data-size={props.size}
      >
        <ArkSwitch.Thumb ref={props.gesture.thumbRef} class="pw-switch__thumb" />
      </ArkSwitch.Control>
    </>
  );
}

/** Standalone switch; pair with your own label or pass `aria-label`. */
export function Switch(props: SwitchProps) {
  const gesture = createSwitchGesture(props);
  return (
    <ArkSwitch.Root
      ref={gesture.rootRef}
      class={`pw-switch ${props.class ?? ""}`}
      checked={props.checked}
      disabled={props.disabled}
      name={props.name}
      value={props.value}
      onCheckedChange={(details) => props.onCheckedChange(details.checked)}
      {...gesture.rootHandlers}
    >
      <SwitchControl size={props.size ?? "default"} ariaLabel={props["aria-label"]} gesture={gesture} />
    </ArkSwitch.Root>
  );
}

/** Row with label and switch on the right, for settings, popovers, and selection lists. */
export function SwitchRow(props: SwitchRowProps) {
  const gesture = createSwitchGesture(props);
  return (
    <ArkSwitch.Root
      ref={gesture.rootRef}
      class={`pw-switch-row ${props.class ?? ""}`}
      checked={props.checked}
      disabled={props.disabled}
      name={props.name}
      value={props.value}
      onCheckedChange={(details) => props.onCheckedChange(details.checked)}
      {...gesture.rootHandlers}
    >
      <Show when={props.leading}>
        <span class="pw-switch-row__side">{props.leading}</span>
      </Show>
      <ArkSwitch.Label class="pw-switch-row__label">{props.label}</ArkSwitch.Label>
      <Show when={props.trailing}>
        <span class="pw-switch-row__side">{props.trailing}</span>
      </Show>
      <SwitchControl size={props.size ?? "default"} ariaLabel={props["aria-label"]} gesture={gesture} />
    </ArkSwitch.Root>
  );
}
