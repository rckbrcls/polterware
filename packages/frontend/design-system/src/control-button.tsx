import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import "./control-button.css";

export type ControlButtonTone = "secondary" | "brand" | "danger" | "neutral" | "success" | "warn" | "info" | "critical" | "violet" | "teal" | "pink";

export type ControlButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ControlButtonTone;
  /** Round icon control. Requires an accessible name via `aria-label`. */
  icon?: boolean;
};

const base =
  "control-field control-field-md inline-flex shrink-0 cursor-pointer items-center justify-center font-medium select-none [&_svg]:pointer-events-none [&_svg]:shrink-0";

const shapeClass = {
  icon: "w-[var(--control-height-md)] !rounded-full p-0 [&_svg]:h-3.5 [&_svg]:w-3.5",
  text: "gap-1.5",
} satisfies Record<"icon" | "text", string>;

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Opaque control-field button. Icon form matches the Polterware title-bar search control.
 * Text form keeps the same chrome at `--radius-control`.
 */
export function ControlButton(props: ControlButtonProps) {
  const [local, rest] = splitProps(props, ["tone", "icon", "class", "classList"]);
  const className = () =>
    cn("pw-control-button", base, local.icon ? shapeClass.icon : shapeClass.text, local.class);
  return (
    <button
      type="button"
      {...rest}
      data-tone={local.tone ?? "secondary"}
      class={className()}
      classList={local.classList}
    />
  );
}
