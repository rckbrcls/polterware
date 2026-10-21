import { NumberInput, type NumberInputRootProps } from "@ark-ui/solid/number-input";
import { Show, splitProps } from "solid-js";
import { MinusSignIcon, Plus } from "./hugeicons";
import "./button.css";
import "./form-primitives.css";
export type NumberStepperProps = Omit<NumberInputRootProps, "children"> & { label?: string };
export function NumberStepper(props: NumberStepperProps) {
  const [local, rest] = splitProps(props, ["label", "class"]);
  return <NumberInput.Root {...rest} class={`pw-stepper ${local.class ?? ""}`}>
    <Show when={local.label}><NumberInput.Label>{local.label}</NumberInput.Label></Show>
    <NumberInput.Control class="pw-stepper__control">
      <NumberInput.DecrementTrigger class="pw-primitive-button pw-texture-button" aria-label="Decrease"><MinusSignIcon size={12} /></NumberInput.DecrementTrigger>
      <NumberInput.Input class="control-field pw-field-control control-field-sm pw-stepper__input" aria-label={local.label} />
      <NumberInput.IncrementTrigger class="pw-primitive-button pw-texture-button" aria-label="Increase"><Plus size={12} /></NumberInput.IncrementTrigger>
    </NumberInput.Control>
  </NumberInput.Root>;
}
