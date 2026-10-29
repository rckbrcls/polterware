import { Checkbox as ArkCheckbox, type CheckboxRootProps } from "@ark-ui/solid/checkbox";
import { Show, splitProps, type JSX } from "solid-js";
import { Check, MinusSignIcon } from "./hugeicons";
import "./form-primitives.css";

export type CheckboxProps = Omit<CheckboxRootProps, "children"> & { label?: JSX.Element; shape?: "round" | "square" };
export function Checkbox(props: CheckboxProps) {
  const [local, rest] = splitProps(props, ["label", "shape", "class"]);
  return <ArkCheckbox.Root {...rest} class={`pw-checkbox ${local.class ?? ""}`} data-shape={local.shape ?? "square"}>
    <CheckboxControl />
    <Show when={local.label}><ArkCheckbox.Label>{local.label}</ArkCheckbox.Label></Show>
  </ArkCheckbox.Root>;
}

function CheckboxControl() {
  return <>
    <ArkCheckbox.HiddenInput />
    <ArkCheckbox.Control class="pw-checkbox__control">
      <ArkCheckbox.Indicator><Check size={12} /></ArkCheckbox.Indicator>
      <ArkCheckbox.Indicator indeterminate><MinusSignIcon size={12} /></ArkCheckbox.Indicator>
    </ArkCheckbox.Control>
  </>;
}

export type CheckboxRowProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: JSX.Element;
  leading?: JSX.Element;
  trailing?: JSX.Element;
  disabled?: boolean;
  shape?: "round" | "square";
  name?: string;
  value?: string;
  class?: string;
};

/** Selection row: checkbox on the left, then icon, label and muted trailing content. Use it for picking items from a list; `SwitchRow` is for on/off settings. */
export function CheckboxRow(props: CheckboxRowProps) {
  return <ArkCheckbox.Root
    class={`pw-checkbox pw-checkbox-row ${props.class ?? ""}`}
    data-shape={props.shape ?? "square"}
    checked={props.checked}
    disabled={props.disabled}
    name={props.name}
    value={props.value}
    onCheckedChange={(details) => props.onCheckedChange(details.checked === true)}
  >
    <CheckboxControl />
    <Show when={props.leading}><span class="pw-checkbox-row__side">{props.leading}</span></Show>
    <ArkCheckbox.Label class="pw-checkbox-row__label">{props.label}</ArkCheckbox.Label>
    <Show when={props.trailing}><span class="pw-checkbox-row__trailing">{props.trailing}</span></Show>
  </ArkCheckbox.Root>;
}
