import { createSignal } from "solid-js";
import { ColorSwatchPicker, parseColor } from "./color-swatch-picker";
import type { DocEntry } from "./docs/types";

const swatches = [
  { value: "rgb(46, 125, 50)", label: "Green" },
  { value: "rgb(25, 118, 210)", label: "Blue" },
  { value: "rgb(123, 31, 162)", label: "Purple" },
];

function Controlled() {
  const [value, setValue] = createSignal(parseColor("rgb(25, 118, 210)"));
  return (
    // #region controlled
    <ColorSwatchPicker label="Accent color" swatches={swatches} value={value()} onValueChange={(details) => setValue(details.value)} />
    // #endregion
  );
}

export default {
  name: "Color swatch picker",
  group: "Inputs",
  summary: "ColorSwatchPicker is an Ark color picker constrained to the supplied named swatches. Its visible label also becomes the swatch group label for assistive technology.",
  exports: ["ColorSwatchPicker"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <ColorSwatchPicker label="Accent color" swatches={swatches} defaultValue={parseColor("rgb(46, 125, 50)")} />
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "disabled", title: "Disabled", render: () => (
      // #region disabled
      <ColorSwatchPicker label="Locked accent" swatches={swatches} value={parseColor("rgb(123, 31, 162)")} disabled />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
