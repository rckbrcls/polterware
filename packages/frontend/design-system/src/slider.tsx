import { Slider as ArkSlider, type SliderRootProps } from "@ark-ui/solid/slider";
import { Index, Show, splitProps } from "solid-js";
import "./form-primitives.css";
export type SliderProps = Omit<SliderRootProps, "children"> & { label?: string };
export function Slider(props: SliderProps) {
  const [local, rest] = splitProps(props, ["label", "class"]);
  return <ArkSlider.Root thumbAlignment="contain" thumbSize={{ width: 20, height: 20 }} {...rest} class={`pw-slider ${local.class ?? ""}`}>
    <Show when={local.label}><ArkSlider.Label>{local.label}</ArkSlider.Label></Show>
    <ArkSlider.Control class="pw-slider__control">
      <ArkSlider.Track class="pw-slider__track"><ArkSlider.Range class="pw-slider__range" /></ArkSlider.Track>
      <ArkSlider.Context>{context => <Index each={context().value}>{(_, index) =>
        <ArkSlider.Thumb index={index} class="pw-slider__thumb"><ArkSlider.HiddenInput /></ArkSlider.Thumb>
      }</Index>}</ArkSlider.Context>
    </ArkSlider.Control>
  </ArkSlider.Root>;
}
