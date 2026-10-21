import { createSignal } from "solid-js";
import { IconNameField } from "./icon-name-field";
import type { PickerIconName } from "./icon-picker";
import type { DocEntry } from "./docs/types";

const swatches = [
  { value: "rgb(46, 125, 50)", label: "Green" },
  { value: "rgb(25, 118, 210)", label: "Blue" },
  { value: "rgb(123, 31, 162)", label: "Purple" },
];

function EditableField() {
  const [name, setName] = createSignal("Platform");
  const [icon, setIcon] = createSignal<PickerIconName>("folder");
  const [color, setColor] = createSignal("rgb(25, 118, 210)");
  return (
    // #region editable
    <IconNameField label="Component" name={name()} onNameInput={setName} icon={icon()} onIconChange={setIcon} color={color()} onColorChange={() => setColor("rgb(123, 31, 162)")} swatches={swatches} placeholder="Component name" />
    // #endregion
  );
}

export default {
  name: "Icon name field",
  group: "Inputs",
  summary: "IconNameField keeps a record name and its icon tile in one compact field. Clicking the tile opens the color and icon controls while the name remains an ordinary shared input.",
  exports: ["IconNameField"],
  examples: [
    { id: "editable", title: "Editable", render: () => <EditableField /> },
    { id: "empty", title: "Empty name", render: () => (
      // #region empty
      <IconNameField label="Domain" name="" onNameInput={() => undefined} icon="home" onIconChange={() => undefined} color="rgb(46, 125, 50)" onColorChange={() => undefined} swatches={swatches} placeholder="Domain name" />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
