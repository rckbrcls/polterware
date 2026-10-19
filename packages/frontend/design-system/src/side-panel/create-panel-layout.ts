import { createEffect, createSignal, onCleanup, onMount, type Accessor } from "solid-js";
import type { PanelExitGeometry } from "./create-panel-presence";
import { clampDetailPanelWidth } from "./panel-width";

export function createPanelLayout(options: {
  workspace: Accessor<HTMLElement | undefined>;
  preferredWidth: Accessor<number>;
  cancelResize: () => void;
}) {
  const [hostWidth, setHostWidth] = createSignal(0);
  const panelWidth = () => clampDetailPanelWidth(options.preferredWidth(), hostWidth());
  onMount(() => {
    const workspace = options.workspace();
    const measure = () => {
      if (!workspace) return;
      const width = workspace.getBoundingClientRect().width;
      if (width !== hostWidth()) options.cancelResize();
      setHostWidth(width);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    if (workspace) observer?.observe(workspace);
    window.addEventListener("resize", measure);
    onCleanup(() => { observer?.disconnect(); window.removeEventListener("resize", measure); });
  });
  return { hostWidth, panelWidth };
}

/** Retain the departing column until exit ends; overlays never reserve a column. */
export function createPanelSpace(options: {
  root: Accessor<HTMLElement | undefined>;
  overlay: Accessor<boolean>;
  visible: Accessor<boolean>;
  expanded: Accessor<boolean>;
  present: Accessor<boolean>;
  exitGeometry: Accessor<PanelExitGeometry | undefined>;
  panelWidth: Accessor<number>;
  hostWidth: Accessor<number>;
}) {
  createEffect(() => {
    const geometry = options.exitGeometry();
    const width = !options.visible() && geometry ? clampDetailPanelWidth(geometry.width, options.hostWidth()) : options.panelWidth();
    const reserved = !options.overlay() && (options.visible() ? !options.expanded() : options.present() && geometry !== undefined && !geometry.expanded);
    options.root()?.style.setProperty("--detail-panel-width", `${width}px`);
    options.root()?.style.setProperty("--detail-panel-space", reserved ? `${width + 8}px` : "0px");
  });
}
