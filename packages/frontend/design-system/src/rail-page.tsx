import { Show, createEffect, createSignal, onCleanup, onMount, untrack, type JSX } from "solid-js";
import { animate, motionValue, type AnimationPlaybackControls } from "motion";
import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb";
import { Button } from "./button";
import { useDesignSystem } from "./provider";
import { ChevronLeft, SidebarRightIcon } from "./hugeicons";
import { IconTile, type IconTileTone } from "./icon-tile";
import { prefersReducedMotion } from "./reduced-motion";
import { spring } from "./springs";
import "./rail-page.css";

/** Below this page width the properties rail leaves the row and opens as a drawer. */
const NARROW_WIDTH = 900;
/** The rail's width and the scroll row's gap before it, from rail-page.css. */
const RAIL_WIDTH = 376;
const RAIL_GAP = 48;

/**
 * Keeps the rail mounted while it leaves and moves it like the detail panel: it slides 16px
 * and fades on `spring.slow` (a quicker tween out), and beside the text its width closes too,
 * so the column widens with it instead of jumping. Snaps on first paint; under reduced motion
 * only the fade remains.
 */
function createRailPresence(options: { rail: () => HTMLElement | undefined; visible: () => boolean; narrow: () => boolean }) {
  const [present, setPresent] = createSignal(untrack(options.visible));
  const offset = motionValue(0), opacity = motionValue(1), width = motionValue(RAIL_WIDTH);
  let animations: AnimationPlaybackControls[] = [];
  let ready = false, run = 0;
  let timer: number | undefined;
  // The last visibility the effect saw: reading `visible` outside it would build the rail's JSX with no owner.
  let shown = untrack(options.visible);

  function paint() {
    const rail = options.rail();
    if (!rail) return;
    rail.style.transform = offset.get() ? `translate3d(${offset.get()}px, 0, 0)` : "";
    const alpha = Math.min(1, Math.max(0, opacity.get()));
    rail.style.opacity = alpha === 1 ? "" : String(alpha);
    if (options.narrow() || width.get() >= RAIL_WIDTH) {
      rail.style.width = rail.style.flexBasis = rail.style.marginLeft = rail.style.overflow = "";
      return;
    }
    rail.style.width = rail.style.flexBasis = `${width.get()}px`;
    rail.style.marginLeft = `${-RAIL_GAP * (1 - width.get() / RAIL_WIDTH)}px`;
    rail.style.overflow = "hidden";
  }
  function stop() {
    run++;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    animations.forEach((control) => control.stop());
    animations = [];
  }

  createEffect(() => {
    const open = options.visible();
    shown = open;
    if (!ready) { setPresent(open); return; }
    stop();
    const reduced = prefersReducedMotion();
    const travel = !reduced && !untrack(options.narrow);
    if (open) {
      if (!untrack(present)) { offset.set(reduced ? 0 : 16); opacity.set(0); width.set(travel ? 0 : RAIL_WIDTH); }
      setPresent(true);
      animations = [
        animate(opacity, 1, reduced ? spring.fast : spring.slow),
        ...(reduced ? [] : [animate(offset, 0, spring.slow)]),
        ...(travel ? [animate(width, RAIL_WIDTH, spring.slow)] : []),
      ];
      return;
    }
    const current = run;
    const transition = { type: "tween" as const, ...(reduced ? spring.fast.exit : spring.slow.exit) };
    animations = [
      animate(opacity, 0, transition),
      ...(reduced ? [] : [animate(offset, 16, transition)]),
      ...(travel ? [animate(width, 0, transition)] : []),
    ];
    const finish = () => {
      if (current !== run || shown) return;
      setPresent(false);
      offset.set(0); opacity.set(1); width.set(RAIL_WIDTH);
    };
    void Promise.all(animations.map((control) => control.finished)).then(finish, finish);
    // `finished` can stay pending on a motion value, so the exit's own length also ends it.
    timer = window.setTimeout(finish, transition.duration * 1000);
  });

  // A rail that mounts to enter starts from the values set above, not a frame at full size.
  createEffect(() => { if (options.rail()) paint(); });

  onMount(() => {
    const stops = [offset, opacity, width].map((value) => value.on("change", paint));
    const frame = requestAnimationFrame(() => { ready = true; });
    onCleanup(() => {
      stop();
      cancelAnimationFrame(frame);
      stops.forEach((unsubscribe) => unsubscribe());
    });
  });

  return present;
}

function readRailPreference(key: string | undefined): boolean {
  if (!key) return true;
  try {
    return localStorage.getItem(key) !== "hidden";
  } catch {
    return true;
  }
}

function writeRailPreference(key: string | undefined, open: boolean) {
  if (!key) return;
  try {
    localStorage.setItem(key, open ? "open" : "hidden");
  } catch {
    // Storage may be unavailable; the rail still toggles for this page.
  }
}

