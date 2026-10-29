import { Show, createContext, createEffect, createSignal, createUniqueId, onCleanup, onMount, useContext, type Accessor, type JSX } from "solid-js";
import { Button } from "../button";
import { ChevronLeft, ExpandIcon, X } from "../hugeicons";
import { PanelInteractionContext, registerPanelInteraction, type PanelInteractionOwner } from "../panel-interaction";
import { useDesignSystem } from "../provider";
import { createOutsideDismiss } from "./create-outside-dismiss";
import { createPanelFocus } from "./create-panel-focus";
import { createPanelLayout, createPanelSpace } from "./create-panel-layout";
import { createPanelPresence } from "./create-panel-presence";
import { createPanelResize } from "./create-panel-resize";
import { createPanelShortcuts } from "./create-panel-shortcuts";
import { DETAIL_PANEL_MAX_WIDTH, DETAIL_PANEL_MIN_WIDTH, DETAIL_PANEL_SIDEBAR_ID, clampDetailPanelWidth, persistStoredWidth, readStoredWidth } from "./panel-width";
import "../detail-panel.css";

/** A pinned panel never squeezes the page beside it below this width. */
const PINNED_COLLECTION_MIN_WIDTH = 360;

export type DetailPanelRootProps = {
  open: boolean;
  expanded?: boolean;
  available?: boolean;
  /** Reserves collection space by default; overlay floats without reflow. */
  mode?: "reserve" | "overlay";
  resizable?: boolean;
  dismissOnOutsideClick?: boolean;
  /** Enables global toggle/maximize shortcuts (default true); Escape remains local. */
  shortcuts?: boolean;
  /** Shows the expand/restore button in the header (default true). */
  expandable?: boolean;
  /** Keeps the panel permanently open: the header drops its close button (the page owns visibility). */
  pinned?: boolean;
  activeEntityId?: string | null;
  onOpenChange: (open: boolean) => void;
  onExpandedChange?: (expanded: boolean) => void;
  storageKey?: string;
  /** Read only numeric preferences from the previous key; never overwrite floating geometry. */
  legacyStorageKey?: string;
  children: JSX.Element;
  class?: string;
  "aria-label"?: string;
};

type DetailPanelContextValue = {
  expanded: Accessor<boolean>;
  open: Accessor<boolean>;
  available: Accessor<boolean>;
  activeEntityId: Accessor<string | null>;
  detailHost: Accessor<HTMLElement | undefined>;
  setHeaderClass: (value: string) => void;
  headerHost: Accessor<HTMLElement | undefined>;
  collectionHeaderHost: Accessor<HTMLElement | undefined>;
  interaction: PanelInteractionOwner;
};
export const DetailPanelContext = createContext<DetailPanelContextValue>();
export function useDetailPanel(part: string): DetailPanelContextValue {
  const context = useContext(DetailPanelContext);
  if (!context) throw new Error(`DetailPanel.${part} must be used inside DetailPanel.Root`);
  return context;
}

