import type { JSX } from "solid-js";
import { For, Show, createMemo, createSignal, onMount, untrack } from "solid-js";
import { Checkbox } from "./checkbox";
import type { FilterField, FilterFieldOption } from "./filter-model";
import { OptionTile } from "./option-tile";
import { RadioMark } from "./radio-group";

export type FilterOptionsPanelProps = {
  field: FilterField;
  /** Values currently checked. */
  values: readonly string[];
  /** Checkbox click or Space: toggle one value and keep the panel open. */
  onToggle: (optionId: string, checked: boolean) => void;
  /** Row click or Enter: pick only this value (the caller closes the panel). */
  onSelect: (optionId: string) => void;
  placeholder?: string;
  /** Checked rows first, in the order they had when the panel opened (Linear). */
  checkedFirst?: boolean;
  autofocus?: boolean;
  onMouseEnter?: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onMouseLeave?: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onKeyDown?: JSX.EventHandler<HTMLDivElement, KeyboardEvent>;
};

function focusRow(list: HTMLElement | undefined, from: Element | null, step: 1 | -1) {
  const rows = [...(list?.querySelectorAll<HTMLElement>(".pw-filter-option__body:not(:disabled)") ?? [])];
  if (rows.length === 0) return;
  const index = from ? rows.indexOf(from as HTMLElement) : -1;
  rows[index < 0 ? (step === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, index + step))]?.focus();
}

/**
 * Value list of one filter field, shared by the filter submenu and the value popover of an
 * active filter pill: a search field, then rows. Multi-select rows lead with a checkbox that
 * stays hidden until the row is hovered or focused, unless checked; single-select rows end
 * with a check mark.
 */
export function FilterOptionsPanel(props: FilterOptionsPanelProps) {
  const [query, setQuery] = createSignal("");
  let list: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  const initiallyChecked = untrack(() => new Set(props.values));
  const multi = () => props.field.kind === "multi";

  const visible = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return props.field.options.filter((option) => !needle || option.label.toLowerCase().includes(needle));
  });
  const sections = createMemo((): FilterFieldOption[][] => {
    if (!props.checkedFirst) return [visible()];
    const pinned = visible().filter((option) => initiallyChecked.has(option.id));
    const rest = visible().filter((option) => !initiallyChecked.has(option.id));
    return [pinned, rest].filter((section) => section.length > 0);
  });
  const first = () => sections()[0]?.[0];

  onMount(() => {
    if (props.autofocus !== false) queueMicrotask(() => input?.focus());
  });

  const checked = (option: FilterFieldOption) => props.values.includes(option.id);

  return (
    <div class="flex min-h-0 flex-col" onMouseEnter={props.onMouseEnter} onMouseLeave={props.onMouseLeave} onKeyDown={props.onKeyDown}>
      <div class="flex shrink-0 items-center border-b border-[var(--color-border-subtle)] px-3 py-2.5">
        <input
          ref={input}
          class="pw-filter-popover-search min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-disabled)]"
          type="text"
          role="searchbox"
          placeholder={props.placeholder ?? "Filter…"}
          aria-label={`Filter ${props.field.label.toLowerCase()} options`}
          value={query()}
          autocomplete="off"
          spellcheck={false}
          onInput={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusRow(list, null, 1);
            } else if (event.key === "Enter") {
              const option = first();
              if (option && !option.disabled) {
                event.preventDefault();
                props.onSelect(option.id);
              }
            }
          }}
        />
      </div>
      <div
        ref={list}
        class="min-h-0 overflow-y-auto p-1.5"
        role="group"
        aria-label={props.field.label}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            focusRow(list, document.activeElement, event.key === "ArrowDown" ? 1 : -1);
          }
        }}
      >
        <Show when={visible().length > 0} fallback={<p class="m-0 px-2 py-3 text-center text-[12px] text-[var(--color-text-muted)]">No matches.</p>}>
          <For each={sections()}>
            {(section, index) => (
              <>
                <Show when={index() > 0}>
                  <div class="my-1 border-t border-[var(--color-border-subtle)]" aria-hidden />
                </Show>
                <For each={section}>
                  {(option) => (
                    <div
                      class="pw-filter-option"
                      data-kind={multi() ? "multi" : "single"}
                      data-checked={checked(option) ? "" : undefined}
                      data-active={query().trim() && option === first() ? "" : undefined}
                    >
                      <Show when={multi()}>
                        <Checkbox
                          class="pw-filter-option__check"
                          aria-label={`Toggle ${option.label}`}
                          checked={checked(option)}
                          disabled={option.disabled}
                          onCheckedChange={(details) => props.onToggle(option.id, details.checked === true)}
                        />
                      </Show>
                      <button
                        type="button"
                        class="pw-filter-option__body"
                        disabled={option.disabled}
                        aria-pressed={checked(option)}
                        onClick={() => props.onSelect(option.id)}
                        onKeyDown={(event) => {
                          if (event.key === " " && multi()) {
                            event.preventDefault();
                            props.onToggle(option.id, !checked(option));
                          }
                        }}
                      >
                        <Show when={!multi()}>
                          <RadioMark class="pw-filter-option__radio" checked={checked(option)} />
                        </Show>
                        <OptionTile label={option.label} seed={option.id}>{option.icon?.()}</OptionTile>
                        <span class="pw-filter-option__label">{option.label}</span>
                        <Show when={option.trailing}>
                          <span class="pw-filter-option__trailing">{option.trailing}</span>
                        </Show>
                      </button>
                    </div>
                  )}
                </For>
              </>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
