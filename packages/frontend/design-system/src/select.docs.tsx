import { createSignal } from "solid-js";
import { Select } from "./select";
import type { DocEntry } from "./docs/types";

const options = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

function Controlled() {
  const [value, setValue] = createSignal("week");
  return (
    // #region controlled
    <Select aria-label="Calendar view" options={options} value={value()} onChange={setValue} />
    // #endregion
  );
}

export default {
  name: "Select",
  group: "Inputs",
  summary:
    "Single-choice select built on the Ark menu with the shared control-field trigger. For large datasets use a searchable picker instead.",
  exports: ["Select"],
  examples: [
    {
      id: "default",
      title: "Default",
      render: () => (
        // #region default
        <Select aria-label="Calendar view" options={options} defaultValue="day" />
        // #endregion
      ),
    },
    {
      id: "controlled",
      title: "Controlled",
      render: () => <Controlled />,
    },
    {
      id: "options",
      title: "Options with separators and disabled items",
      render: () => (
        // #region options
        <Select
          aria-label="Visibility"
          options={[
            { value: "private", label: "Private" },
            { value: "team", label: "Team" },
            { value: "public", label: "Public", disabled: true, separatorBefore: true },
          ]}
          defaultValue="private"
        />
        // #endregion
      ),
    },
    {
      id: "disabled",
      title: "Disabled",
      render: () => (
        // #region disabled
        <Select aria-label="Disabled select" options={options} defaultValue="day" disabled />
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
