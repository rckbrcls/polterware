import { createEffect, onCleanup, untrack, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";

export function createPanelFocus(options: {
  root: Accessor<HTMLElement | undefined>;
  frame: Accessor<HTMLElement | undefined>;
  divider: Accessor<HTMLElement | undefined>;
  visible: Accessor<boolean>;
  available: Accessor<boolean>;
  activeEntityId: Accessor<string | null>;
}) {
  let disposed = false, preserveOutsideFocus = false;
  let lastOpen = options.visible();
  const focusInFrame = () => !isServer && Boolean(options.frame()?.contains(document.activeElement));
  function restoreFocus() {
    if (isServer) return;
    queueMicrotask(() => {
      if (disposed) return;
      const root = options.root(), id = options.activeEntityId();
      const candidates = Array.from(root?.querySelectorAll<HTMLElement>("[data-detail-target-id], [data-row-id], [data-detail-focus-fallback]") ?? [])
        .filter((element) => element.closest(".pw-detail-panel-root") === root);
      const target = candidates.find((element) => element.dataset.detailTargetId === id || element.dataset.rowId === id)
        ?? candidates.find((element) => element.hasAttribute("data-detail-focus-fallback")) ?? root;
      target?.focus({ preventScroll: true });
    });
  }
  createEffect(() => {
    const open = options.visible(), available = options.available();
    if (isServer) return;
    const hasFocus = () => focusInFrame() || document.activeElement === options.divider();
    if (((!open && lastOpen && !preserveOutsideFocus) || !available) && untrack(hasFocus)) restoreFocus();
    lastOpen = open; preserveOutsideFocus = false;
  });
  onCleanup(() => { disposed = true; });
  return { focusInFrame, restoreFocus, preserveOutsideFocus: () => { preserveOutsideFocus = true; } };
}
