import { createSignal } from "solid-js";
import { Checkbox, CheckboxRow } from "./checkbox";
import type { DocEntry } from "./docs/types";

function Rows() {
  const [selected, setSelected] = createSignal<string[]>(["development"]);
  const toggle = (id: string, checked: boolean) =>
    setSelected((ids) => (checked ? [...ids, id] : ids.filter((item) => item !== id)));
  return (
    // #region rows
    <div class="w-64">
      {["development", "staging", "production"].map((id) => (
        <CheckboxRow label={id[0]!.toUpperCase() + id.slice(1)} checked={selected().includes(id)} onCheckedChange={(checked) => toggle(id, checked)} />
      ))}
    </div>
    // #endregion
  );
}

function Controlled() {
  const [checked, setChecked] = createSignal(true);
  return (
    // #region controlled
    <Checkbox label="Include verified facts" checked={checked()} onCheckedChange={(details) => setChecked(details.checked === true)} />
    // #endregion
  );
}

export default {
  name: "Checkbox",
  group: "Inputs",
  summary: "Checkboxes use Ark UI behavior with the shared form primitive treatment. They support labels, indeterminate state, and square or round controls. `CheckboxRow` is the selection row for lists (checkbox first, then icon, label and muted trailing); `SwitchRow` stays for on/off settings.",
  exports: ["Checkbox", "CheckboxRow"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <Checkbox label="Include archived decisions" defaultChecked />
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "states", title: "States", render: () => (
      // #region states
      <><Checkbox label="Partially selected" checked="indeterminate" /><Checkbox label="Unavailable option" disabled /></>
      // #endregion
    ) },
    { id: "rows", title: "Selection rows", render: () => <Rows /> },
    { id: "round", title: "Round", render: () => (
      // #region round
      <Checkbox label="Round selection" shape="round" defaultChecked />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
