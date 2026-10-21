import { Progress, type ProgressRootProps } from "@ark-ui/solid/progress";
import { createUniqueId, splitProps } from "solid-js";
import { SegmentDisplay } from "./segment-display";
import "./progress-ring.css";
export type ProgressRingProps = Omit<ProgressRootProps, "children"> & { label: string; size?: number; thickness?: number };
export function ProgressRing(props: ProgressRingProps) {
  const [local, rest] = splitProps(props, ["label", "size", "thickness", "class"]);
  const id = createUniqueId();
  const thickness = () => local.thickness ?? 6;
  // Texture: a recessed track and a raised range, each a dark frame, a lit rim and a gradient face
  // stacked as concentric strokes of the same arc.
  return <Progress.Root {...rest} class={`pw-progress-ring ${local.class ?? ""}`}>
    <Progress.Label class="pw-progress-ring__label">{local.label}</Progress.Label>
    <Progress.Circle style={{ "--size": `${local.size ?? 64}px`, "--thickness": `${thickness()}px` }}>
      {/* The circle is rotated -90deg, so the gradients turn +90deg to keep running top to bottom. */}
      <defs>
        <linearGradient id={`${id}-track`} x1="0" y1="0" x2="0" y2="1" gradientTransform="rotate(90 .5 .5)">
          <stop offset="0" class="pw-progress-ring__stop-track-top" /><stop offset="1" class="pw-progress-ring__stop-track-bottom" />
        </linearGradient>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1" gradientTransform="rotate(90 .5 .5)">
          <stop offset="0" class="pw-progress-ring__stop-face-top" /><stop offset="1" class="pw-progress-ring__stop-face-bottom" />
        </linearGradient>
      </defs>
      <Progress.CircleTrack class="pw-progress-ring__track-frame" />
      <Progress.CircleTrack class="pw-progress-ring__track" style={{ stroke: `url(#${id}-track)` }} />
      <Progress.CircleRange class="pw-progress-ring__range-frame" />
      <Progress.CircleRange class="pw-progress-ring__range-rim" />
      <Progress.CircleRange class="pw-progress-ring__range" style={{ stroke: `url(#${id}-face)` }} />
    </Progress.Circle>
    <Progress.ValueText class="pw-progress-ring__value" aria-hidden="true">
      <Progress.Context>{api => <SegmentDisplay value={api().percentAsString} size={Math.max(10, Math.round((local.size ?? 64) * 0.22))} />}</Progress.Context>
    </Progress.ValueText>
  </Progress.Root>;
}