export type RailPageProps = {
  /** The places above this one; the last part of the breadcrumb is `title`. */
  trail: readonly BreadcrumbItem[];
  title: string;
  /** Shown at 16px before the title in the breadcrumb. */
  icon?: JSX.Element;
  onBack: () => void;
  /** Header controls before the rail toggle, such as a run's Verify. */
  actions?: JSX.Element;
  /** A quiet live status in the header, such as "Saving…". */
  status?: JSX.Element;
  /** The floating properties rail; leave it out for a page with none. */
  rail?: JSX.Element;
  /** The column takes the width the rail leaves (a log) instead of the 654px text measure. */
  wide?: boolean;
  /** Shared by every page that should remember the rail together. Defaults to the documents' key. */
  railStorageKey?: string;
  /** Pinned above the scrolling content, aligned with the column, such as a run's agent. */
  lead?: JSX.Element;
  children: JSX.Element;
};

/**
 * A full page organized like a Linear issue: a 44px header with Back, the breadcrumb, and the
 * actions, the content column, and a 376px properties rail on the right that opens as a
 * floating drawer on narrow pages. Fill the rail with `RailGroup`s.
 */
export function RailPage(props: RailPageProps) {
  const designSystem = useDesignSystem();
  const railKey = () => props.railStorageKey ?? designSystem.storageKey("document.rail");
  const [railOpen, setRailOpen] = createSignal(readRailPreference(railKey()));
  const [narrow, setNarrow] = createSignal(false);
  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const railVisible = () => Boolean(props.rail) && (narrow() ? drawerOpen() : railOpen());
  let root: HTMLDivElement | undefined;
  const [railElement, setRailElement] = createSignal<HTMLElement>();
  const railPresent = createRailPresence({ rail: railElement, visible: railVisible, narrow });

  onMount(() => {
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setNarrow(entry.contentRect.width < NARROW_WIDTH); });
    observer.observe(root);
    onCleanup(() => observer.disconnect());
  });

  function toggleRail() {
    if (narrow()) {
      setDrawerOpen((open) => !open);
      return;
    }
    const next = !railOpen();
    setRailOpen(next);
    writeRailPreference(railKey(), next);
  }

  return (
    <div ref={root} class="pw-document" data-narrow={narrow() ? "true" : undefined} data-wide={props.wide ? "true" : undefined}>
      <header class="pw-document__header">
        <div class="pw-document__trail">
          <Button size="icon" variant="texture" aria-label="Back" onClick={() => props.onBack()}><ChevronLeft size={14} /></Button>
        </div>
        <Breadcrumb class="pw-document__crumbs" items={props.trail} icon={props.icon} current={props.title || "Untitled"} />
        <div class="pw-document__actions">
          <Show when={props.status}><span role="status" aria-live="polite" class="pw-document__status">{props.status}</span></Show>
          {props.actions}
          <Show when={props.rail}>
            <Button size="icon" variant="texture" aria-label={railVisible() ? "Hide properties" : "Show properties"}
              aria-expanded={railVisible()} selected={railVisible()} onClick={toggleRail}><SidebarRightIcon size={14} /></Button>
          </Show>
        </div>
      </header>
      <Show when={props.lead}><div class="pw-document__lead">{props.lead}</div></Show>
      <div class="pw-document__scroll">
        <div class="pw-document__column">{props.children}</div>
        <Show when={railPresent()}>
          <aside ref={setRailElement} class="pw-document__rail" aria-label="Properties" aria-hidden={railVisible() ? undefined : "true"} inert={railVisible() ? undefined : true}>
            <div class="pw-document__rail-inner">{props.rail}</div>
          </aside>
        </Show>
      </div>
    </div>
  );
}

/**
 * One titled group of a rail page, such as Properties or Links: a title (with an optional
 * icon tile) and its content, separated by space alone, never a card.
 */
export function RailGroup(props: {
  title: string;
  icon?: JSX.Element;
  tone?: IconTileTone;
  /** Shown at the end of the title row, such as a count. */
  aside?: JSX.Element;
  actions?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <section class="pw-document__group">
      <Show when={props.icon} fallback={<h3 class="pw-document__group-title">{props.title}</h3>}>
        <div class="pw-document__group-heading">
          <IconTile size={24} tone={props.tone ?? "neutral"} seed={`document-group-${props.title}`}>{props.icon}</IconTile>
          <h3 class="pw-document__group-title pw-document__group-title--tiled">{props.title}</h3>
          <Show when={props.aside}><span class="pw-document__group-aside">{props.aside}</span></Show>
        </div>
      </Show>
      {props.children}
      <Show when={props.actions}><div class="pw-document__group-actions">{props.actions}</div></Show>
    </section>
  );
}
