import { SegmentDisplay } from "./segment-display";
import type { DocEntry } from "./docs/types";

export default {
  name: "Segment display",
  group: "Feedback",
  summary: "Seven-segment, digital-clock readout drawn in SVG. Use it for counters and timers where the digits should keep a fixed width; it needs no font file.",
  exports: ["SegmentDisplay"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <SegmentDisplay value="68%" />
      // #endregion
    ) },
    { id: "clock", title: "Clock", render: () => (
      // #region clock
      <SegmentDisplay value="24:59" size={32} />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
