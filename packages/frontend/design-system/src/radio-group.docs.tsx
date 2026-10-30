import { createSignal } from "solid-js";
import { RadioGroup } from "./radio-group";
import type { DocEntry } from "./docs/types";

function Example() {
  const [value, setValue] = createSignal("");
  return (
    // #region default
    <div class="w-64">
      <RadioGroup aria-label="Reviewer" value={value()} onValueChange={setValue}
        options={[{ value: "ada", label: "Ada" }, { value: "grace", label: "Grace" }, { value: "edsger", label: "Edsger", trailing: "away" }]} />
    </div>
    // #endregion
  );
}

export default {
  name: "RadioGroup",
  group: "Inputs",
  summary: "Pick exactly one of a few options, one row each like CheckboxRow: a round field control that fills with the control material and a dot when picked. Arrow keys move between the rows. Use it for a short choice inside a panel, such as answering an Inbox question in its Morph. RadioMark is the control alone, leading each option of the PropertyPicker, Select, and single filter fields, so every single choice in the app reads as a radio.",
  exports: ["RadioGroup", "RadioMark"],
  examples: [{ id: "default", title: "Pick one", render: () => <Example /> }],
} satisfies DocEntry;
