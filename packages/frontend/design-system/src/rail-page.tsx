import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb";
import { Button } from "./button";
import { useDesignSystem } from "./provider";
import { ChevronLeft, SidebarRightIcon } from "./hugeicons";
import { IconTile, type IconTileTone } from "./icon-tile";
import "./rail-page.css";

/** Below this page width the properties rail leaves the row and opens as a drawer. */
const NARROW_WIDTH = 900;

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
            <Button size="icon" variant="icon" aria-label={railVisible() ? "Hide properties" : "Show properties"}
              aria-expanded={railVisible()} selected={railVisible()} onClick={toggleRail}><SidebarRightIcon size={14} /></Button>
          </Show>
        </div>
      </header>
      <div class="pw-document__scroll">
        <div class="pw-document__column">{props.children}</div>
        <Show when={railVisible()}>
          <aside class="pw-document__rail" aria-label="Properties">{props.rail}</aside>
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
