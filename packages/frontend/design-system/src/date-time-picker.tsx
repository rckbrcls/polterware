import { Show, createMemo, createSignal } from "solid-js";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { CalendarClock, X } from "./hugeicons";
import { Popover } from "./popover";
import "./date-time-picker.css";

export type DateTimePickerProps = {
  /** `YYYY-MM-DD` when `dateOnly`, otherwise local `YYYY-MM-DDTHH:mm`; empty when unset. */
  value?: string;
  onValueChange: (value: string) => void;
  /** Hides the time row and stores only the day. */
  dateOnly?: boolean;
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  class?: string;
  "aria-label"?: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

function split(value: string | undefined): { day: string; hours: number; minutes: number } {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value ?? "");
  return { day: match?.[1] ?? "", hours: Number(match?.[2] ?? 9), minutes: Number(match?.[3] ?? 0) };
}

function display(value: string | undefined, dateOnly: boolean | undefined): string {
  const { day, hours, minutes } = split(value);
  if (!day) return "";
  const [year, month, date] = day.split("-");
  const label = `${date}/${month}/${year}`;
  return dateOnly ? label : `${label}, ${pad(hours)}:${pad(minutes)}`;
}

function TimeField(props: { label: string; value: number; max: number; onCommit: (value: number) => void }) {
  const commit = (raw: string) => {
    const number = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(number)) props.onCommit(Math.max(0, Math.min(props.max, Math.trunc(number))));
  };
  return <input
    class="pw-date-time-picker__time-field control-field pw-field-control control-field-sm"
    inputmode="numeric"
    maxlength={2}
    aria-label={props.label}
    value={pad(props.value)}
    onFocus={event => event.currentTarget.select()}
    onChange={event => { commit(event.currentTarget.value); event.currentTarget.value = pad(props.value); }}
    onKeyDown={event => {
      const step = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      props.onCommit((props.value + step + props.max + 1) % (props.max + 1));
    }}
  />;
}

/** Field + popover combining the shared Calendar with an hours/minutes row. */
export function DateTimePicker(props: DateTimePickerProps) {
  const [open, setOpen] = createSignal(false);
  let trigger: HTMLButtonElement | undefined;
  const parts = createMemo(() => split(props.value));
  const emit = (day: string, hours: number, minutes: number) => {
    if (!day) { props.onValueChange(""); return; }
    props.onValueChange(props.dateOnly ? day : `${day}T${pad(hours)}:${pad(minutes)}`);
  };
  const day = () => parts().day || split(new Date().toISOString()).day;
  const text = () => display(props.value, props.dateOnly);
  return <>
    <button
      ref={trigger}
      type="button"
      disabled={props.disabled}
      aria-label={props["aria-label"] ?? "Choose date"}
      aria-haspopup="dialog"
      aria-expanded={open()}
      class={`pw-date-time-picker control-field pw-field-control control-field-${props.size ?? "sm"} ${props.class ?? ""}`}
      onClick={() => setOpen(value => !value)}
    >
      <span class="pw-date-time-picker__value" data-empty={text() ? undefined : ""}>{text() || props.placeholder || "Set date"}</span>
      <CalendarClock size={14} aria-hidden />
    </button>
    <Popover open={open() && !props.disabled} onClose={() => { setOpen(false); trigger?.focus(); }} anchorRef={() => trigger} title="Choose date" width={284}>
      <div class="pw-date-time-picker__body">
        <Calendar value={parts().day} onValueChange={day => emit(day, parts().hours, parts().minutes)} />
        <Show when={!props.dateOnly}>
          <div class="pw-date-time-picker__time">
            <span class="pw-date-time-picker__time-label">Time</span>
            <div class="pw-date-time-picker__time-fields" role="group" aria-label="Time">
              <TimeField label="Hours" value={parts().hours} max={23} onCommit={hours => emit(day(), hours, parts().minutes)} />
              <span aria-hidden="true">:</span>
              <TimeField label="Minutes" value={parts().minutes} max={59} onCommit={minutes => emit(day(), parts().hours, minutes)} />
            </div>
          </div>
        </Show>
        <Show when={text()}>
          <Button variant="ghost" size="sm" class="pw-date-time-picker__clear" onClick={() => { props.onValueChange(""); setOpen(false); trigger?.focus(); }}><X size={14} /> Clear</Button>
        </Show>
      </div>
    </Popover>
  </>;
}
