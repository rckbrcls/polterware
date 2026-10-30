import { createMemo, createSignal, createUniqueId, For, Show, type JSX } from "solid-js";
import { PlusIcon } from "./hugeicons";
import { OptionTile } from "./option-tile";
import { RadioMark } from "./radio-group";
import { Popover, type PopoverProps } from "./popover";
import "./property-picker.css";

/**
 * One value a property can take. `group` puts it under a heading (groups keep the order they first
 * appear in), `hint` is a muted second line that search also matches, and `bareIcon` shows the icon
 * as it is (an avatar) instead of in an option tile.
 */
export type PropertyOption = { value: string; label: string; icon?: JSX.Element; group?: string; hint?: string; bareIcon?: boolean };

export type PropertyPickerProps = {
  /** The property, such as "Stage"; it names the search box ("Set stage…"). */
  label: string;
  options: readonly PropertyOption[];
  value?: string;
  onChange: (value: string) => void;
  /** Creates an option from the typed text and resolves its value; adds a "Create" row. */
  onCreate?: (text: string) => Promise<string | undefined> | string | undefined;
  open: boolean;
  onClose: () => void;
  anchorRef: () => HTMLElement | undefined;
  placement?: PopoverProps["placement"];
  /** Popover width; defaults to 240. */
  width?: number;
};

type Row = { key: string; label: string; icon?: JSX.Element; group?: string; hint?: string; bareIcon?: boolean; create?: boolean };

/**
 * Sets one property from a short list: type to filter, ↑/↓ and Enter, or a digit
 * (1–9, while the filter is empty) for the nth option. With `onCreate`, text that
 * matches no option can become a new one.
 */
export function PropertyPicker(props: PropertyPickerProps) {
  const listId = `property-options-${createUniqueId()}`;
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(0);
  const needle = () => query().trim().toLowerCase();
  const rows = createMemo<Row[]>(() => {
    const found = props.options.filter((option) =>
      [option.label, option.hint ?? "", option.group ?? ""].some((text) => text.toLowerCase().includes(needle())));
    // Rows of one group stay together, in the order the groups first appear.
    const order = [...new Set(found.map((option) => option.group ?? ""))];
    const matches = order.flatMap((group) => found.filter((option) => (option.group ?? "") === group))
      .map((option) => ({ key: option.value, label: option.label, icon: option.icon, group: option.group, hint: option.hint, bareIcon: option.bareIcon }));
    const exact = props.options.some((option) => option.label.toLowerCase() === needle());
    return props.onCreate && needle() !== "" && !exact
      ? [...matches, { key: "__create", label: `Create “${query().trim()}”`, create: true }]
      : matches;
  });
  const close = () => {
    setQuery("");
    setActive(0);
    props.onClose();
  };
  async function choose(index: number) {
    const row = rows()[index];
    if (!row) return;
    if (!row.create) {
      props.onChange(row.key);
      close();
      return;
    }
    const created = await props.onCreate?.(query().trim());
    if (created) props.onChange(created);
    close();
  }
  return (
    <Popover open={props.open} onClose={close} anchorRef={props.anchorRef} width={props.width ?? 240} placement={props.placement ?? "bottom-start"}>
      <div class="pw-property-picker">
        <input
          class="pw-property-picker__input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-label={`Set ${props.label.toLowerCase()}`}
          placeholder={`Set ${props.label.toLowerCase()}…`}
          value={query()}
          ref={(element) => queueMicrotask(() => element.focus())}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            const count = rows().length;
            if (event.key === "Enter") {
              event.preventDefault();
              void choose(active());
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (count) setActive((value) => (value + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
            } else if (query() === "" && /^[1-9]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
              event.preventDefault();
              void choose(Number(event.key) - 1);
            }
          }}
        />
        <div id={listId} role="listbox" aria-label={props.label} class="pw-property-picker__options">
          <For each={rows()}>
            {(row, index) => (
              <>
              <Show when={row.group && row.group !== rows()[index() - 1]?.group}>
                <span class="pw-property-picker__group" role="presentation">{row.group}</span>
              </Show>
              <button
                type="button"
                role="option"
                class="pw-property-picker__option"
                data-active={active() === index() ? "true" : "false"}
                aria-selected={row.key === props.value}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index())}
                onClick={() => void choose(index())}
              >
                <Show when={!row.create} fallback={<span class="pw-property-picker__mark" aria-hidden="true" />}>
                  <RadioMark class="pw-property-picker__mark" checked={row.key === props.value} />
                </Show>
                {row.create
                  ? <span class="pw-property-picker__icon"><PlusIcon size={12} /></span>
                  : row.bareIcon ? <span class="pw-property-picker__avatar" aria-hidden="true">{row.icon}</span> : <OptionTile label={row.label} seed={row.key}>{row.icon}</OptionTile>}
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate">{row.label}</span>
                  <Show when={row.hint}><span class="pw-property-picker__hint">{row.hint}</span></Show>
                </span>
                <Show when={!row.create && query() === "" && index() < 9}>
                  <kbd class="pw-property-picker__digit">{index() + 1}</kbd>
                </Show>
              </button>
              </>
            )}
          </For>
          <Show when={rows().length === 0}>
            <span class="pw-property-picker__empty">No match.</span>
          </Show>
        </div>
      </div>
    </Popover>
  );
}
