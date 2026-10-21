import { createSignal } from "solid-js";
import { Button } from "./button";
import { ProgressRing } from "./progress-ring";
import type { DocEntry } from "./docs/types";

function Controlled() {
  const [value, setValue] = createSignal(40);
  return <><ProgressRing label="Import progress" value={value()} min={0} max={100} /><Button size="sm" onClick={() => setValue((current) => current >= 100 ? 0 : current + 20)}>Advance</Button></>;
}

export default {
  name: "Progress Ring",
  group: "Feedback",
  summary: "Circular progress built on Ark Progress, with an accessible label and visible value text. Adjust its diameter and track thickness only when the surrounding density calls for it.",
  exports: ["ProgressRing"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <ProgressRing label="Upload progress" value={68} min={0} max={100} />
      // #endregion
    ) },
    { id: "sizes", title: "Sizes", render: () => (
      // #region sizes
      <><ProgressRing label="Small progress" value={35} min={0} max={100} size={40} thickness={3} /><ProgressRing label="Large progress" value={82} min={0} max={100} size={80} thickness={6} /></>
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
  ],
} satisfies DocEntry;
