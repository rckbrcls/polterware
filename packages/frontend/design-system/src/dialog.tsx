import { createPanelPortalOwnership } from "./panel-interaction";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { Portal } from "solid-js/web";
import { X } from "./hugeicons";
/**
 * Product dialog: **Ark UI Dialog** (behavior) + Polter tokens (look).
 * Public API preserved for features — do not import Ark in features.
 */
import { Dialog as ArkDialog } from "@ark-ui/solid/dialog";
import "./dialog.css";
import { FloatingSurfaceProvider } from "./floating-surface";

/**
 * Product dialog size:
 * - sm — compact forms / confirms (create project)
 * - md — medium forms (default when omitted)
 * - lg — create dialogs with template grids
 * - xl — dense catalogs (Add to Architecture)
 */
export type DialogSize = "sm" | "md" | "lg" | "xl";

export type A11yDialogProps = {
  open: boolean;
  /** Accessible name — always required. When `chrome="flush"`, rendered sr-only. */
  title: string;
  /** Optional leading content in the default header (e.g. icon), beside the title. */
  titleLeading?: JSX.Element;
  children: JSX.Element;
  onClose: () => void;
  class?: string;
  /** Extra classes on the backdrop (e.g. lighter Commander scrim). */
  overlayClass?: string;
  footer?: JSX.Element;
  /** Defaults to `md`. Pass `xl` for dense catalogs. */
  size?: DialogSize;
  description?: string;
  /** @deprecated Body always fills the fixed dialog frame. */
  fillHeight?: boolean;
  /**
   * `default` — title header + optional description.
   * `flush` — no title block; search/actions start at top; close is absolute.
   * Prefer `flush` for dense catalogs (Add to Architecture).
   */
  chrome?: "default" | "flush";
  /**
   * When false, Escape, outside click, and the close (X) control are disabled.
   * Defaults to true.
   */
  dismissible?: boolean;
  /**
   * When false, hide the built-in Close (X) control. Escape / outside click still
   * follow `dismissible`. Use when the consumer owns close chrome (e.g. Commander).
   * Defaults to true.
   */
  showCloseButton?: boolean;
  /** Extra classes on the body wrapper (overrides default padding when provided). */
  bodyClass?: string;
  /**
   * When false, opening focuses the dialog itself instead of its first field, so a
   * search box does not grab the caret. Tab still moves into the content. Defaults to true.
   */
  autoFocusField?: boolean;
  /** Element that takes focus when the dialog opens, such as a confirm's primary action. */
  initialFocus?: () => HTMLElement | null | undefined;
  /**
   * When false, focus may leave the dialog for a popover it opens (they are portalled outside
   * it), such as the Composer's property pickers with a search field. Defaults to true.
   */
  trapFocus?: boolean;
};

/**
 * Product dialog: Ark Dialog + Polter surface.
 *
 * Default frame = `md` (medium form). Pass `xl` for dense catalogs.
 * Regions never draw dividers — space separates header, body and footer.
 * Footer: pass buttons as a fragment; the first (dismiss, e.g. Cancel) sits left,
 * the primary/destructive action last on the right.
 */
export function A11yDialog(props: A11yDialogProps) {
  const ownPortal = createPanelPortalOwnership(() => props.open);
  const flush = () => props.chrome === "flush";
  const dismissible = () => props.dismissible !== false;
  const showCloseButton = () => props.showCloseButton !== false;
  const frameSize = (): DialogSize => props.size ?? "md";
  let contentEl: HTMLElement | undefined;

  return (
    <ArkDialog.Root
      open={props.open}
      onOpenChange={(details) => {
        if (!details.open && dismissible()) props.onClose();
      }}
      lazyMount
      unmountOnExit
      closeOnEscape={dismissible()}
      closeOnInteractOutside={dismissible()}
      trapFocus={props.trapFocus !== false}
      initialFocusEl={
        props.initialFocus
          ? () => props.initialFocus?.() ?? contentEl ?? null
          : props.autoFocusField === false ? () => contentEl ?? null : undefined
      }
    >
      <Portal>
        <ArkDialog.Backdrop ref={ownPortal}
          class={[
            "pw-dialog-overlay fixed inset-0 z-[var(--z-dialog,100)] bg-[var(--color-overlay)]",
            props.overlayClass ?? "",
          ].join(" ")}
        />
        <ArkDialog.Positioner class="fixed inset-0 z-[var(--z-dialog,100)] flex items-center justify-center p-4 sm:p-8 pointer-events-none">
          <ArkDialog.Content ref={(element) => { contentEl = element; ownPortal(element); }}
            data-size={frameSize()}
            class={[
              /* Size comes from dialog.css .pw-dialog-content[data-size]. */
              "pw-dialog-content surface-panel-float pointer-events-auto relative flex flex-col overflow-hidden outline-none",
              props.class ?? "",
            ].join(" ")}
          >
          <Show
            when={!flush()}
            fallback={
              <>
                <ArkDialog.Title class="sr-only">{props.title}</ArkDialog.Title>
                <Show when={props.description}>
                  <ArkDialog.Description class="sr-only">{props.description}</ArkDialog.Description>
                </Show>
                <Show when={dismissible() && showCloseButton()}>
                  <ArkDialog.CloseTrigger
                    class="absolute top-4 right-4 z-10 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                    aria-label="Close"
                  >
                    <X size={16} aria-hidden />
                  </ArkDialog.CloseTrigger>
                </Show>
              </>
            }
          >
            <header class="flex shrink-0 items-start justify-between gap-3 px-7 pt-6 pb-2">
              <div class="min-w-0 flex-1">
                <div class="flex min-w-0 items-center gap-2.5">
                  <Show when={props.titleLeading}>
                    <div class="shrink-0">{props.titleLeading}</div>
                  </Show>
                  <ArkDialog.Title class="m-0 min-w-0 text-[16px] font-semibold text-[var(--color-text-primary)]">
                    {props.title}
                  </ArkDialog.Title>
                </div>
                <Show when={props.description}>
                  <ArkDialog.Description class="mt-1 m-0 text-[12px] text-[var(--color-text-muted)]">
                    {props.description}
                  </ArkDialog.Description>
                </Show>
              </div>
              <Show when={dismissible() && showCloseButton()}>
                <ArkDialog.CloseTrigger
                  class="-mt-1 -mr-2 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]"
                  aria-label="Close"
                >
                  <X size={16} aria-hidden />
                </ArkDialog.CloseTrigger>
              </Show>
            </header>
          </Show>

          <FloatingSurfaceProvider>
          <div
            class={[
              "flex min-h-0 flex-1 flex-col overflow-auto text-[13px] text-[var(--color-text-secondary)]",
              props.bodyClass ?? (flush() ? "px-7 pt-6 pb-4" : "px-7 py-4"),
            ].join(" ")}
          >
            {props.children}
          </div>

          <Show when={props.footer}>
            <footer class="pw-dialog-footer flex shrink-0 items-center justify-end gap-2 px-7 pt-3 pb-6">
              {props.footer}
            </footer>
          </Show>
          </FloatingSurfaceProvider>
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  );
}

export const Dialog = A11yDialog;
