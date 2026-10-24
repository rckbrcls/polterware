import { createSignal } from "solid-js";
import { Button } from "./button";
import { ProgressBar } from "./progress-bar";
import type { DocEntry } from "./docs/types";

function Controlled() {
  const [value, setValue] = createSignal(40);
  return <><ProgressBar label="Import progress" value={value()} class="w-48" /><Button size="sm" onClick={() => setValue(current => current >= 100 ? 0 : current + 20)}>Advance</Button></>;
}

export default {
  name: "Progress Bar",
  group: "Feedback",
  summary: "Linear Ark Progress with a recessed track, raised range and hidden accessible label. Values are percentages; null shows an empty track. Use tone for semantic colors, or set --progress-bar-color to an existing color token for categorical chart series.",
  exports: ["ProgressBar"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <ProgressBar label="Upload progress" value={68} class="w-48" />
      // #endregion
    ) },
    { id: "tones", title: "Tones", render: () => (
      // #region tones
      <div class="flex w-48 flex-col gap-3">
        <ProgressBar label="Accent" value={70} tone="accent" />
        <ProgressBar label="Blue" value={70} tone="blue" />
        <ProgressBar label="Violet" value={70} tone="violet" />
        <ProgressBar label="Success" value={70} tone="success" />
        <ProgressBar label="Warning" value={70} tone="warning" />
        <ProgressBar label="Danger" value={70} tone="danger" />
      </div>
      // #endregion
    ) },
    { id: "sizes", title: "Sizes", render: () => (
      // #region sizes
      <div class="flex w-48 flex-col gap-3"><ProgressBar label="Small progress" value={35} size="sm" /><ProgressBar label="Medium progress" value={82} size="md" /></div>
      // #endregion
    ) },
    { id: "empty", title: "Empty, unknown and complete", render: () => (
      // #region empty
      <div class="flex w-48 flex-col gap-3"><ProgressBar label="Not started" value={0} /><ProgressBar label="Quota usage unknown" value={null} /><ProgressBar label="Complete" value={100} /></div>
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
  ],
} satisfies DocEntry;
