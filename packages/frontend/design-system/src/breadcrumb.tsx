import { For, Show, type JSX } from "solid-js";
import { ChevronRight } from "./hugeicons";
import "./breadcrumb.css";

/** A step before the current place: a link back to it. */
export type BreadcrumbItem = { label: string; onSelect: () => void };

export type BreadcrumbProps = {
  /** The places above the current one, outermost first. */
  items: readonly BreadcrumbItem[];
  /** The current place, such as an open board or document. */
  current: string;
  /** Shown at 16px before the current place. */
  icon?: JSX.Element;
  class?: string;
};

/**
 * The trail to the open place. It sits centered in the toolbar or page header
 * (`PageToolbar.Center`); tabs stay at the start.
 */
export function Breadcrumb(props: BreadcrumbProps) {
  return (
    <nav class={`pw-breadcrumb ${props.class ?? ""}`} aria-label="Breadcrumb">
      <For each={props.items}>
        {(item) => (
          <>
            <button type="button" class="pw-breadcrumb__link" onClick={() => item.onSelect()}>{item.label}</button>
            <ChevronRight size={12} aria-hidden="true" class="pw-breadcrumb__separator" />
          </>
        )}
      </For>
      <Show when={props.icon}>
        <span class="pw-breadcrumb__icon" aria-hidden="true">{props.icon}</span>
      </Show>
      <span class="pw-breadcrumb__current" aria-current="page">{props.current}</span>
    </nav>
  );
}
