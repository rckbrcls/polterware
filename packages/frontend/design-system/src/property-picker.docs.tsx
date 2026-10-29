import { createSignal } from "solid-js";
import { Button } from "./button";
import { PropertyPicker } from "./property-picker";
import type { DocEntry } from "./docs/types";

function PropertyPickerExample() {
  const [open, setOpen] = createSignal(false);
  const [stage, setStage] = createSignal("plan");
  const [options, setOptions] = createSignal([
    { value: "shape", label: "Shape" },
    { value: "plan", label: "Plan" },
    { value: "build", label: "Build" },
    { value: "verify", label: "Verify" },
  ]);
  let anchor: HTMLButtonElement | undefined;
  return (
    // #region default
    <>
      <Button ref={anchor} variant="texture" onClick={() => setOpen(true)}>
        Stage: {options().find((option) => option.value === stage())?.label}
      </Button>
      <PropertyPicker
        label="Stage"
        options={options()}
        value={stage()}
        open={open()}
        onClose={() => setOpen(false)}
        onChange={setStage}
        onCreate={(text) => {
          const value = text.toLowerCase();
          setOptions([...options(), { value, label: text }]);
          return value;
        }}
        anchorRef={() => anchor}
      />
    </>
    // #endregion
  );
}

export default {
  name: "Property picker",
  group: "Menus",
  summary:
    "Sets one property from a short list: type to filter, arrows and Enter, or a digit for the nth option while the filter is empty. With onCreate, unmatched text becomes a new option.",
  exports: ["PropertyPicker"],
  examples: [{ id: "default", title: "Stage", description: "Press 1–4 after opening it.", render: () => <PropertyPickerExample /> }],
} satisfies DocEntry;
