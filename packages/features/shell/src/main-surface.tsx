import type { JSX } from "solid-js";
export { PageHeader, PageContent, PageToolbar } from "@polterware/frontend-design-system";
import { MainSurfaceFrame } from "@polterware/frontend-shell";

/**
 * Large rounded content host — canonical `surface-panel` (edge-light rim).
 * See DESIGN.md Materials · surface-panel.
 */
export function MainSurface(props: { children: JSX.Element; class?: string }) {
  return <MainSurfaceFrame class={props.class}>{props.children}</MainSurfaceFrame>;
}
