import { Bookmark, ChevronRight, ListFilter, X } from "./hugeicons";
import type { JSX } from "solid-js";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { matchesShortcut } from "@polterware/frontend-state";
import { Button } from "./button";
import {
  addClause,
  sameClauses,
  setClauseValues,
  toggleClauseValue,
  type FilterClause,
  type FilterField,
  type FilterFieldOption,
  type SavedFilter,
  type SavedFiltersController,
} from "./filter-model";
import { FilterOptionsPanel } from "./filter-options-panel";
import { MenuItem, MenuList } from "./menu";
import { SelectionCheck } from "./menu-highlight";
import { Popover } from "./popover";
import "./filter-popover.css";

export type FilterPopoverProps = {
  fields: readonly FilterField[];
  clauses: readonly FilterClause[];
  onClausesChange: (clauses: FilterClause[]) => void;
  /** Saved filters, listed at the end of the menu. */
  saved?: SavedFiltersController;
  ariaLabel?: string;
  title?: string;
  triggerLabel?: string;
  triggerIcon?: JSX.Element;
  /** `texture` for the toolbar (lit while filters apply); `ghost` for the `+` in the filter bar. */
  variant?: "texture" | "ghost";
  /** Open with the add-filter shortcut (F). Give it to one filter control per page. */
  shortcut?: boolean;
  class?: string;
};

type RootRow =
  | { kind: "field"; field: FilterField }
  | { kind: "value"; field: FilterField; option: FilterFieldOption }
  | { kind: "saved"; filter: SavedFilter };

function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]"));
}

/** Fields grouped by `section`, in first-appearance order. */
function fieldSections(fields: readonly FilterField[]): FilterField[][] {
  const order: string[] = [];
  const bySection = new Map<string, FilterField[]>();
  for (const field of fields) {
    const key = field.section ?? "";
    if (!bySection.has(key)) {
      bySection.set(key, []);
      order.push(key);
    }
    bySection.get(key)!.push(field);
  }
  return order.map((key) => bySection.get(key)!);
}

/** Root menu label: a boolean field shows its single option. */
function rootLabel(field: FilterField) {
  return field.kind === "boolean" ? (field.menuLabel ?? field.options[0]?.label ?? field.label) : field.label;
}

/**
 * Linear-style "add filter" menu. The root lists the fields (and saved filters at the end);
 * hovering a field opens its values beside it. Every pick adds a clause, so the root does
 * not reflect the current filter: clicking a value's label adds just that value and closes,
 * while its checkbox keeps the menu open and edits the clause the first check created.
 * Typing in the root search lists matching fields and `Field › Value` shortcuts.
 * Ark Popover owns positioning, presence, Escape, and outside dismiss.
 */
