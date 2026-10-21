import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import "./switcher-trigger.css";

export type SwitcherTriggerProps = JSX.ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Flat text trigger that opens a switcher popover (project, environment, scope). Content is
 * a truncating label or a StatusChip; pair it with `aria-expanded` and a descriptive `aria-label`.
 */
export function SwitcherTrigger(props: SwitcherTriggerProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <button type="button" {...rest} class={`pw-switcher-trigger ${local.class ?? ""}`} />
  );
}
