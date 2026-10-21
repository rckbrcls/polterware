import { createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import { ColorSwatchPicker, parseColor, type ColorSwatchOption } from "./color-swatch-picker";
import { Field } from "./field";
import { IconPicker, PICKER_ICONS, type PickerIconName } from "./icon-picker";
import { IconTile } from "./icon-tile";
import { Input } from "./input";
import { Popover } from "./popover";
import "./icon-name-field.css";

export type IconNameFieldProps = {
  label: string;
  /** Seeds the icon tile's finish, so it matches the entity's other tiles. */
  seed?: string;
  name: string;
  onNameInput: (value: string) => void;
  icon: PickerIconName;
  onIconChange: (value: PickerIconName) => void;
  /** Hex color of the tile. */
  color: string;
  /** Receives the color picker's change details; the owner converts them to its stored format. */
  onColorChange: (details: unknown) => void;
  swatches: readonly ColorSwatchOption[];
  placeholder?: string;
};

/**
 * Name input with the record's icon tile beside it. The tile opens a popover with the color row and
 * the icon grid, so the form stays one row tall.
 */
export function IconNameField(props: IconNameFieldProps) {
  const [open, setOpen] = createSignal(false);
  let trigger: HTMLButtonElement | undefined;
  return (
    <Field label={props.label}>
      <div class="pw-icon-name-field">
        <button
          ref={trigger}
          type="button"
          class="pw-icon-name-field__trigger control-field pw-field-control"
          aria-label={`${props.label} icon and color`}
          aria-haspopup="dialog"
          aria-expanded={open()}
          onClick={(event) => { event.preventDefault(); setOpen(!open()); }}
        >
          <IconTile size={28} tone="knowledge" accent={props.color || undefined} seed={props.seed}>
            <Dynamic component={PICKER_ICONS[props.icon] ?? PICKER_ICONS.brain} size={16} />
          </IconTile>
        </button>
        <Input value={props.name} placeholder={props.placeholder} onInput={(event) => props.onNameInput(event.currentTarget.value)} />
      </div>
      <Popover open={open()} onClose={() => { setOpen(false); trigger?.focus(); }} anchorRef={() => trigger} title={`${props.label} icon and color`} width={280}>
        <div class="pw-icon-name-field__popover">
          <ColorSwatchPicker
            label="Color"
            class="pw-icon-name-field__colors"
            value={parseColor(props.color)}
            onValueChange={(details) => props.onColorChange(details)}
            swatches={props.swatches}
          />
          <IconPicker.Grid value={props.icon} label={`${props.label} icon`} onValueChange={(value) => props.onIconChange(value)} />
        </div>
      </Popover>
    </Field>
  );
}
