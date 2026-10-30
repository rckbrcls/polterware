import { RadioGroup as ArkRadioGroup } from "@ark-ui/solid/radio-group";
import { For, Show, type JSX } from "solid-js";
import "./form-primitives.css";

export type RadioOption = {
  value: string;
  label: JSX.Element;
  /** Muted text at the row's end. */
  trailing?: JSX.Element;
  disabled?: boolean;
};

export type RadioGroupProps = {
  "aria-label": string;
  options: readonly RadioOption[];
  /** The picked value; empty while nothing is picked. */
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  class?: string;
};

/**
 * Pick exactly one of a few options, one row each like `CheckboxRow`: a round field control
 * that fills with the control material and a dot when picked, then the label. Arrow keys move
 * between the rows (Ark RadioGroup).
 */
export function RadioGroup(props: RadioGroupProps) {
  return (
    <ArkRadioGroup.Root
      class={`pw-radio-group ${props.class ?? ""}`}
      aria-label={props["aria-label"]}
      value={props.value || null}
      disabled={props.disabled}
      onValueChange={(details) => { if (details.value) props.onValueChange(details.value); }}
    >
      <For each={props.options}>
        {(option) => (
          <ArkRadioGroup.Item class="pw-radio-row" value={option.value} disabled={option.disabled}>
            <ArkRadioGroup.ItemControl class="pw-radio__control" />
            <ArkRadioGroup.ItemText class="pw-radio-row__label">{option.label}</ArkRadioGroup.ItemText>
            <Show when={option.trailing}><span class="pw-radio-row__trailing">{option.trailing}</span></Show>
            <ArkRadioGroup.ItemHiddenInput />
          </ArkRadioGroup.Item>
        )}
      </For>
    </ArkRadioGroup.Root>
  );
}

/**
 * The radio control alone, for single-choice rows that own their own keyboard and roles (the
 * property picker, Select, a single filter field): empty, or filled with the control material
 * and a dot when picked.
 */
export function RadioMark(props: { checked: boolean; class?: string }) {
  return <span class={`pw-radio__control pw-radio-mark ${props.class ?? ""}`} data-state={props.checked ? "checked" : "unchecked"} aria-hidden="true" />;
}
