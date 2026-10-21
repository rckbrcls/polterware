import { ControlButton } from "./control-button";
import { PlusIcon, Settings } from "./hugeicons";
import type { DocEntry } from "./docs/types";

export default {
  name: "Control button",
  group: "Buttons",
  summary: "ControlButton is an opaque shared control-field button for text actions and round icon controls. Icon controls require an accessible name.",
  exports: ["ControlButton"],
  examples: [
    { id: "text", title: "Text", render: () => (
      // #region text
      <ControlButton><PlusIcon size={14} /> Add evidence</ControlButton>
      // #endregion
    ) },
    { id: "tones", title: "Tones", render: () => (
      // #region tones
      <>
        <ControlButton>Secondary</ControlButton>
        <ControlButton tone="brand">Brand</ControlButton>
        <ControlButton tone="danger">Danger</ControlButton>
        <ControlButton tone="neutral">Neutral</ControlButton>
        <ControlButton tone="success">Success</ControlButton>
        <ControlButton tone="warn">Warn</ControlButton>
        <ControlButton tone="info">Info</ControlButton>
        <ControlButton tone="critical">Critical</ControlButton>
        <ControlButton tone="violet">Violet</ControlButton>
        <ControlButton tone="teal">Teal</ControlButton>
        <ControlButton tone="pink">Pink</ControlButton>
      </>
      // #endregion
    ) },
    { id: "icon", title: "Icon", render: () => (
      // #region icon
      <ControlButton icon aria-label="Open settings"><Settings size={14} /></ControlButton>
      // #endregion
    ) },
    { id: "disabled", title: "Disabled", render: () => (
      // #region disabled
      <ControlButton disabled>Unavailable action</ControlButton>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
