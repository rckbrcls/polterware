import Resizable, { type Size } from "@corvu/resizable";
import type { JSX } from "solid-js";
import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { isServer } from "solid-js/web";
import { useDesignSystem } from "../src/provider";
import "./resizable.css";

/** Simple resizable split (Corvu behavior with product-owned layout). */
export function ResizableSplit(props: { left: JSX.Element; right: JSX.Element; leftWidth?: Size }) {
  return (
    <Resizable class="flex h-full min-h-0">
      <Resizable.Panel
        class="overflow-auto border-r border-[var(--color-border)]"
        initialSize={props.leftWidth ?? 0.4}
      >
        {props.left}
      </Resizable.Panel>
      <Resizable.Handle class="pw-resizable-sidebar__handle" aria-label="Resize panels" />
      <Resizable.Panel class="min-w-0 overflow-auto">{props.right}</Resizable.Panel>
    </Resizable>
  );
}

export type ResizableSidebarProps = {
  sidebar: JSX.Element;
  children: JSX.Element;
  side?: "left" | "right";
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  collapseThreshold?: number;
  collapsible?: boolean;
  storageKey?: string;
  class?: string;
  mainClass?: string;
  ariaLabel?: string;
  /** Controlled visibility: `false` hides the sidebar and its handle without forgetting its width. */
  open?: boolean;
};

const DEFAULT_WIDTH = 232;
const DEFAULT_MIN_WIDTH = 184;
const DEFAULT_MAX_WIDTH = 360;
const DEFAULT_COLLAPSE_THRESHOLD = 104;
const COLLAPSED_HANDLE_INSET = 6;

function pixels(value: number): Size {
  return `${value}px`;
}

type StoredSidebarState = {
  width: number;
  collapsed: boolean;
};

function clampWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.min(Math.max(width, minWidth), maxWidth);
}

function horizontalPointerCoordinate(event: PointerEvent | MouseEvent | TouchEvent) {
  if ("clientX" in event) return event.clientX;
  return event.changedTouches[0]?.clientX;
}

type StoredSidebarWireValue =
  | null
  | boolean
  | number
  | string
  | StoredSidebarWireValue[]
  | { [key: string]: StoredSidebarWireValue };

function isStoredSidebarState(value: StoredSidebarWireValue): value is StoredSidebarState {
  return (
    value instanceof Object &&
    !Array.isArray(value) &&
    "width" in value &&
    Object.prototype.toString.call(value.width) === "[object Number]" &&
    Number.isFinite(value.width) &&
    "collapsed" in value &&
    (value.collapsed === true || value.collapsed === false)
  );
}

function isLegacySidebarState(value: StoredSidebarWireValue): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((size) => Object.prototype.toString.call(size) === "[object Number]" && Number.isFinite(size))
  );
}

function readStoredSidebarState(
  key: string | undefined,
  sidebarIndex: number,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number,
): StoredSidebarState {
  const fallback = {
    width: clampWidth(defaultWidth, minWidth, maxWidth),
    collapsed: false,
  };

  if (!key || isServer) return fallback;
  try {
    const value: StoredSidebarWireValue = JSON.parse(
      window.localStorage.getItem(key) ?? "null",
    );
    if (isStoredSidebarState(value)) {
      return {
        width: clampWidth(value.width, minWidth, maxWidth),
        collapsed: value.collapsed,
      };
    }

    // Migrate the old percentage-pair format without carrying its invalid width.
    if (isLegacySidebarState(value)) {
      return { ...fallback, collapsed: value[sidebarIndex] === 0 };
    }
  } catch {
    // Ignore stale or malformed layout data and use the product default.
  }
  return fallback;
}

/**
 * Corvu-backed resizable layout with a collapsible sidebar on either edge.
 * The handle owns pointer capture, keyboard resizing and the collapse threshold.
 */
