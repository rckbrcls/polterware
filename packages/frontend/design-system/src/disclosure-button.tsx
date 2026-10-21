import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { ChevronRight } from "./hugeicons";
import "./disclosure-button.css";

export type DisclosureButtonProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-expanded"
> & {
  expanded: boolean;
  /** Icon-only control: the accessible name is required, e.g. "Expand Billing". */
  "aria-label": string;
  /** Hit-area width: tree rows use `compact`, list headers `regular`. */
  size?: "compact" | "regular";
};

/**
 * Quiet chevron that expands or collapses a row, tree node or section. Stretches to the row
 * height and rotates a quarter turn when expanded.
 */
export function DisclosureButton(props: DisclosureButtonProps) {
  const [local, rest] = splitProps(props, ["expanded", "size", "class"]);
  return (
    <button
      type="button"
      aria-expanded={local.expanded}
      {...rest}
      class={`pw-disclosure-button ${local.class ?? ""}`}
      data-size={local.size ?? "regular"}
    >
      <ChevronRight
        size={14}
        aria-hidden
        class="pw-disclosure-button__icon"
        classList={{ "rotate-90": local.expanded }}
      />
    </button>
  );
}
