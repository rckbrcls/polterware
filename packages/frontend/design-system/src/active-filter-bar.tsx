import type { JSX } from "solid-js";
import { For, Show, createMemo, createSignal } from "solid-js";
import { DetailPanelCollectionHeader } from "./detail-panel";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import {
  clauseOptions,
  filterOperators,
  operatorLabel,
  sameClauses,
  setClauseOperator,
  setClauseValues,
  toggleClauseValue,
  removeClause,
  valueSummary,
  type FilterClause,
  type FilterField,
  type SavedFiltersController,
} from "./filter-model";
import { FilterOptionsPanel } from "./filter-options-panel";
import { FilterPopover } from "./filter-popover";
import { Plus, X } from "./hugeicons";
import { Input } from "./input";
import { Popover } from "./popover";
import "./button.css";
import "./active-filter-bar.css";

/** A removable pill for page state that is not a filter clause (for example a custom date range). */
export type ActiveFilterPill = {
  id: string;
  label: string;
  onRemove: () => void;
};

export type ActiveFilterBarProps = {
  fields: readonly FilterField[];
  clauses: readonly FilterClause[];
  onClausesChange: (clauses: FilterClause[]) => void;
  saved?: SavedFiltersController;
  items?: readonly ActiveFilterPill[];
  /** Replaces the default Clear (all clauses and every extra pill). */
  onClear?: () => void;
  class?: string;
  "aria-label"?: string;
};

