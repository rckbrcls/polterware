import { batch, createEffect, createSignal, onCleanup, onMount, untrack, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";
import { animate, motionValue, type AnimationPlaybackControls } from "motion";
import { prefersReducedMotion } from "../reduced-motion";
import { spring } from "../springs";

export type PanelExitGeometry = { width: number; expanded: boolean };

export function createPanelPresence(options: {
  frame: Accessor<HTMLElement | undefined>;
  visible: Accessor<boolean>;
  available: Accessor<boolean>;
  expanded: Accessor<boolean>;
  panelWidth: Accessor<number>;
}) {
  const [present, setPresent] = createSignal(options.visible());
  const [exitGeometry, setExitGeometry] = createSignal<PanelExitGeometry>();
  const offset = motionValue(0), opacity = motionValue(options.visible() ? 1 : 0);
  let lastOpen = options.visible(), lastExpanded = options.expanded();
  let ready = false, disposed = false, run = 0;
  let timer: number | undefined;
  let animations: AnimationPlaybackControls[] = [];

  function paint() {
    const frame = options.frame();
    if (frame) { frame.style.transform = `translate3d(${offset.get()}px, 0, 0)`; frame.style.opacity = String(opacity.get()); }
  }
  function stop() {
    run++;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    animations.forEach((control) => control.stop());
    animations = [];
  }

  createEffect(() => {
    const open = options.visible(), full = options.expanded();
    if (!options.frame() || isServer) return;
    const changed = open !== lastOpen || full !== lastExpanded;
    const previousExpanded = lastExpanded;
    lastOpen = open; lastExpanded = full;
    if (!options.available()) {
      stop(); offset.set(0); opacity.set(0);
      batch(() => { setPresent(false); setExitGeometry(undefined); });
      return;
    }
    if (!changed) return;
    stop();
    if (open) {
      batch(() => { setPresent(true); setExitGeometry(undefined); });
      if (!ready) { offset.set(0); opacity.set(1); }
      else if (prefersReducedMotion()) {
        offset.set(0);
        animations = [animate(opacity, 1, spring.fast)];
      } else {
        if (opacity.get() === 0) offset.set(16);
        animations = [animate(offset, 0, spring.slow), animate(opacity, 1, spring.slow)];
      }
    } else {
      setExitGeometry({ width: untrack(options.panelWidth), expanded: previousExpanded });
      const currentRun = run;
      const reduced = prefersReducedMotion();
      const finish = () => {
        if (disposed || currentRun !== run || options.visible()) return;
        stop(); offset.set(reduced ? 0 : 16); opacity.set(0);
        batch(() => { setPresent(false); setExitGeometry(undefined); });
      };
      if (!ready) finish();
      else {
        const transition = { type: "tween" as const, ...(reduced ? spring.fast.exit : spring.slow.exit) };
        if (reduced) offset.set(0);
        animations = [
          ...(!reduced ? [animate(offset, 16, transition)] : []),
          animate(opacity, 0, transition),
        ];
        void Promise.all(animations.map((animation) => animation.finished)).then(finish, finish);
        timer = window.setTimeout(finish, transition.duration * 1000);
      }
    }
    paint();
  });

  onMount(() => {
    const stops = [offset, opacity].map((value) => value.on("change", paint));
    paint();
    const readyFrame = requestAnimationFrame(() => { ready = true; });
    onCleanup(() => {
      disposed = true; stop(); cancelAnimationFrame(readyFrame);
      stops.forEach((stop) => stop());
      [offset, opacity].forEach((value) => value.stop());
    });
  });

  return { present, exitGeometry };
}
