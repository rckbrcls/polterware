import { Progress, type ProgressRootProps } from "@ark-ui/solid/progress";
import { createUniqueId, splitProps } from "solid-js";
import "./progress-bar.css";

export type ProgressBarProps = Omit<ProgressRootProps, "children" | "value" | "defaultValue" | "min" | "max" | "orientation"> & {
  /** Percentage from 0 to 100; null leaves an empty track with unknown value semantics. */
  value: number | null;
  /** Accessible label, visually hidden. */
  label: string;
  tone?: "accent" | "blue" | "violet" | "success" | "warning" | "danger";
  /** Track height: sm = 6px, md = 8px. */
  size?: "sm" | "md";
};

/** Recessed linear track with a raised range. Charts may set --progress-bar-color to an existing color token. */
export function ProgressBar(props: ProgressBarProps) {
  const [local, rest] = splitProps(props, ["value", "label", "tone", "size", "class", "translations", "aria-valuetext"]);
  const labelId = `${createUniqueId()}-label`;
  const value = () => local.value === null || !Number.isFinite(local.value) ? null : Math.max(0, Math.min(100, local.value));
  return <Progress.Root
    {...rest}
    value={value()}
    min={0}
    max={100}
    orientation="horizontal"
    translations={{ value: ({ value }) => value === null ? "Unknown" : `${value}%`, ...local.translations }}
    class={`pw-progress-bar ${local.class ?? ""}`}
    data-tone={local.tone ?? "accent"}
    data-size={local.size ?? "md"}
    data-empty={value() === null || value() === 0 ? "true" : undefined}
  >
    <Progress.Label id={labelId} class="pw-progress-bar__label">{local.label}</Progress.Label>
    <Progress.Context>{api => <Progress.Track
      class="pw-progress-bar__track rounded-full"
      aria-labelledby={labelId}
      aria-valuetext={local["aria-valuetext"] ?? api().valueAsString}
    >
      <Progress.Range class="pw-progress-bar__range rounded-full" />
    </Progress.Track>}</Progress.Context>
  </Progress.Root>;
}
