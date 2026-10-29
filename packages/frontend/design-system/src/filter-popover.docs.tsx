import { createSignal } from "solid-js";
import { ActiveFilterBar } from "./active-filter-bar";
import { FilterPopover } from "./filter-popover";
import { FilterMark } from "./filter-mark";
import { matchClauses, parseFilterPayload, serializeFilterPayload, type FilterClause, type FilterField, type SavedFilter } from "./filter-model";
import { Layers } from "./hugeicons";
import type { DocEntry } from "./docs/types";

const FIELDS: FilterField[] = [
  {
    id: "status",
    label: "Status",
    pluralLabel: "statuses",
    kind: "multi",
    icon: () => <FilterMark tone="muted" />,
    options: [
      { id: "backlog", label: "Backlog", icon: () => <FilterMark tone="muted" />, trailing: "2 cards" },
      { id: "planned", label: "Planned", icon: () => <FilterMark tone="syncing" /> },
      { id: "started", label: "In Progress", icon: () => <FilterMark tone="warn" /> },
      { id: "done", label: "Done", icon: () => <FilterMark tone="ok" /> },
    ],
  },
  {
    id: "domain",
    label: "Domain",
    kind: "multi",
    icon: () => <Layers size={14} aria-hidden />,
    options: [
      { id: "platform", label: "Platform" },
      { id: "product", label: "Product" },
      { id: "data", label: "Data" },
    ],
  },
  {
    id: "pinned",
    label: "Card",
    kind: "boolean",
    section: "flags",
    options: [{ id: "pinned", label: "Pinned" }],
  },
];

const CARDS = [
  { id: "a", status: "planned", domain: "platform", pinned: true },
  { id: "b", status: "backlog", domain: "data", pinned: false },
  { id: "c", status: "started", domain: "product", pinned: true },
];

function Filtering() {
  const [clauses, setClauses] = createSignal<FilterClause[]>([]);
  const [saved, setSaved] = createSignal<SavedFilter[]>([]);
  const visible = () =>
    CARDS.filter((card) =>
      matchClauses(card, clauses(), {
        status: (item) => item.status,
        domain: (item) => item.domain,
        pinned: (item) => item.pinned,
      }),
    );
  const savedFilters = () => ({
    items: saved(),
    onApply: (filter: SavedFilter) => setClauses([...filter.clauses]),
    onSave: (name: string) => {
      const { clauses: stored } = parseFilterPayload(serializeFilterPayload(clauses()));
      setSaved((items) => [...items.filter((item) => item.name !== name), { id: name, name, clauses: stored }]);
    },
    onDelete: (filter: SavedFilter) => setSaved((items) => items.filter((item) => item.id !== filter.id)),
  });
  return (
    // #region filtering
    <div class="flex w-full flex-col gap-2">
      <div class="flex justify-end">
        <FilterPopover ariaLabel="Card filters" fields={FIELDS} clauses={clauses()} onClausesChange={setClauses} saved={savedFilters()} />
      </div>
      <ActiveFilterBar fields={FIELDS} clauses={clauses()} onClausesChange={setClauses} saved={savedFilters()} />
      <p class="m-0 text-[12px] text-[var(--color-text-muted)]">{visible().length} of {CARDS.length} cards</p>
    </div>
    // #endregion
  );
}

export default {
  name: "FilterPopover",
  group: "Data",
  summary:
    "Linear-style add-filter menu. Fields open their values beside the root; a value's label adds just that value and closes, its checkbox keeps the menu open. Every add creates a clause (a pill in ActiveFilterBar) and clauses combine with AND. Saved filters are listed at the end and applied with one click.",
  exports: ["FilterPopover", "FilterOptionsPanel", "matchClauses"],
  examples: [{ id: "filtering", title: "Filter, edit pills, and save a filter", wide: true, render: () => <Filtering /> }],
} satisfies DocEntry;