function FilterPill(props: {
  field: FilterField;
  clause: FilterClause;
  clauses: readonly FilterClause[];
  onClausesChange: (clauses: FilterClause[]) => void;
}) {
  const [valuesOpen, setValuesOpen] = createSignal(false);
  let pill: HTMLSpanElement | undefined;
  const operators = () => filterOperators(props.field, props.clause.values.length);
  const options = () => clauseOptions(props.field, props.clause);
  const icons = () => options().flatMap((option) => (option.icon ? [option.icon] : [])).slice(0, 3);
  const summary = () => valueSummary(props.field, props.clause);

  return (
    <span ref={pill} class="pw-filter-pill pw-texture-button" role="group" aria-label={`${props.field.label} ${operatorLabel(props.field, props.clause)} ${summary()}`}>
      <span class="pw-filter-pill__seg pw-filter-pill__field">
        <Show when={props.field.icon}>
          {(icon) => <span class="pw-filter-pill__icon">{icon()()}</span>}
        </Show>
        <span class="pw-filter-pill__text">{props.field.label}</span>
      </span>
      <Show
        when={operators().length > 1}
        fallback={<span class="pw-filter-pill__seg pw-filter-pill__operator">{operatorLabel(props.field, props.clause)}</span>}
      >
        <DropdownMenu positioning={{ placement: "bottom-start" }}>
          <DropdownMenuTrigger
            class="pw-filter-pill__seg pw-filter-pill__operator pw-filter-pill__button"
            aria-label={`Change ${props.field.label} operator`}
          >
            {operatorLabel(props.field, props.clause)}
          </DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-32">
            <For each={operators()}>
              {(operator) => (
                <DropdownMenuItem
                  value={operator.id}
                  selected={operator.id === props.clause.operator}
                  onSelect={() => props.onClausesChange(setClauseOperator(props.clauses, props.clause.id, operator.id))}
                >
                  {operator.label}
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>
      <Show
        when={props.field.kind !== "boolean"}
        fallback={<span class="pw-filter-pill__seg pw-filter-pill__value">{summary()}</span>}
      >
        <button
          type="button"
          class="pw-filter-pill__seg pw-filter-pill__value pw-filter-pill__button"
          aria-label={`Edit ${props.field.label} values`}
          aria-expanded={valuesOpen()}
          onClick={() => setValuesOpen((open) => !open)}
        >
          <Show when={icons().length > 0}>
            <span class="pw-filter-pill__stack">
              <For each={icons()}>{(icon) => <span class="pw-filter-pill__icon">{icon()}</span>}</For>
            </span>
          </Show>
          <span class="pw-filter-pill__text">{summary()}</span>
        </button>
      </Show>
      <button
        type="button"
        class="pw-filter-pill__remove"
        aria-label={`Remove ${props.field.label} filter`}
        onClick={() => props.onClausesChange(removeClause(props.clauses, props.clause.id))}
      >
        <X size={12} aria-hidden />
      </button>
      <Popover
        open={valuesOpen()}
        onClose={() => setValuesOpen(false)}
        anchorRef={() => pill}
        placement="bottom-start"
        width={240}
        title={`${props.field.label} values`}
      >
        <FilterOptionsPanel
          field={props.field}
          values={props.clause.values}
          placeholder={props.field.label}
          checkedFirst
          onToggle={(optionId, checked) =>
            props.onClausesChange(toggleClauseValue(props.clauses, props.clause.id, props.field, optionId, checked))}
          onSelect={(optionId) => {
            setValuesOpen(false);
            props.onClausesChange(setClauseValues(props.clauses, props.clause.id, [optionId]));
          }}
        />
      </Popover>
    </span>
  );
}

function SaveFilterButton(props: { saved: SavedFiltersController; clauses: readonly FilterClause[] }) {
  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  let trigger: HTMLButtonElement | undefined;
  const current = () => props.saved.items.find((filter) => sameClauses(filter.clauses, props.clauses));
  const submit = async () => {
    const value = name().trim();
    if (!value || saving()) return;
    setSaving(true);
    try {
      await props.saved.onSave?.(value);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Button
        ref={(element) => {
          trigger = element;
        }}
        size="sm"
        variant="texture"
        class="!h-auto shrink-0 !px-2.5 !py-1 text-[11px] rounded-full"
        aria-expanded={open()}
        onClick={() => {
          setName(current()?.name ?? "");
          setOpen((value) => !value);
        }}
      >
        Save
      </Button>
      <Popover open={open()} onClose={() => setOpen(false)} anchorRef={() => trigger} placement="bottom-end" width={260} title="Save filter">
        <form
          class="flex flex-col gap-2 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            size="sm"
            placeholder="Filter name"
            aria-label="Filter name"
            value={name()}
            autofocus
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <p class="m-0 text-[11px] text-[var(--color-text-muted)]">Saving with an existing name replaces that filter.</p>
          <div class="flex justify-end">
            <Button type="submit" size="sm" variant="texture" disabled={!name().trim() || saving()}>
              Save filter
            </Button>
          </div>
        </form>
      </Popover>
    </>
  );
}

/**
 * Linear-style filter bar under PageToolbar: one segmented pill per clause
 * (`[icon Field] [operator] [value] [×]`), a `+` that opens the add-filter menu, and
 * Clear / Save on the right. Hidden while nothing filters the page.
 */
export function ActiveFilterBar(props: ActiveFilterBarProps): JSX.Element {
  const fieldsById = createMemo(() => new Map(props.fields.map((field) => [field.id, field])));
  /** Ids, not clause objects: a clause is replaced on every change and must not remount its pill. */
  const clauseIds = createMemo(() =>
    props.clauses.filter((clause) => fieldsById().has(clause.field)).map((clause) => clause.id),
  );
  const items = () => props.items ?? [];
  const clear = () => {
    if (props.onClear) {
      props.onClear();
      return;
    }
    props.onClausesChange([]);
    for (const item of items()) item.onRemove();
  };

  return (
    <DetailPanelCollectionHeader>
      <Show when={clauseIds().length > 0 || items().length > 0}>
        <div
          class={`pw-active-filter-bar ${props.class ?? ""}`}
          role="group"
          aria-label={props["aria-label"] ?? "Active filters"}
        >
          <div class="pw-active-filter-bar__pills">
            <For each={clauseIds()}>
              {(id) => {
                const clause = () => props.clauses.find((item) => item.id === id);
                return (
                  <Show when={clause()}>
                    {(current) => (
                      <FilterPill
                        field={fieldsById().get(current().field)!}
                        clause={current()}
                        clauses={props.clauses}
                        onClausesChange={props.onClausesChange}
                      />
                    )}
                  </Show>
                );
              }}
            </For>
            <For each={items()}>
              {(item) => (
                <span class="pw-filter-pill pw-texture-button">
                  <span class="pw-filter-pill__seg pw-filter-pill__value">{item.label}</span>
                  <button
                    type="button"
                    class="pw-filter-pill__remove"
                    aria-label={`Remove ${item.label}`}
                    onClick={() => item.onRemove()}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </span>
              )}
            </For>
            <FilterPopover
              ariaLabel="Add filter"
              variant="ghost"
              triggerIcon={<Plus size={14} aria-hidden />}
              class="pw-active-filter-bar__add"
              fields={props.fields}
              clauses={props.clauses}
              onClausesChange={props.onClausesChange}
              saved={props.saved}
            />
          </div>
          <div class="pw-active-filter-bar__actions">
            <Button
              size="sm"
              variant="ghost"
              class="!h-auto shrink-0 !px-2.5 !py-1 text-[11px] rounded-full"
              onClick={clear}
            >
              Clear
            </Button>
            <Show when={props.saved?.onSave && props.clauses.length > 0}>
              <SaveFilterButton saved={props.saved!} clauses={props.clauses} />
            </Show>
          </div>
        </div>
      </Show>
    </DetailPanelCollectionHeader>
  );
}
