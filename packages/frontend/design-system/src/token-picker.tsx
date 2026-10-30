import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { Button } from "./button";
import { Plus, X } from "./hugeicons";
import { PropertyPicker, type PropertyOption } from "./property-picker";
import "./active-filter-bar.css";
import "./token-picker.css";

export type TokenPickerProps = {
  /** What the tokens are, such as "Context"; it names the picker and the add button. */
  label: string;
  /** Shown on the add button while nothing is picked. */
  icon?: JSX.Element;
  options: readonly PropertyOption[];
  values: readonly string[];
  onChange: (values: string[]) => void;
  /** What an empty list means, such as "Whole project"; shown only while nothing is picked. */
  emptyLabel?: string;
  disabled?: boolean;
};

/**
 * A list of values edited as tokens, the way the filter menu adds them: each picked value
 * is a pill with its icon and a remove button, and the add button opens the shared
 * PropertyPicker with the values not picked yet.
 */
export function TokenPicker(props: TokenPickerProps) {
  const [open, setOpen] = createSignal(false);
  let add: HTMLButtonElement | undefined;
  const picked = createMemo(() =>
    props.values.map((value) => props.options.find((option) => option.value === value) ?? { value, label: value }),
  );
  const remaining = createMemo(() => props.options.filter((option) => !props.values.includes(option.value)));
  const empty = () => props.values.length === 0;
  return (
    <div class="pw-token-picker" role="group" aria-label={props.label}>
      <For each={picked()}>
        {(option) => (
          <span class="pw-filter-pill pw-texture-button pw-token-picker__token">
            <span class="pw-filter-pill__seg pw-filter-pill__value">
              <Show when={option.icon}>
                <span class="pw-token-picker__icon">{option.icon}</span>
              </Show>
              <span class="truncate">{option.label}</span>
            </span>
            <button
              type="button"
              class="pw-filter-pill__remove"
              aria-label={`Remove ${option.label}`}
              disabled={props.disabled}
              onClick={() => props.onChange(props.values.filter((value) => value !== option.value))}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        )}
      </For>
      <Show when={empty() || remaining().length > 0}>
        <Button
          ref={(element: HTMLButtonElement) => { add = element; }}
          size={empty() ? "sm" : "icon"}
          variant="texture"
          aria-label={empty() ? `${props.label}: ${props.emptyLabel ?? "none"}` : `Add ${props.label.toLowerCase()}`}
          aria-expanded={open()}
          disabled={props.disabled || remaining().length === 0}
          onClick={() => setOpen((current) => !current)}
        >
          <Show when={empty()} fallback={<Plus size={14} aria-hidden />}>
            {props.icon}
            {props.emptyLabel ?? props.label}
          </Show>
        </Button>
      </Show>
      <PropertyPicker
        label={props.label}
        options={remaining()}
        onChange={(value) => props.onChange([...props.values, value])}
        open={open()}
        onClose={() => setOpen(false)}
        anchorRef={() => add}
      />
    </div>
  );
}
