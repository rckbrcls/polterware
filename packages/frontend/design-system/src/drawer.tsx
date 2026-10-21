import type { JSX } from "solid-js";
import { Show } from "solid-js";
/**
 * Product drawer / side sheet: **Ark UI Drawer** (behavior) + Polter surface (look).
 * Escape, scrim, and focus come from Ark — do not hand-roll document listeners.
 */
import { Drawer as ArkDrawer } from "@ark-ui/solid/drawer";
import "./drawer.css";
import { FloatingSurfaceProvider } from "./floating-surface";

export type DrawerProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: JSX.Element;
  footer?: JSX.Element;
  width?: number;
  /** Defaults to true. Pass false for interactive surfaces (e.g. live terminal). */
  closeOnInteractOutside?: boolean;
  /** Remove body padding and use overflow-hidden for full-bleed children (e.g. xterm). */
  flush?: boolean;
};

/** Temporary side panel — modal sheet edge layout via CSS only. */
export function Drawer(props: DrawerProps) {
  const width = () => props.width ?? 360;
  const bodyClass = () =>
    props.flush
      ? "relative flex min-h-0 flex-1 flex-col overflow-hidden p-0 text-[13px] text-[var(--color-text-secondary)]"
      : "min-h-0 flex-1 overflow-auto px-4 py-3 text-[13px] text-[var(--color-text-secondary)]";

  return (
    <ArkDrawer.Root
      open={props.open}
      onOpenChange={(details) => {
        if (!details.open) props.onClose();
      }}
      lazyMount
      unmountOnExit
      closeOnEscape
      closeOnInteractOutside={props.closeOnInteractOutside !== false}
    >
      <ArkDrawer.Backdrop
        class="pw-drawer-backdrop fixed inset-0 z-[var(--z-dialog,50)] bg-[var(--color-overlay)]"
        aria-label="Close drawer"
      />
      <ArkDrawer.Positioner class="fixed inset-0 z-[var(--z-dialog,50)] flex justify-end pointer-events-none">
        <ArkDrawer.Content
          class="pw-drawer-content surface-panel-float pointer-events-auto relative z-10 flex flex-col outline-none"
          style={{
            width: `${width()}px`,
          }}
        >
          <header class="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--color-border-subtle)] px-4 py-3">
            <div class="min-w-0">
              <ArkDrawer.Title class="m-0 truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
                {props.title}
              </ArkDrawer.Title>
              <Show when={props.subtitle}>
                <ArkDrawer.Description class="m-0 mt-0.5 text-[12px] text-[var(--color-text-muted)]">
                  {props.subtitle}
                </ArkDrawer.Description>
              </Show>
            </div>
            <ArkDrawer.CloseTrigger
              class="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[18px] leading-none text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] outline-none"
              aria-label="Close"
            >
              ×
            </ArkDrawer.CloseTrigger>
          </header>
          <FloatingSurfaceProvider>
            <div class={bodyClass()}>{props.children}</div>
            <Show when={props.footer}>
              <footer class="shrink-0 border-t border-[var(--color-border-subtle)] px-4 py-3">
                {props.footer}
              </footer>
            </Show>
          </FloatingSurfaceProvider>
        </ArkDrawer.Content>
      </ArkDrawer.Positioner>
    </ArkDrawer.Root>
  );
}