export function DetailPanelRoot(props: DetailPanelRootProps) {
  const designSystem = useDesignSystem();
  const frameId = `${DETAIL_PANEL_SIDEBAR_ID}-${createUniqueId()}`;
  const storageKey = () => props.storageKey ?? designSystem.storageKey("shell.detail.sidebar.width");
  const [detailHost, setDetailHost] = createSignal<HTMLElement>();
  const [headerClass, setHeaderClass] = createSignal("");
  const [headerHost, setHeaderHost] = createSignal<HTMLElement>();
  const [collectionHeaderHost, setCollectionHeaderHost] = createSignal<HTMLElement>();
  const [preferredWidth, setPreferredWidth] = createSignal(readStoredWidth(storageKey(), props.legacyStorageKey));
  const available = () => props.available !== false;
  const visible = () => available() && props.open;
  const expanded = () => visible() && props.expanded === true;
  const resizable = () => props.resizable !== false && visible() && !expanded();
  const activeEntityId = () => props.activeEntityId ?? null;
  const interaction: PanelInteractionOwner = {
    enabled: visible, elements: new Set(),
    parent: useContext(DetailPanelContext)?.interaction ?? useContext(PanelInteractionContext),
  };
  const expandLabel = () => expanded() ? "Restore details" : "Expand details";
  const closeShortcut = designSystem.createShortcutLabel("shell.toggle_detail");
  let root: HTMLDivElement | undefined;
  let frame: HTMLElement | undefined;
  let workspace: HTMLDivElement | undefined;
  let divider: HTMLDivElement | undefined;

  // Floating collection controls still reserve their measured height above details.
  createEffect(() => {
    const header = collectionHeaderHost();
    if (!header) return;
    const measure = () => root?.style.setProperty("--detail-panel-collection-header-height", `${header.getBoundingClientRect().height}px`);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    onCleanup(() => observer.disconnect());
  });

  function persistWidth(width: number) {
    setPreferredWidth(width);
    persistStoredWidth(storageKey(), width);
  }
  const layout = createPanelLayout({ workspace: () => workspace, preferredWidth, cancelResize: () => resize.cancel(), reserveCollection: () => props.pinned ? PINNED_COLLECTION_MIN_WIDTH : 0 });
  const resize = createPanelResize({ root: () => root, enabled: resizable, preferredWidth, ...layout, setPreferredWidth, persistWidth });
  const focus = createPanelFocus({ root: () => root, frame: () => frame, divider: () => divider, visible, available, activeEntityId });
  function close(outside = false) {
    resize.cancel(); dismiss.reset();
    if (outside) focus.preserveOutsideFocus();
    props.onOpenChange(false);
  }
  function toggleExpanded() {
    resize.cancel();
    if (visible()) props.onExpandedChange?.(!props.expanded);
  }
  const dismiss = createOutsideDismiss({
    root: () => root, enabled: () => props.dismissOnOutsideClick !== false && visible(),
    interaction, suppressClick: resize.suppressClick, close: () => close(true),
  });
  const presence = createPanelPresence({ frame: () => frame, visible, available, expanded, panelWidth: layout.panelWidth });
  createPanelSpace({ root: () => root, overlay: () => props.mode === "overlay", visible, expanded, ...presence, ...layout });
  createPanelShortcuts({
    root: () => root, interaction, visible, enabled: () => props.shortcuts !== false, expanded,
    resizing: resize.active, focusInFrame: focus.focusInFrame, matchesShortcut: designSystem.matchesShortcut,
    cancelResize: resize.cancel, collapse: () => props.onExpandedChange?.(false), restoreFocus: focus.restoreFocus, close,
  });
  onMount(() => {
    const unregister = registerPanelInteraction(interaction);
    if (frame) interaction.elements.add(frame);
    if (divider) interaction.elements.add(divider);
    onCleanup(unregister);
  });
  const context: DetailPanelContextValue = { expanded, open: visible, available, activeEntityId, detailHost, setHeaderClass, headerHost, collectionHeaderHost, interaction };
  return <DetailPanelContext.Provider value={context}>
    <div ref={root} tabIndex={-1} class={`pw-detail-panel-root ${props.class ?? ""}`}
      data-mode={props.mode ?? "reserve"}
      data-state={!available() ? "unavailable" : expanded() ? "expanded" : visible() ? "open" : "closed"}
      data-open={visible()} data-expanded={expanded()} data-gesturing={resize.gesturing() ? "true" : undefined}>
      <div ref={setCollectionHeaderHost} class="pw-detail-panel__collection-header" />
      <div ref={workspace} class="pw-detail-panel__workspace">
        <div class="pw-detail-panel__collection-panel">{props.children}</div>
        <section ref={frame} id={frameId} class="pw-detail-panel__frame surface-panel-float"
          data-expanded={visible() ? expanded() : presence.present() && presence.exitGeometry()?.expanded === true}
          hidden={!presence.present() || !available()} inert={!visible() ? true : undefined} aria-hidden={!visible() ? true : undefined}
          role="region" aria-label={props["aria-label"] ?? "Details"}
          onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
          <header class={`pw-detail-panel__header ${headerClass()}`} data-expandable={props.expandable !== false || expanded()}>
            <div ref={setHeaderHost} class="pw-detail-panel__header-title" />
            <Show
              when={expanded()}
              fallback={
                <>
                  <Show when={props.expandable !== false}>
                    <Button variant="icon" aria-label={expandLabel()} aria-pressed={expanded()} title={expandLabel()} onClick={toggleExpanded}>
                      <ExpandIcon size={14} />
                    </Button>
                  </Show>
                  <Show when={!props.pinned}>
                    <Button variant="icon" aria-label="Close details" title={`Close details (${closeShortcut()})`} onClick={() => close()}>
                      <X size={14} />
                    </Button>
                  </Show>
                </>
              }
            >
              {/* The full-page detail is its own history entry; Back returns to the list. */}
              <Button variant="icon" aria-label="Back" title="Back" onClick={toggleExpanded}>
                <ChevronLeft size={14} />
              </Button>
            </Show>
          </header>
          <div ref={setDetailHost} class="pw-detail-panel__surface" />
        </section>
        <div ref={divider} class="pw-detail-panel__resize-handle" hidden={!resizable()} role="separator" tabIndex={resizable() ? 0 : -1}
          aria-label="Resize details" aria-orientation="vertical" aria-controls={frameId}
          aria-valuenow={Math.round(layout.panelWidth())} aria-valuemin={Math.min(DETAIL_PANEL_MIN_WIDTH, layout.panelWidth())}
          aria-valuemax={clampDetailPanelWidth(DETAIL_PANEL_MAX_WIDTH, layout.hostWidth())}
          onPointerDown={resize.beginResize} onKeyDown={resize.resizeByKey} onDblClick={resize.resetWidth} />
      </div>
    </div>
  </DetailPanelContext.Provider>;
}
