import { ChevronRight, ListFilter } from "./hugeicons";
import type { JSX } from "solid-js";
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { Button } from "./button";
import { FilterChip } from "./filter-chip";
import {
  FilterOptionsHeader,
  FilterOptionsPanel,
} from "./filter-options-panel";
import type {
  FilterOptionsPanelAction,
  FilterOptionsPanelGroup,
  FilterOptionsPanelOption,
} from "./filter-options-panel";
import { MenuItem, MenuList } from "./menu";
import { Popover } from "./popover";
import { SwitchRow } from "./switch";
import "./filter-popover.css";

export type FilterPopoverOption = FilterOptionsPanelOption;
export type FilterPopoverAction = FilterOptionsPanelAction;
export type FilterPopoverGroup = FilterOptionsPanelGroup;

export type FilterPopoverSearch = {
  placeholder: string;
  value: string;
  onInput: (value: string) => void;
  ariaLabel?: string;
  autofocus?: boolean;
};

export type FilterPopoverProps = {
  groups: readonly FilterPopoverGroup[];
  search?: FilterPopoverSearch;
  active?: boolean;
  ariaLabel?: string;
  title?: string;
  triggerLabel?: string;
  triggerIcon?: JSX.Element;
  onClear?: () => void;
  class?: string;
};

export type FilterPopoverMode = "empty" | "direct" | "grouped";

/** Internal branch contract kept pure so zero/one/many group behavior stays explicit. */
export function getFilterPopoverMode(groupCount: number): FilterPopoverMode {
  if (groupCount === 0) return "empty";
  if (groupCount === 1) return "direct";
  return "grouped";
}

export function getFilterCategoryTriggerAriaLabel(
  label: string,
  count: number,
  ariaLabel?: string,
): string {
  if (count > 0) return `${ariaLabel ?? label}, ${count} selected`;
  return ariaLabel ?? `${label} filter`;
}

/**
 * Compact filter control for PageToolbar actions.
 * Ark Popover owns positioning, presence, Escape, and outside dismiss.
 */