export function ResizableSidebar(props: ResizableSidebarProps) {
  const designSystem = useDesignSystem();
  const storageKey = () => props.storageKey ?? designSystem.storageKey("shell.sidebar.sizes");
  const side = () => props.side ?? "left";
  const defaultWidth = () => props.defaultWidth ?? DEFAULT_WIDTH;
  const minWidth = () => props.minWidth ?? DEFAULT_MIN_WIDTH;
  const maxWidth = () => props.maxWidth ?? DEFAULT_MAX_WIDTH;
  const collapseThreshold = () => props.collapseThreshold ?? DEFAULT_COLLAPSE_THRESHOLD;
  const collapsible = () => props.collapsible ?? true;
  const sidebarIndex = () => side() === "left" ? 0 : 1;
  const hidden = () => props.open === false;
  const storedState = readStoredSidebarState(
    storageKey(),
    sidebarIndex(),
    defaultWidth(),
    minWidth(),
    maxWidth(),
  );
  const [collapsed, setCollapsed] = createSignal(collapsible() && storedState.collapsed);

  let rootElement: HTMLDivElement | undefined;
  let sidebarElement: HTMLElement | undefined;
  let lastExpandedWidth = storedState.width;
  let currentWidth = storedState.collapsed ? 0 : storedState.width;
  let sizesInitialized = false;
  let setPanelSizes: ((sizes: number[]) => void) | undefined;
  let rootResizeObserver: ResizeObserver | undefined;
  let rootSyncFrame: number | undefined;
  let settleFrame: number | undefined;
  let didDrag = false;
  let dragStartX: number | undefined;
  let dragStartedCollapsed = false;
  let resetDragClickTimer: number | undefined;

  onCleanup(() => {
    rootResizeObserver?.disconnect();
    if (isServer) return;
    if (rootSyncFrame !== undefined) window.cancelAnimationFrame(rootSyncFrame);
    if (settleFrame !== undefined) window.cancelAnimationFrame(settleFrame);
    if (resetDragClickTimer !== undefined) window.clearTimeout(resetDragClickTimer);
  });

  function persistState(isCollapsed = collapsed()) {
    if (!storageKey() || isServer) return;
    window.localStorage.setItem(
      storageKey()!,
      JSON.stringify({ width: lastExpandedWidth, collapsed: isCollapsed }),
    );
  }

  function panelSizesFor(width: number, rootWidth: number) {
    const sidebarSize = Math.min(Math.max(width / rootWidth, 0), 1);
    return side() === "left"
      ? [sidebarSize, 1 - sidebarSize]
      : [1 - sidebarSize, sidebarSize];
  }

  function markRootSync() {
    if (!rootElement || isServer) return;
    rootElement.setAttribute("data-resizing-root", "");
    if (rootSyncFrame !== undefined) window.cancelAnimationFrame(rootSyncFrame);
    rootSyncFrame = window.requestAnimationFrame(() => {
      rootElement?.removeAttribute("data-resizing-root");
      rootSyncFrame = undefined;
    });
  }

  function syncPanelSizes() {
    const rootWidth = rootElement?.getBoundingClientRect().width ?? 0;
    if (rootWidth <= 0 || !setPanelSizes) return;

    const targetWidth = collapsed() || hidden()
      ? 0
      : Math.min(clampWidth(lastExpandedWidth, minWidth(), maxWidth()), rootWidth);

    currentWidth = targetWidth;
    sizesInitialized = true;
    markRootSync();
    setPanelSizes(panelSizesFor(targetWidth, rootWidth));
  }

  function applySettledWidth(width: number, isCollapsed: boolean) {
    const rootWidth = rootElement?.getBoundingClientRect().width ?? 0;
    const nextCollapsed = collapsible() && isCollapsed;
    const targetWidth = nextCollapsed
      ? 0
      : Math.min(clampWidth(width, minWidth(), maxWidth()), rootWidth);
    currentWidth = targetWidth;
    setCollapsed(nextCollapsed);
    if (!nextCollapsed) lastExpandedWidth = targetWidth;
    if (rootWidth > 0) setPanelSizes?.(panelSizesFor(targetWidth, rootWidth));
    persistState(nextCollapsed);
  }

  function captureRenderedWidth() {
    const rootWidth = rootElement?.getBoundingClientRect().width ?? 0;
    const renderedWidth = sidebarElement?.getBoundingClientRect().width;
    if (rootWidth <= 0 || renderedWidth === undefined) return;

    currentWidth = Math.min(Math.max(renderedWidth, 0), maxWidth(), rootWidth);
    dragStartedCollapsed = collapsible() && currentWidth <= 0.5;
    setCollapsed(dragStartedCollapsed);
    setPanelSizes?.(panelSizesFor(currentWidth, rootWidth));
  }

  function alignCollapsedHandleForDrag() {
    if (!dragStartedCollapsed) return;
    const rootWidth = rootElement?.getBoundingClientRect().width ?? 0;
    if (rootWidth <= 0) return;

    dragStartedCollapsed = false;
    currentWidth = Math.min(COLLAPSED_HANDLE_INSET, rootWidth);
    setCollapsed(false);
    setPanelSizes?.(panelSizesFor(currentWidth, rootWidth));
  }

  function settleCurrentWidth() {
    if (collapsible() && currentWidth <= collapseThreshold()) {
      applySettledWidth(0, true);
      return;
    }

    applySettledWidth(Math.max(currentWidth, minWidth()), false);
  }

  function scheduleSettle() {
    if (isServer) {
      settleCurrentWidth();
      return;
    }
    if (settleFrame !== undefined) window.cancelAnimationFrame(settleFrame);
    settleFrame = window.requestAnimationFrame(() => {
      settleFrame = undefined;
      settleCurrentWidth();
    });
  }

  function toggle() {
    if (!collapsible() || hidden()) return;
    if (settleFrame !== undefined && !isServer) {
      window.cancelAnimationFrame(settleFrame);
      settleFrame = undefined;
    }
    if (collapsed() || currentWidth <= 0.5) {
      applySettledWidth(lastExpandedWidth, false);
    } else {
      applySettledWidth(0, true);
    }
  }

  createEffect(on(hidden, () => syncPanelSizes(), { defer: true }));

  onMount(() => {
    syncPanelSizes();
    if (rootElement && "ResizeObserver" in globalThis) {
      rootResizeObserver = new ResizeObserver(syncPanelSizes);
      rootResizeObserver.observe(rootElement);
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !designSystem.matchesShortcut("shell.toggle_sidebar", event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      toggle();
    };
    window.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, true));
  });

  function sidebarPanel(initialSize: Size) {
    return (
      <Resizable.Panel
        as="aside"
        ref={(element) => {
          sidebarElement = element;
        }}
        class={`pw-resizable-sidebar ${props.class ?? ""}`}
        data-side={side()}
        initialSize={initialSize}
        minSize={0}
        maxSize={pixels(maxWidth())}
        collapsible={collapsible()}
        collapsedSize={0}
        collapseThreshold={0}
        onCollapse={() => {
          // Hiding a controlled sidebar zeroes it too; that is not the person collapsing it.
          if (!hidden()) setCollapsed(true);
        }}
        onExpand={() => {
          setCollapsed(false);
        }}
        style={`--pw-resizable-sidebar-min-width: ${minWidth()}px; --pw-resizable-sidebar-max-width: ${maxWidth()}px`}
        aria-label={props.ariaLabel}
        data-hidden={hidden() ? "" : undefined}
      >
        <div class="pw-resizable-sidebar__viewport">
          <div class="pw-resizable-sidebar__content">
            {props.sidebar}
          </div>
        </div>
      </Resizable.Panel>
    );
  }

  return (
    <Resizable
      ref={(element) => {
        rootElement = element;
      }}
      class="pw-resizable-sidebar-layout"
      keyboardDelta="16px"
      onSizesChange={(sizes) => {
        if (!sizesInitialized || sizes.length !== 2) return;
        const rootWidth = rootElement?.getBoundingClientRect().width ?? 0;
        const sidebarSize = sizes[sidebarIndex()] ?? 0;
        if (rootWidth <= 0) return;
        currentWidth = Math.max(0, Math.min(sidebarSize * rootWidth, maxWidth()));
      }}
    >
      {(context) => {
        setPanelSizes = (sizes) => {
          context.setSizes(sizes);
        };

        const handle = (
          <Resizable.Handle
            class="pw-resizable-sidebar__handle"
            data-side={side()}
            data-hidden={hidden() ? "" : undefined}
            aria-label={`Resize ${props.ariaLabel ?? "sidebar"}`}
            title={collapsible() ? "Drag to resize · Click to toggle" : "Drag to resize"}
            onHandleDragStart={(event) => {
              captureRenderedWidth();
              didDrag = false;
              dragStartX = horizontalPointerCoordinate(event);
              if (settleFrame !== undefined) {
                window.cancelAnimationFrame(settleFrame);
                settleFrame = undefined;
              }
              if (resetDragClickTimer !== undefined) window.clearTimeout(resetDragClickTimer);
            }}
            onHandleDrag={alignCollapsedHandleForDrag}
            onHandleDragEnd={(event) => {
              const dragEndX = horizontalPointerCoordinate(event);
              didDrag =
                dragStartX !== undefined &&
                dragEndX !== undefined &&
                Math.abs(dragEndX - dragStartX) > 2;
              dragStartX = undefined;
              dragStartedCollapsed = false;
              if (didDrag) scheduleSettle();
              resetDragClickTimer = window.setTimeout(() => {
                didDrag = false;
              }, 0);
            }}
            onClick={() => {
              if (!didDrag) toggle();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                if (collapsible()) {
                  event.preventDefault();
                  toggle();
                }
              } else if (event.key === "Home") {
                event.preventDefault();
                applySettledWidth(collapsible() ? 0 : minWidth(), collapsible());
              } else if (event.key === "End") {
                event.preventDefault();
                applySettledWidth(lastExpandedWidth, false);
              }
            }}
            onKeyUp={(event) => {
              if (
                event.key === "ArrowLeft" ||
                event.key === "ArrowRight" ||
                event.key === "ArrowUp" ||
                event.key === "ArrowDown"
              ) {
                scheduleSettle();
              }
            }}
          />
        );

        const mainPanel = (
          <Resizable.Panel class={`pw-resizable-sidebar__main ${props.mainClass ?? ""}`}>
            {props.children}
          </Resizable.Panel>
        );

        const initialSidebarSize = collapsed() || hidden() ? 0 : pixels(storedState.width);
        return side() === "left" ? (
          <>
            {sidebarPanel(initialSidebarSize)}
            {handle}
            {mainPanel}
          </>
        ) : (
          <>
            {mainPanel}
            {handle}
            {sidebarPanel(initialSidebarSize)}
          </>
        );
      }}
    </Resizable>
  );
}
