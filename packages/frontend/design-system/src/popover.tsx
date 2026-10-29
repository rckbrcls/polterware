import { createPanelPortalOwnership } from "./panel-interaction";
import type { Accessor, JSX } from "solid-js";
import { Show } from "solid-js";
import { Portal } from "solid-js/web";
/**
 * Product popover: **Ark UI Popover** (behavior) + Polter surface (look).
 * Prefer anchorRef so Ark owns placement — do not hand-roll focus/Escape/outside.
 *
 * Stacking: Zag copies Content’s computed z-index onto the Positioner via
 * `--z-index`. Always set z-index on Content (not only Positioner). Portal to
 * body so title-bar switchers paint above MainSurface (sibling paint order).
 */
import { Popover as ArkPopover } from "@ark-ui/solid/popover";
import { createPopupMotion } from "./popup-motion";
import "./popover.css";
import { FloatingSurfaceProvider } from "./floating-surface";

export type PopoverProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: JSX.Element;
  class?: string;
  width?: number;
  /**
   * Anchor element for positioning (e.g. chevron button).
   * Prefer this over absolute `style` so Ark owns placement.
   */
  anchorRef?: Accessor<HTMLElement | undefined> | (() => HTMLElement | undefined | null);
  /** Placement (default bottom-start; end → bottom-end). */
  placement?:
    | "bottom-start"
    | "bottom-end"
    | "bottom"
    | "top-start"
    | "top-end"
    | "top"
    | "right-start"
    | "right-end"
    | "right"
    | "left-start"
    | "left-end"
    | "left";
  gutter?: number;
  /** Move focus into the popover when it opens (default true). Off keeps typing in the anchor. */
  autoFocus?: boolean;
  /** Extra portalled elements that belong to this popover interaction tree. */
  persistentElements?: Array<() => HTMLElement | null>;
  /** Escape pressed inside this popover (it closes either way); nested menus use it to close their parent too. */
  onEscapeKeyDown?: () => void;
  /** Receives the mounted Ark content element. */
  contentRef?: (element: HTMLElement) => void;
  /**
   * @deprecated Prefer `anchorRef`. Kept for rare fixed placements.
   * When set without anchor, content may use style only as fallback.
   */
  style?: JSX.CSSProperties;
  /** Maps to bottom-end when set for legacy aligned consumers. */
  align?: "start" | "end";
};

/**
 * Product popover: Ark Popover + Polter tokens + a spring enter / quicker exit
 * from the anchor side (`createPopupMotion`).
 */
export function Popover(props: PopoverProps) {
  const ownPortal = createPanelPortalOwnership(() => props.open);
  const resolveAnchor = (): HTMLElement | undefined => {
    const a = props.anchorRef;
    if (!a) return undefined;
    const el = a();
    return el ?? undefined;
  };

  const placement = () =>
    props.placement ?? (props.align === "end" ? "bottom-end" : "bottom-start");

  const resolvePersistentAnchor = (): HTMLElement | null => {
    const anchor = resolveAnchor();
    return anchor?.ownerDocument ? anchor : null;
  };

  return (
    <ArkPopover.Root
      open={props.open}
      onOpenChange={(details) => {
        if (!details.open) props.onClose();
      }}
      modal={false}
      autoFocus={props.autoFocus}
      portalled
      lazyMount
      unmountOnExit
      closeOnEscape
      onEscapeKeyDown={() => props.onEscapeKeyDown?.()}
      closeOnInteractOutside
      onInteractOutside={(event) => {
        // Menus, selects and popovers opened from inside this popover are portalled
        // elsewhere; interacting with them is not an outside dismissal.
        // The event is dispatched on the layer node; the real target is on the original event.
        const target = (event.detail?.originalEvent?.target ?? null) as Element | null;
        if (target?.closest?.('.pw-dropdown-positioner, [data-scope="menu"], [data-scope="select"], [data-scope="popover"], [data-scope="date-picker"]')) event.preventDefault();
      }}
      persistentElements={[
        resolvePersistentAnchor,
        ...(props.persistentElements ?? []),
      ]}
      positioning={{
        placement: placement(),
        gutter: props.gutter ?? 6,
        flip: true,
        getAnchorRect: () => {
          const el = resolveAnchor();
          if (!el) return null;
          return el.getBoundingClientRect();
        },
      }}
    >
      <Portal>
        <ArkPopover.Positioner class="pw-popover-positioner">
          <ArkPopover.Content
            ref={(element) => { ownPortal(element); props.contentRef?.(element); }}
            class="pw-popover-presence outline-none"
            style={{
              "--pw-popover-origin":
                props.align === "end" || placement().endsWith("end")
                  ? "top right"
                  : "top left",
            }}
          >
            <PopoverSurface
              class={[
                "pw-popover-surface overflow-hidden outline-none surface-panel-float",
                props.class ?? "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                width: `${props.width ?? 320}px`,
                "max-width": "calc(100vw - 24px)",
                "max-height": "calc(100vh - 64px)",
                display: "flex",
                "flex-direction": "column",
                color: "var(--color-text-primary)",
                ...props.style,
              }}
            >
              <Show when={props.title}>
                <ArkPopover.Title class="sr-only">{props.title}</ArkPopover.Title>
              </Show>
              {props.children}
            </PopoverSurface>
          </ArkPopover.Content>
        </ArkPopover.Positioner>
      </Portal>
    </ArkPopover.Root>
  );
}

/** The visual surface inside Ark Content; mounts with Content, so motion starts on open. */
function PopoverSurface(props: { class: string; style: JSX.CSSProperties; children: JSX.Element }) {
  const motion = createPopupMotion();
  return (
    <div ref={motion.ref} class={props.class} style={props.style}>
      <FloatingSurfaceProvider>{props.children}</FloatingSurfaceProvider>
    </div>
  );
}
