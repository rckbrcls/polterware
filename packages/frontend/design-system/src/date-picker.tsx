import { DatePicker as ArkDatePicker, type DatePickerRootProps } from "@ark-ui/solid/date-picker";
import { splitProps } from "solid-js";
import { Portal } from "solid-js/web";
import { CalendarBody } from "./calendar";
import { CalendarClock } from "./hugeicons";
import "./button.css";
import "./calendar.css";
import { createPopupMotion } from "./popup-motion";
import { createPanelPortalOwnership } from "./panel-interaction";
import "./picker-primitives.css";
import "./popover.css";
export { parseDate, type DateValue } from "@ark-ui/solid/date-picker";
export type DatePickerProps = Omit<DatePickerRootProps, "children"> & { label: string };
export function DatePicker(props: DatePickerProps) {
  const [local, rest] = splitProps(props, ["label", "class"]);
  const ownPortal = createPanelPortalOwnership(() => true);
  return <ArkDatePicker.Root {...rest} class={`pw-date-picker ${local.class ?? ""}`} lazyMount unmountOnExit>
    <ArkDatePicker.Label>{local.label}</ArkDatePicker.Label>
    <ArkDatePicker.Control class="pw-picker__control">
      <ArkDatePicker.Input class="control-field pw-field-control control-field-sm" />
      <ArkDatePicker.Trigger class="pw-primitive-button pw-texture-button" aria-label="Choose date"><CalendarClock size={14} /></ArkDatePicker.Trigger>
      <ArkDatePicker.ClearTrigger class="pw-primitive-button pw-texture-button" aria-label="Clear date">Clear</ArkDatePicker.ClearTrigger>
    </ArkDatePicker.Control>
    <Portal><ArkDatePicker.Positioner class="pw-popover-positioner">
      <ArkDatePicker.Content ref={ownPortal} class="pw-popover-presence">
        <DatePickerSurface />
      </ArkDatePicker.Content>
    </ArkDatePicker.Positioner></Portal>
  </ArkDatePicker.Root>;
}
function DatePickerSurface() {
  const motion = createPopupMotion();
  return <div ref={motion.ref} class="surface-panel-float pw-date-picker__surface">
    <div class="pw-calendar-picker__content"><CalendarBody /></div>
  </div>;
}