export function FilterPopover(props: FilterPopoverProps) {
  const [open, setOpen] = createSignal(false);
  const [optionQuery, setOptionQuery] = createSignal("");
  const [activeGroupId, setActiveGroupId] = createSignal<string | null>(null);
  let triggerRef: HTMLButtonElement | undefined;
  let submenuContentRef: HTMLElement | null = null;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const groupRefs = new Map<string, HTMLButtonElement>();
  const label = () => props.ariaLabel ?? "Filters";
  const directGroup = createMemo(() =>
    getFilterPopoverMode(props.groups.length) === "direct"
      ? props.groups[0]
      : undefined,
  );
  /** Dimension search: controlled `search` or internal query. Always filters groups in cascaded mode. */
  const dimensionQuery = () =>
    (props.search?.value ?? optionQuery()).trim().toLowerCase();

  const visibleGroups = createMemo(() => {
    const query = dimensionQuery();
    if (!query) return props.groups;
    return props.groups
      .map((group) =>
        group.label.toLowerCase().includes(query)
          ? group
          : {
              ...group,
              options: group.options.filter((option) =>
                option.label.toLowerCase().includes(query),
              ),
            },
      )
      .filter((group) => group.options.length > 0);
  });
  const activeGroup = createMemo(() =>
    visibleGroups().find((group) => group.id === activeGroupId() && !group.inline),
  );

  const clearTimers = () => {
    if (openTimer) clearTimeout(openTimer);
    if (closeTimer) clearTimeout(closeTimer);
    openTimer = undefined;
    closeTimer = undefined;
  };

  const openGroup = (groupId: string, focus = false) => {
    clearTimers();
    setActiveGroupId(groupId);
    if (focus) {
      queueMicrotask(() => {
        submenuContentRef
          ?.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled)")
          ?.focus();
      });
    }
  };

  const scheduleOpen = (groupId: string) => {
    clearTimers();
    openTimer = setTimeout(() => openGroup(groupId), 120);
  };

  const scheduleClose = () => {
    clearTimers();
    closeTimer = setTimeout(() => setActiveGroupId(null), 180);
  };

  const closeRoot = () => {
    clearTimers();
    setActiveGroupId(null);
    if (!props.search) setOptionQuery("");
    setOpen(false);
  };

  onCleanup(clearTimers);

  const searchHeader = () => (
    <div class="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-3 py-2.5">
      <span class="sr-only">{props.title ?? label()}</span>
      <input
        class="pw-filter-popover-search min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-disabled)]"
        type="text"
        role="searchbox"
        placeholder={props.search?.placeholder ?? "Add filter…"}
        value={props.search?.value ?? optionQuery()}
        onInput={(event) => {
          if (props.search) props.search.onInput(event.currentTarget.value);
          else setOptionQuery(event.currentTarget.value);
        }}
        autofocus={props.search?.autofocus ?? true}
        autocomplete="off"
        spellcheck={false}
        aria-label={
          props.search?.ariaLabel ??
          props.search?.placeholder ??
          `Search ${label().toLowerCase()}`
        }
      />
      <Show when={props.active && props.onClear}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => props.onClear?.()}
        >
          Clear filters
        </Button>
      </Show>
    </div>
  );

  return (
    <>
      <Button
        ref={(element) => {
          triggerRef = element;
        }}
        variant="texture"
        size={props.triggerLabel ? "sm" : "icon"}
        selected={props.active}
        class={props.class}
        aria-label={label()}
        aria-expanded={open()}
        title={props.title ?? label()}
        onClick={() => {
          if (open()) closeRoot();
          else setOpen(true);
        }}
      >
        {props.triggerIcon ?? <ListFilter size={14} aria-hidden />}
        <Show when={props.triggerLabel}>
          {(triggerLabel) => <span>{triggerLabel()}</span>}
        </Show>
      </Button>

      <Popover
        open={open()}
        onClose={closeRoot}
        anchorRef={() => triggerRef}
        persistentElements={[() => submenuContentRef]}
        placement="bottom-end"
        width={directGroup() ? 264 : 300}
        title={label()}
        class="max-h-[calc(100vh-64px)]"
      >
        <Show
          when={directGroup()}
          fallback={
            <div class="flex min-h-0 flex-col">
              {searchHeader()}
              <MenuList class="min-h-0 overflow-y-auto p-2">
                <Show
                  when={visibleGroups().length > 0}
                  fallback={
                    <p class="m-0 px-2 py-3 text-center text-[12px] text-[var(--color-text-muted)]">
                      No filters found.
                    </p>
                  }
                >
                  <For each={visibleGroups()}>
                    {(group) => {
                      const checkedCount = () =>
                        group.options.filter((option) => option.checked).length;
                      const inlineOption = group.inline ? group.options[0] : undefined;
                      if (inlineOption) {
                        return (
                          <SwitchRow
                            checked={Boolean(inlineOption.checked)}
                            disabled={inlineOption.disabled}
                            label={group.label}
                            leading={group.leading}
                            onCheckedChange={(checked) => inlineOption.onCheckedChange(checked)}
                          />
                        );
                      }
                      return (
                        <MenuItem
                          ref={(element) => groupRefs.set(group.id, element)}
                          selected={activeGroupId() === group.id}
                          aria-haspopup="dialog"
                          aria-expanded={activeGroupId() === group.id}
                          onMouseEnter={() => scheduleOpen(group.id)}
                          onMouseLeave={scheduleClose}
                          onClick={() => openGroup(group.id, true)}
                          onKeyDown={(event) => {
                            if (
                              event.key === "ArrowRight" ||
                              event.key === "Enter" ||
                              event.key === " "
                            ) {
                              event.preventDefault();
                              openGroup(group.id, true);
                            }
                          }}
                        >
                          <Show when={group.leading}>
                            <span class="inline-flex shrink-0 text-[var(--color-text-muted)] [&_svg]:size-3.5">
                              {group.leading}
                            </span>
                          </Show>
                          <span class="min-w-0 flex-1 truncate">{group.label}</span>
                          <Show when={checkedCount() > 0}>
                            <span class="pw-filter-popover-count" aria-label={`${checkedCount()} selected`}>
                              {checkedCount()}
                            </span>
                          </Show>
                          <ChevronRight size={14} class="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                        </MenuItem>
                      );
                    }}
                  </For>
                </Show>
              </MenuList>
            </div>
          }
        >
          {(group) => (
            <FilterOptionsPanel
              group={group()}
              header={
                props.search ? (
                  searchHeader()
                ) : (
                  <FilterOptionsHeader
                    title={group().label}
                    clearLabel="Clear filters"
                    onClear={props.active ? props.onClear : undefined}
                  />
                )
              }
            />
          )}
        </Show>
      </Popover>

      <Popover
        open={Boolean(open() && !directGroup() && activeGroup())}
        onClose={() => {
          submenuContentRef = null;
          setActiveGroupId(null);
        }}
        anchorRef={() => {
          const group = activeGroup();
          return group ? groupRefs.get(group.id) : undefined;
        }}
        placement="right-start"
        width={264}
        gutter={4}
        title={activeGroup()?.label}
        contentRef={(element) => {
          submenuContentRef = element;
        }}
        persistentElements={[() => triggerRef ?? null]}
        class="max-h-[calc(100vh-64px)]"
      >
        <Show when={activeGroup()}>
          {(group) => (
            <FilterOptionsPanel
              group={group()}
              header={<FilterOptionsHeader title={group().label} />}
              onMouseEnter={clearTimers}
              onMouseLeave={scheduleClose}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  const groupId = activeGroupId();
                  setActiveGroupId(null);
                  if (groupId) groupRefs.get(groupId)?.focus();
                }
              }}
            />
          )}
        </Show>
      </Popover>
    </>
  );
}
export type FilterCategoryOption = {
  id: string;
  label: string;
  disabled?: boolean;
  leading?: JSX.Element;
  trailing?: JSX.Element;
};

