import { For, splitProps, type JSX } from "solid-js";
import "./segment-display.css";

export type SegmentDisplayProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> & {
  /** Text to show; supports digits, `#`, `:`, `%`, `-`, `.` and spaces. Other characters render blank. */
  value: string | number;
  /** Glyph height in px; the width follows. */
  size?: number;
};

// Segments a-g in clockwise order from the top bar, with g in the middle.
const SEGMENTS = {
  a: "M2.5 2H7.5", b: "M8.5 3V8", c: "M8.5 10V15", d: "M2.5 16H7.5", e: "M1.5 10V15", f: "M1.5 3V8", g: "M2.5 9H7.5",
} as const;
type Segment = keyof typeof SEGMENTS;

const DIGITS: Record<string, readonly Segment[]> = {
  "0": ["a", "b", "c", "d", "e", "f"], "1": ["b", "c"], "2": ["a", "b", "g", "e", "d"], "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"], "5": ["a", "f", "g", "c", "d"], "6": ["a", "f", "g", "e", "c", "d"], "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"], "9": ["a", "b", "c", "d", "f", "g"], "-": ["g"],
};

function Glyph(props: { char: string }) {
  const lit = () => DIGITS[props.char];
  if (props.char === ":" || props.char === ".") {
    return <svg class="pw-segment-display__glyph pw-segment-display__glyph--narrow" viewBox="0 0 4 18" aria-hidden="true">
      <circle cx="2" cy="15" r="1" class="pw-segment-display__lit" />
      {props.char === ":" && <circle cx="2" cy="5.5" r="1" class="pw-segment-display__lit" />}
    </svg>;
  }
  if (props.char === "%") {
    return <svg class="pw-segment-display__glyph" viewBox="0 0 10 18" aria-hidden="true">
      <path d="M2.5 5H3.5" class="pw-segment-display__stroke" />
      <path d="M6.5 13H7.5" class="pw-segment-display__stroke" />
      <path d="M2 2H4M4.5 2.5V4.5M4.5 5.5V7.5M2 8H4M1.5 5.5V7.5M1.5 2.5V4.5" class="pw-segment-display__stroke pw-segment-display__lit" />
      <path d="M6 10H8M8.5 10.5V12.5M8.5 13.5V15.5M6 16H8M5.5 13.5V15.5M5.5 10.5V12.5" class="pw-segment-display__stroke pw-segment-display__lit" />
      <path d="M8.5 3L1.5 15" class="pw-segment-display__stroke pw-segment-display__lit" />
    </svg>;
  }
  if (props.char === "#") {
    return <svg class="pw-segment-display__glyph" viewBox="0 0 10 18" aria-hidden="true">
      <path d="M4 4L3 14M7.5 4L6.5 14M1.5 7.5H8.5M1 11H8" class="pw-segment-display__stroke pw-segment-display__lit" />
    </svg>;
  }
  if (props.char === " ") return <svg class="pw-segment-display__glyph pw-segment-display__glyph--narrow" viewBox="0 0 4 18" aria-hidden="true" />;
  return <svg class="pw-segment-display__glyph" viewBox="0 0 10 18" aria-hidden="true">
    <For each={Object.keys(SEGMENTS) as Segment[]}>{segment => (
      <path d={SEGMENTS[segment]} class="pw-segment-display__stroke" classList={{ "pw-segment-display__lit": Boolean(lit()?.includes(segment)) }} />
    )}</For>
  </svg>;
}

/** Seven-segment, digital-clock readout drawn in SVG, so it needs no font file. Unlit segments stay faintly visible like an LCD. */
export function SegmentDisplay(props: SegmentDisplayProps) {
  const [local, rest] = splitProps(props, ["value", "size", "class", "style"]);
  const text = () => String(local.value);
  return <span
    role="img"
    aria-label={text()}
    {...rest}
    class={`pw-segment-display ${local.class ?? ""}`}
    style={{ "--segment-height": `${local.size ?? 14}px`, ...(typeof local.style === "object" ? local.style : {}) }}
  >
    <For each={[...text()]}>{char => <Glyph char={char} />}</For>
  </span>;
}
