import {
  Show,
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  on,
  onCleanup,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import { animate, motionValue, type AnimationPlaybackControls } from "motion";
import { Button, type ButtonProps } from "./button";
import { FloatingSurfaceProvider } from "./floating-surface";
import { prefersReducedMotion } from "./reduced-motion";
import { spring } from "./springs";
import { Tooltip } from "./tooltip";
import "./morph.css";

/**
 * Morph: a button that turns into a small panel in place, after cult-ui's Popover.
 * Use it for a confirm or a short input that belongs to one button ("Move to Later?",
 * pick an answer); app-level destructive confirms stay on `requestConfirm`.
 *
 *   <Morph.Root>
 *     <Morph.Trigger hint="What the button does">Later</Morph.Trigger>
 *     <Morph.Panel title="Move to Later?">
 *       <Morph.Body>What happens.</Morph.Body>
 *       <Morph.Footer><Morph.Close /><Button variant="primary">Move to Later</Button></Morph.Footer>
 *     </Morph.Panel>
 *   </Morph.Root>
 *
 * The panel grows from the trigger's rect to its own on `spring.slow` and plays back on the
 * exit tween; the trigger hides while the panel stands in for it. The panel opens upward from
 * the trigger's bottom edge (triggers live in footers). Escape, a pointerdown outside, and
 * Close dismiss it; focus moves into the panel and returns to the trigger.
 */

/** Gap (px) the panel keeps from the window edges. */
const EDGE = 8;
const DEFAULT_WIDTH = 320;

type MorphContextValue = {
  open: Accessor<boolean>;
  setOpen: (open: boolean) => void;
  anchor: Accessor<HTMLElement | undefined>;
  setAnchor: (element: HTMLElement) => void;
  /** True from open until the exit morph ends; the trigger stays hidden meanwhile. */
  shown: Accessor<boolean>;
  setShown: (shown: boolean) => void;
  titleId: string;
};

const MorphContext = createContext<MorphContextValue>();

function useMorphContext(part: string): MorphContextValue {
  const context = useContext(MorphContext);
  if (!context) throw new Error(`Morph.${part} must be used inside Morph.Root`);
  return context;
}

/** Open state and close for content inside a Morph (for example to close after a write). */
export function useMorph(): { open: Accessor<boolean>; close: () => void } {
  const context = useMorphContext("useMorph");
  return { open: context.open, close: () => context.setOpen(false) };
}

export type MorphRootProps = {
  children: JSX.Element;
  /** Controlled open state; leave it out to let the trigger own it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function MorphRoot(props: MorphRootProps) {
  const [inner, setInner] = createSignal(false);
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  const [shown, setShown] = createSignal(false);
  const open = () => props.open ?? inner();
  const context: MorphContextValue = {
    open,
    setOpen: (next) => {
      if (next === open()) return;
      if (props.open === undefined) setInner(next);
      props.onOpenChange?.(next);
    },
    anchor,
    setAnchor,
    shown,
    setShown,
    titleId: `pw-morph-${createUniqueId()}`,
  };
  return <MorphContext.Provider value={context}>{props.children}</MorphContext.Provider>;
}

export type MorphTriggerProps = ButtonProps & {
  /** Tooltip that says what the button does; shown on hover and focus while the panel is closed. */
  hint?: JSX.Element;
};

function MorphTrigger(props: MorphTriggerProps) {
  const context = useMorphContext("Trigger");
  const [local, rest] = splitProps(props, ["hint", "class", "onClick"]);
  const attrs = (): ButtonProps => ({
    ...rest,
    class: "pw-morph-trigger",
    "aria-haspopup": "dialog",
    "aria-expanded": context.open(),
    onClick: (event) => {
      if (typeof local.onClick === "function") (local.onClick as (event: MouseEvent) => void)(event);
      if (!event.defaultPrevented) context.setOpen(true);
    },
  });
  return (
    <span
      ref={context.setAnchor}
      class={`pw-morph-anchor ${local.class ?? ""}`}
      data-morphed={context.shown() ? "" : undefined}
    >
      <Show when={local.hint} fallback={<Button {...attrs()} />}>
        <Tooltip.Root disabled={rest.disabled || context.shown()}>
          <Tooltip.Trigger asChild={(triggerProps) => <Button {...(triggerProps(attrs()) as ButtonProps)} />} />
          <Tooltip.Content class="pw-morph-hint">{local.hint}</Tooltip.Content>
        </Tooltip.Root>
      </Show>
    </span>
  );
}

export type MorphPanelProps = {
  title: JSX.Element;
  children: JSX.Element;
  /** Panel width in px (default 320), clamped to the window. */
  width?: number;
  class?: string;
};

type Rect = { x: number; y: number; width: number; height: number; radius: number };

function MorphPanel(props: MorphPanelProps) {
  const context = useMorphContext("Panel");
  const [mounted, setMounted] = createSignal(false);
  let panel: HTMLDivElement | undefined;
  let content: HTMLDivElement | undefined;
  const x = motionValue(0);
  const y = motionValue(0);
  const width = motionValue(0);
  const height = motionValue(0);
  const radius = motionValue(0);
  const alpha = motionValue(0);
  let running: AnimationPlaybackControls[] = [];

  const paint = () => {
    if (!panel) return;
    panel.style.transform = `translate3d(${x.get()}px, ${y.get()}px, 0)`;
    panel.style.width = `${width.get()}px`;
    panel.style.height = `${height.get()}px`;
    panel.style.borderRadius = `${radius.get()}px`;
    if (content) content.style.opacity = String(alpha.get());
  };
  const unsubscribe = [x, y, width, height, radius, alpha].map((value) => value.on("change", paint));
  onCleanup(() => {
    unsubscribe.forEach((stop) => stop());
    running.forEach((controls) => controls.stop());
  });

  const anchorRect = (): Rect => {
    const anchor = context.anchor();
    const box = anchor?.getBoundingClientRect() ?? new DOMRect();
    const button = anchor?.querySelector("button");
    const corner = button ? Number.parseFloat(getComputedStyle(button).borderTopLeftRadius) : 0;
    return { x: box.left, y: box.top, width: box.width, height: box.height, radius: Number.isFinite(corner) ? corner : 0 };
  };

  /** The panel's own rect: its width, its content's height, bottom-aligned to the trigger and kept on screen. */
  const targetRect = (from: Rect): Rect => {
    const panelWidth = Math.min(props.width ?? DEFAULT_WIDTH, window.innerWidth - EDGE * 2);
    if (content) content.style.width = `${panelWidth}px`;
    const panelHeight = Math.min(content?.scrollHeight ?? 0, window.innerHeight - EDGE * 2);
    const left = Math.min(Math.max(from.x, EDGE), window.innerWidth - panelWidth - EDGE);
    const top = Math.max(from.y + from.height - panelHeight, EDGE);
    const corner = panel ? Number.parseFloat(getComputedStyle(panel).getPropertyValue("--pw-morph-radius")) : NaN;
    return { x: left, y: top, width: panelWidth, height: panelHeight, radius: Number.isFinite(corner) ? corner : 12 };
  };

  const play = (to: Rect, opening: boolean) => {
    running.forEach((controls) => controls.stop());
    const reduced = prefersReducedMotion();
    const travel = opening ? spring.slow : ({ type: "tween", ...spring.slow.exit, ease: "easeIn" } as const);
    const fade = opening
      ? ({ type: "tween", duration: spring.fast.duration, ease: "easeOut", delay: reduced ? 0 : spring.fast.duration } as const)
      : ({ type: "tween", ...spring.fast.exit, ease: "easeIn" } as const);
    const geometry: [typeof x, number][] = [[x, to.x], [y, to.y], [width, to.width], [height, to.height], [radius, to.radius]];
    if (reduced) {
      // Reduced motion: the panel appears in place and only its content fades.
      for (const [value, target] of geometry) value.jump(opening ? target : value.get());
      running = [animate(alpha, opening ? 1 : 0, fade)];
      return running[0]!;
    }
    running = [...geometry.map(([value, target]) => animate(value, target, travel)), animate(alpha, opening ? 1 : 0, fade)];
    return running[0]!;
  };

  const focusInside = () => {
    const target = panel?.querySelector<HTMLElement>("[data-autofocus]")
      ?? panel?.querySelector<HTMLElement>("button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])");
    target?.focus();
  };

  const enter = () => {
    if (!panel) return;
    const from = anchorRect();
    if (alpha.get() === 0) {
      x.jump(from.x);
      y.jump(from.y);
      width.jump(from.width);
      height.jump(from.height);
      radius.jump(from.radius);
    }
    paint();
    play(targetRect(from), true);
    focusInside();
  };

  const leave = () => {
    const hadFocus = panel?.contains(document.activeElement) ?? false;
    const controls = play(anchorRect(), false);
    void controls.finished.catch(() => undefined).then(() => {
      if (context.open()) return;
      setMounted(false);
      context.setShown(false);
      if (hadFocus) context.anchor()?.querySelector("button")?.focus();
    });
  };

  createEffect(on(context.open, (open) => {
    if (open) {
      context.setShown(true);
      if (mounted()) enter();
      else setMounted(true);
    } else if (mounted()) leave();
  }));

  // Dismissal: a pointerdown outside the panel and its trigger, and window resizes.
  createEffect(() => {
    if (!context.open()) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (panel?.contains(target) || context.anchor()?.contains(target))) return;
      context.setOpen(false);
    };
    const resize = () => context.setOpen(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", resize);
    onCleanup(() => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", resize);
    });
  });

  return (
    <Show when={mounted()}>
      <Portal>
        <div
          ref={(element) => {
            panel = element;
            queueMicrotask(enter);
          }}
          role="dialog"
          aria-labelledby={context.titleId}
          class={`pw-morph-panel surface-panel-float ${props.class ?? ""}`}
          // Keys stay inside the panel, so page shortcuts (H, D, J/K) do not act behind it.
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              context.setOpen(false);
            }
          }}
        >
          <FloatingSurfaceProvider>
            <div ref={content} class="pw-morph-content">
              <h2 id={context.titleId} class="pw-morph-title">{props.title}</h2>
              {props.children}
            </div>
          </FloatingSurfaceProvider>
        </div>
      </Portal>
    </Show>
  );
}

function MorphBody(props: { children: JSX.Element; class?: string }) {
  return <div class={`pw-morph-body ${props.class ?? ""}`}>{props.children}</div>;
}

function MorphFooter(props: { children: JSX.Element; class?: string }) {
  return <div class={`pw-morph-footer ${props.class ?? ""}`}>{props.children}</div>;
}

/** Closes the panel without acting. */
function MorphClose(props: { children?: JSX.Element }) {
  const context = useMorphContext("Close");
  return (
    <Button size="sm" variant="texture" onClick={() => context.setOpen(false)}>
      {props.children ?? "Cancel"}
    </Button>
  );
}

export const Morph = {
  Root: MorphRoot,
  Trigger: MorphTrigger,
  Panel: MorphPanel,
  Body: MorphBody,
  Footer: MorphFooter,
  Close: MorphClose,
};