export type FilterCategoryPopoverProps = {
  label: string;
  options: readonly FilterCategoryOption[];
  selectedValues: readonly string[];
  onToggle: (id: string, checked: boolean) => void;
  onClear?: () => void;
  class?: string;
  ariaLabel?: string;
};

/**
 * Single-category filter chip trigger + Ark-backed Popover.
 * Opens an Ark-backed Popover directly showing only that category's checkbox options.
 */
export function FilterCategoryPopover(props: FilterCategoryPopoverProps) {
  const [open, setOpen] = createSignal(false);
  let triggerRef: HTMLButtonElement | undefined;

  const count = () => props.selectedValues.length;
  const isSelected = () => count() > 0;
  const ariaLabel = () =>
    getFilterCategoryTriggerAriaLabel(props.label, count(), props.ariaLabel);
  const group = createMemo<FilterOptionsPanelGroup>(() => ({
    id: props.label.toLowerCase().replace(/\s+/g, "-"),
    label: props.label,
    options: props.options.map((option) => ({
      ...option,
      checked: props.selectedValues.includes(option.id),
      onCheckedChange: (checked: boolean) => props.onToggle(option.id, checked),
    })),
  }));

  return (
    <>
      <span class="control-field control-field-sm inline-flex shrink-0 !rounded-full !p-0">
        <FilterChip
          ref={(element) => {
            triggerRef = element;
          }}
          selected={isSelected()}
          count={isSelected() ? count() : undefined}
          countAriaLabel={isSelected() ? `${count()} selected` : undefined}
          onClick={() => setOpen((prev) => !prev)}
          class={`h-full !rounded-full !px-3.5 ${props.class ?? ""}`}
          aria-expanded={open()}
          aria-haspopup="dialog"
          aria-label={ariaLabel()}
        >
          <span>{props.label}</span>
        </FilterChip>
      </span>

      <Popover
        open={open()}
        onClose={() => setOpen(false)}
        anchorRef={() => triggerRef}
        placement="bottom-start"
        width={220}
        title={`${props.label} filters`}
      >
        <FilterOptionsPanel
          group={group()}
          header={
            <FilterOptionsHeader
              title={props.label}
              onClear={isSelected() ? props.onClear : undefined}
            />
          }
        />
      </Popover>
    </>
  );
}