export function FilterPopover(props: FilterPopoverProps) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [activeFieldId, setActiveFieldId] = createSignal<string | null>(null);
  const [focusSubmenu, setFocusSubmenu] = createSignal(false);
  /** Clause created or edited by the open submenu, so further checks edit the same pill. */
  const [sessionClauseId, setSessionClauseId] = createSignal<string | null>(null);
  let triggerRef: HTMLButtonElement | undefined;
  let rootListRef: HTMLDivElement | undefined;
  let submenuContentRef: HTMLElement | null = null;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const fieldRefs = new Map<string, HTMLButtonElement>();
  const label = () => props.ariaLabel ?? "Filters";
  const variant = () => props.variant ?? "texture";

  const activeField = createMemo(() =>
    props.fields.find((field) => field.id === activeFieldId() && field.kind !== "boolean"),
  );
  const currentSaved = createMemo(() =>
    props.saved?.items.find((filter) => props.clauses.length > 0 && sameClauses(filter.clauses, props.clauses)),
  );

  const results = createMemo((): RootRow[] => {
    const needle = query().trim().toLowerCase();
    if (!needle) return [];
    const rows: RootRow[] = [];
    for (const field of props.fields) {
      if (rootLabel(field).toLowerCase().includes(needle) || field.label.toLowerCase().includes(needle)) {
        rows.push({ kind: "field", field });
      }
    }
    for (const field of props.fields) {
      if (field.kind === "boolean") continue;
      for (const option of field.options) {
        if (!option.disabled && option.label.toLowerCase().includes(needle)) rows.push({ kind: "value", field, option });
      }
    }
    for (const filter of props.saved?.items ?? []) {
      if (filter.name.toLowerCase().includes(needle)) rows.push({ kind: "saved", filter });
    }
    return rows;
  });

  const clearTimers = () => {
    if (openTimer) clearTimeout(openTimer);
    if (closeTimer) clearTimeout(closeTimer);
    openTimer = undefined;
    closeTimer = undefined;
  };

  const openField = (fieldId: string, focus = false) => {
    clearTimers();
    if (activeFieldId() !== fieldId) setSessionClauseId(null);
    setFocusSubmenu(focus);
    setActiveFieldId(fieldId);
    if (focus) {
      queueMicrotask(() => submenuContentRef?.querySelector<HTMLElement>("input")?.focus());
    }
  };

  const scheduleOpen = (fieldId: string) => {
    clearTimers();
    openTimer = setTimeout(() => openField(fieldId), 120);
  };

  const scheduleClose = () => {
    clearTimers();
    closeTimer = setTimeout(() => setActiveFieldId(null), 180);
  };

  const closeRoot = () => {
    clearTimers();
    setActiveFieldId(null);
    setSessionClauseId(null);
    setQuery("");
    setOpen(false);
  };

  onCleanup(clearTimers);

  onMount(() => {
    if (!props.shortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      if (!matchesShortcut("shell.open_filter", event)) return;
      if (!triggerRef?.isConnected || triggerRef.getClientRects().length === 0) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });

  const session = () => props.clauses.find((clause) => clause.id === sessionClauseId());

  /** The clause the submenu edits: its own session clause, or the field's only pill when the field does not repeat. */
  const editedClause = (field: FilterField) =>
    session() ?? (field.repeatable === false ? props.clauses.find((clause) => clause.field === field.id) : undefined);

  const addValue = (field: FilterField, optionId: string) => {
    const existing = field.repeatable === false ? props.clauses.find((clause) => clause.field === field.id) : undefined;
    if (existing) props.onClausesChange(setClauseValues(props.clauses, existing.id, [optionId]));
    else props.onClausesChange(addClause(props.clauses, field, [optionId]).clauses);
    closeRoot();
  };

  const selectInSubmenu = (field: FilterField, optionId: string) => {
    const clause = editedClause(field);
    if (clause) props.onClausesChange(setClauseValues(props.clauses, clause.id, [optionId]));
    else props.onClausesChange(addClause(props.clauses, field, [optionId]).clauses);
    closeRoot();
  };

  const toggleInSubmenu = (field: FilterField, optionId: string, checked: boolean) => {
    const clause = editedClause(field);
    if (clause) {
      setSessionClauseId(clause.id);
      props.onClausesChange(toggleClauseValue(props.clauses, clause.id, field, optionId, checked));
      return;
    }
    if (!checked) return;
    const added = addClause(props.clauses, field, [optionId]);
    setSessionClauseId(added.id);
    props.onClausesChange(added.clauses);
  };

  const applySaved = (filter: SavedFilter) => {
    props.saved?.onApply(filter);
    closeRoot();
  };

  const activateRow = (row: RootRow) => {
    if (row.kind === "saved") applySaved(row.filter);
    else if (row.kind === "value") addValue(row.field, row.option.id);
    else if (row.field.kind === "boolean") addValue(row.field, row.field.options[0]?.id ?? "");
    else openField(row.field.id, true);
  };

  const focusFirstRow = () => rootListRef?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();

  const FieldRow = (rowProps: { field: FilterField }) => {
    const field = rowProps.field;
    if (field.kind === "boolean") {
      return (
        <MenuItem onClick={() => addValue(field, field.options[0]?.id ?? "")}>
          <Show when={field.options[0]?.icon ?? field.icon}>
            {(icon) => <span class="inline-flex shrink-0 text-[var(--color-text-muted)] [&_svg]:size-3.5">{icon()()}</span>}
          </Show>
          <span class="min-w-0 flex-1 truncate">{rootLabel(field)}</span>
        </MenuItem>
      );
    }
    return (
      <MenuItem
        ref={(element) => fieldRefs.set(field.id, element)}
        selected={activeFieldId() === field.id}
        aria-haspopup="dialog"
        aria-expanded={activeFieldId() === field.id}
        onMouseEnter={() => scheduleOpen(field.id)}
        onMouseLeave={scheduleClose}
        onClick={() => openField(field.id, true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openField(field.id, true);
          }
        }}
      >
        <Show when={field.icon}>
          {(icon) => <span class="inline-flex shrink-0 text-[var(--color-text-muted)] [&_svg]:size-3.5">{icon()()}</span>}
        </Show>
        <span class="min-w-0 flex-1 truncate">{field.label}</span>
        <ChevronRight size={14} class="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
      </MenuItem>
    );
  };

  const SavedRow = (rowProps: { filter: SavedFilter }) => (
    <div class="pw-saved-filter-row relative">
      <MenuItem onClick={() => applySaved(rowProps.filter)} class="pr-8">
        <span class="inline-flex shrink-0 text-[var(--color-text-muted)]"><Bookmark size={14} aria-hidden /></span>
        <span class="min-w-0 flex-1 truncate">{rowProps.filter.name}</span>
        <SelectionCheck checked={currentSaved()?.id === rowProps.filter.id} size={12} />
      </MenuItem>
      <Show when={props.saved?.onDelete}>
        <button
          type="button"
          class="pw-saved-filter-row__delete"
          aria-label={`Delete saved filter ${rowProps.filter.name}`}
          onClick={(event) => {
            event.stopPropagation();
            props.saved?.onDelete?.(rowProps.filter);
          }}
        >
          <X size={12} aria-hidden />
        </button>
      </Show>
    </div>
  );

  const searchHeader = () => (
    <div class="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-3 py-2.5">
      <span class="sr-only">{props.title ?? label()}</span>
      <input
        class="pw-filter-popover-search min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-disabled)]"
        type="text"
        role="searchbox"
        placeholder="Add filter…"
        value={query()}
        onInput={(event) => {
          setActiveFieldId(null);
          setQuery(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            focusFirstRow();
          } else if (event.key === "Enter") {
            const row = results()[0];
            if (row) {
              event.preventDefault();
              activateRow(row);
            }
          }
        }}
        autofocus
        autocomplete="off"
        spellcheck={false}
        aria-label={`Search ${label().toLowerCase()}`}
      />
      <Show when={props.shortcut}>
        <kbd class="pw-filter-popover-kbd">F</kbd>
      </Show>
    </div>
  );

  return (
    <>
      <Button
        ref={(element) => {
          triggerRef = element;
        }}
        variant={variant()}
        size={props.triggerLabel ? "sm" : "icon"}
        selected={variant() === "texture" && props.clauses.length > 0}
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
        <Show when={props.triggerLabel}>{(triggerLabel) => <span>{triggerLabel()}</span>}</Show>
      </Button>

      <Popover
        open={open()}
        onClose={closeRoot}
        anchorRef={() => triggerRef}
        persistentElements={[() => submenuContentRef]}
        placement={variant() === "ghost" ? "bottom-start" : "bottom-end"}
        width={260}
        title={label()}
        class="max-h-[calc(100vh-64px)]"
      >
        <div class="flex min-h-0 flex-col">
          {searchHeader()}
          <div ref={rootListRef} class="min-h-0 overflow-y-auto">
            <Show
              when={query().trim()}
              fallback={
                <Show
                  when={props.fields.length > 0 || (props.saved?.items.length ?? 0) > 0}
                  fallback={<p class="m-0 px-2 py-3 text-center text-[12px] text-[var(--color-text-muted)]">No filters available.</p>}
                >
                  <For each={fieldSections(props.fields)}>
                    {(section, index) => (
                      <>
                        <Show when={index() > 0}>
                          <div class="border-t border-[var(--color-border-subtle)]" aria-hidden />
                        </Show>
                        <MenuList class="p-1.5">
                          <For each={section}>{(field) => <FieldRow field={field} />}</For>
                        </MenuList>
                      </>
                    )}
                  </For>
                  <Show when={(props.saved?.items.length ?? 0) > 0}>
                    <div class="border-t border-[var(--color-border-subtle)]" aria-hidden />
                    <p class="m-0 px-3.5 pb-0.5 pt-2.5 text-[11px] font-medium text-[var(--color-text-muted)]">Saved filters</p>
                    <MenuList class="p-1.5">
                      <For each={props.saved?.items ?? []}>{(filter) => <SavedRow filter={filter} />}</For>
                    </MenuList>
                  </Show>
                </Show>
              }
            >
              <Show
                when={results().length > 0}
                fallback={<p class="m-0 px-2 py-3 text-center text-[12px] text-[var(--color-text-muted)]">No filters found.</p>}
              >
                <MenuList class="p-1.5">
                  <For each={results()}>
                    {(row, index) => {
                      if (row.kind === "field") return <FieldRow field={row.field} />;
                      if (row.kind === "saved") return <SavedRow filter={row.filter} />;
                      return (
                        <MenuItem selected={index() === 0} onClick={() => addValue(row.field, row.option.id)}>
                          <Show when={row.option.icon ?? row.field.icon}>
                            {(icon) => <span class="inline-flex shrink-0 text-[var(--color-text-muted)] [&_svg]:size-3.5">{icon()()}</span>}
                          </Show>
                          <span class="min-w-0 flex-1 truncate">
                            <span class="pw-filter-path">{row.field.label} › </span>
                            {row.option.label}
                          </span>
                        </MenuItem>
                      );
                    }}
                  </For>
                </MenuList>
              </Show>
            </Show>
          </div>
        </div>
      </Popover>

      <Popover
        open={Boolean(open() && activeField())}
        onClose={() => {
          submenuContentRef = null;
          setActiveFieldId(null);
        }}
        onEscapeKeyDown={closeRoot}
        anchorRef={() => {
          const field = activeField();
          return field ? fieldRefs.get(field.id) : undefined;
        }}
        placement="right-start"
        width={240}
        gutter={4}
        title={activeField()?.label}
        autoFocus={focusSubmenu()}
        contentRef={(element) => {
          submenuContentRef = element;
        }}
        persistentElements={[() => triggerRef ?? null]}
        class="max-h-[calc(100vh-64px)]"
      >
        {/* Keyed by id: pages may rebuild field objects, which must not remount the open list. */}
        <Show when={activeField()?.id} keyed>
          {(fieldId) => {
            const field = () => props.fields.find((item) => item.id === fieldId)!;
            return (
            <FilterOptionsPanel
              field={field()}
              values={editedClause(field())?.values ?? []}
              autofocus={focusSubmenu()}
              onToggle={(optionId, checked) => toggleInSubmenu(field(), optionId, checked)}
              onSelect={(optionId) => selectInSubmenu(field(), optionId)}
              onMouseEnter={clearTimers}
              onMouseLeave={scheduleClose}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" && !(event.target instanceof HTMLInputElement)) {
                  event.preventDefault();
                  setActiveFieldId(null);
                  fieldRefs.get(fieldId)?.focus();
                }
              }}
            />
            );
          }}
        </Show>
      </Popover>
    </>
  );
}
