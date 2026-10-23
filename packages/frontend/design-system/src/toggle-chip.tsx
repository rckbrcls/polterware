import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import "./toggle-chip.css";

export type ToggleChipTone = "muted" | "syncing" | "warn";

export type ToggleChipProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  selected: boolean;
  /** Status tone used for the fill while selected. */
  tone?: ToggleChipTone;
};

/**
 * Multi-select pill: quiet when off, filled with a status tone when on. Use for independent
 * toggles (FilterChip is for exclusive filters).
 */
export function ToggleChip(props: ToggleChipProps) {
  const [local, rest] = splitProps(props, ["selected", "tone", "class"]);
  return (
    <button
      type="button"
      {...rest}
      class={`pw-toggle-chip ${local.class ?? ""}`}
      data-selected={local.selected ? "true" : "false"}
      data-tone={local.tone ?? "muted"}
      aria-pressed={local.selected}
    />
  );
}
