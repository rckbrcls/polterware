import type { JSX } from "solid-js";
import type { BadgeTone } from "./badge";
import "./badge.css";
import "./count-badge.css";

export type CountBadgeTone = "neutral" | "info" | "warning" | "success" | "danger";

export type CountBadgeProps = {
  count: number;
  ariaLabel?: string;
  tone?: CountBadgeTone;
  class?: string;
};

const badgeTones: Record<CountBadgeTone, BadgeTone> = {
  neutral: "muted",
  info: "info",
  warning: "warn",
  success: "ok",
  danger: "danger",
};

/** Inline count with the same opaque frame, rim, and raised face as sidebar badges. */
export function CountBadge(props: CountBadgeProps): JSX.Element {
  return (
    <span
      class={`pw-badge pw-count-badge ${props.class ?? ""}`}
      data-tone={badgeTones[props.tone ?? "info"]}
      aria-label={props.ariaLabel ?? `${props.count} items`}
    >
      {props.count}
    </span>
  );
}
