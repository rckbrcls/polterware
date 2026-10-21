import type { JSX } from "solid-js";
import { For, Show, splitProps } from "solid-js";
import { FloatingCountBadge, hasFloatingCount } from "./floating-count-badge";
import "./filter-chip.css";

export type FilterChipItem = {
  id: string;
  label: string;
  count?: number;
  countAriaLabel?: string;
};

/**
 * Quiet filter chip — fill + type only. Never texture Button material.
 * Use for secondary filters under PageToolbar (status, scope, category).
 */
export function FilterChip(
  props: {
    selected?: boolean;
    count?: number;
    countAriaLabel?: string;
    children: JSX.Element;
  } & JSX.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  const [local, rest] = splitProps(props, [
    "selected",
    "count",
    "countAriaLabel",
    "children",
    "class",
    "type",
  ]);
  return (
    <button
      type={local.type ?? "button"}
      class={`pw-filter-chip ${local.selected ? "pw-filter-chip--selected" : ""} ${hasFloatingCount(local.count) ? "pw-floating-count-host" : ""} ${local.class ?? ""}`}
      aria-pressed={local.selected}
      {...rest}
    >
      {local.children}
      <Show when={hasFloatingCount(local.count)}>
        <FloatingCountBadge
          count={local.count!}
          ariaLabel={local.countAriaLabel}
        />
      </Show>
    </button>
  );
}

/** Recessed track of filter chips: exclusive `items`, or any `children` chips you manage yourself. */
export function FilterChipGroup(props: {
  items?: FilterChipItem[];
  value?: string;
  onChange?: (id: string) => void;
  children?: JSX.Element;
  class?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      class={`pw-filter-chip-group ${props.class ?? ""}`}
      role="group"
      aria-label={props["aria-label"] ?? "Filters"}
    >
      <For each={props.items ?? []}>
        {(item) => (
          <FilterChip
            selected={props.value === item.id}
            count={item.count}
            countAriaLabel={item.countAriaLabel}
            onClick={() => props.onChange?.(item.id)}
          >
            {item.label}
          </FilterChip>
        )}
      </For>
      {props.children}
    </div>
  );
}
