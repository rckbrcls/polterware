import { For, Show, createSignal } from "solid-js";
import { Button } from "./button";
import { FilterChip } from "./filter-chip";
import { ArrowDown, ArrowUp, SlidersHorizontalIcon } from "./hugeicons";
import { Popover } from "./popover";
import { Select } from "./select";
import "./display-options.css";

export type DisplayChoice = { value: string; label: string };

export type DisplayOptionsProps = {
  /** How rows split into sections ("none" keeps one list). */
  grouping?: {
    options: readonly DisplayChoice[];
    value: string;
    onChange: (value: string) => void;
  };
  /** The field rows sort by, and its direction. */
  ordering?: {
    options: readonly DisplayChoice[];
    value: string;
    onChange: (value: string) => void;
    direction: "ascending" | "descending";
    onDirectionChange: (direction: "ascending" | "descending") => void;
  };
  /** Columns or row properties someone can show or hide. */
  properties?: {
    options: readonly DisplayChoice[];
    visible: readonly string[];
    onChange: (visible: string[]) => void;
  };
  /** Accessible name of the toolbar button. */
  label?: string;
};

/**
 * Linear's "Display" menu: one toolbar icon that opens grouping, ordering, and the
 * properties a list shows. The surface owns the values and remembers them.
 */
export function DisplayOptions(props: DisplayOptionsProps) {
  const [open, setOpen] = createSignal(false);
  let trigger: HTMLButtonElement | undefined;

  function toggleProperty(value: string) {
    const properties = props.properties;
    if (!properties) return;
    const visible = properties.visible.includes(value)
      ? properties.visible.filter((item) => item !== value)
      : properties.options.map((option) => option.value).filter((item) => item === value || properties.visible.includes(item));
    properties.onChange(visible);
  }

  return (
    <>
      <Button
        ref={trigger}
        variant="texture"
        size="icon"
        aria-label={props.label ?? "Display options"}
        aria-expanded={open()}
        selected={open()}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontalIcon size={14} />
      </Button>
      <Popover open={open()} onClose={() => setOpen(false)} title="Display" width={320} placement="bottom-end" anchorRef={() => trigger}>
        <div class="pw-display-options">
          <Show when={props.grouping}>
            {(grouping) => (
              <div class="pw-display-options__row">
                <span class="pw-display-options__label">Grouping</span>
                <Select class="pw-display-options__select" options={grouping().options}
                  value={grouping().value} onChange={grouping().onChange} aria-label="Grouping" />
              </div>
            )}
          </Show>
          <Show when={props.ordering}>
            {(ordering) => (
              <div class="pw-display-options__row">
                <span class="pw-display-options__label">Ordering</span>
                <span class="pw-display-options__controls">
                  <Select class="pw-display-options__select" options={ordering().options}
                    value={ordering().value} onChange={ordering().onChange} aria-label="Ordering" />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={ordering().direction === "ascending" ? "Ascending" : "Descending"}
                    onClick={() => ordering().onDirectionChange(ordering().direction === "ascending" ? "descending" : "ascending")}
                  >
                    {ordering().direction === "ascending" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                  </Button>
                </span>
              </div>
            )}
          </Show>
          <Show when={props.properties}>
            {(properties) => (
              <div class="pw-display-options__properties">
                <span class="pw-display-options__label">Display properties</span>
                <div class="pw-display-options__chips">
                  <For each={properties().options}>
                    {(option) => (
                      <FilterChip
                        selected={properties().visible.includes(option.value)}
                        aria-pressed={properties().visible.includes(option.value)}
                        onClick={() => toggleProperty(option.value)}
                      >
                        {option.label}
                      </FilterChip>
                    )}
                  </For>
                </div>
              </div>
            )}
          </Show>
        </div>
      </Popover>
    </>
  );
}
