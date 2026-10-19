import { onCleanup, onMount, type Accessor } from "solid-js";
import { panelOwnsTarget, type PanelInteractionOwner } from "../panel-interaction";
import type { DesignSystemShortcut } from "../provider";
import { isPanelVisible } from "./panel-visible";

type ShortcutPanel = {
  root: Accessor<HTMLElement | undefined>;
  interaction: PanelInteractionOwner;
  visible: Accessor<boolean>;
  enabled: Accessor<boolean>;
  expanded: Accessor<boolean>;
  resizing: Accessor<boolean>;
  focusInFrame: Accessor<boolean>;
  matchesShortcut: (id: DesignSystemShortcut, event: KeyboardEvent) => boolean;
  cancelResize: () => void;
  collapse: () => void;
  restoreFocus: () => void;
  toggleExpanded: () => void;
  close: () => void;
};

const panels = new Set<ShortcutPanel>();
function depth(panel: ShortcutPanel) {
  let result = 0;
  for (let owner = panel.interaction.parent; owner; owner = owner.parent) result++;
  return result;
}
function innermost(candidates: ShortcutPanel[]) {
  return candidates.reduce<ShortcutPanel | undefined>((current, panel) => !current || depth(panel) >= depth(current) ? panel : current, undefined);
}
function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  const escape = event.key === "Escape";
  if (!escape && event.repeat) return;
  const candidates = Array.from(panels).filter((panel) => panel.visible() && (escape || panel.enabled()) && isPanelVisible(panel.root()));
  const focused = candidates.filter((panel) => panel.root()?.contains(document.activeElement) || panelOwnsTarget(panel.interaction, document.activeElement));
  const panel = innermost(focused) ?? innermost(candidates);
  if (!panel) return;
  const claim = () => { event.preventDefault(); event.stopImmediatePropagation(); };
  if (escape) {
    if (panel.resizing()) { claim(); panel.cancelResize(); return; }
    if (panel.expanded() && (panel.focusInFrame() || document.activeElement === document.body)) {
      claim(); panel.collapse(); return;
    }
    if (panel.focusInFrame()) { claim(); panel.restoreFocus(); }
    return;
  }
  if (panel.matchesShortcut("shell.maximize_detail", event)) {
    claim(); panel.toggleExpanded();
  } else if (panel.matchesShortcut("shell.toggle_detail", event)) {
    claim(); panel.close();
  }
}

/** One window listener selects one owner before a command can change panel state. */
export function createPanelShortcuts(panel: ShortcutPanel) {
  onMount(() => {
    if (!panels.size) window.addEventListener("keydown", onKeyDown);
    panels.add(panel);
    onCleanup(() => {
      panels.delete(panel);
      if (!panels.size) window.removeEventListener("keydown", onKeyDown);
    });
  });
}
