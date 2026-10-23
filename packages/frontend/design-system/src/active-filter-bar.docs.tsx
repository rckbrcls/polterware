import { createSignal } from "solid-js";
import { ActiveFilterBar } from "./active-filter-bar";
import { Button } from "./button";
import type { DocEntry } from "./docs/types";

const filters = [
  { id: "stage", label: "Stage: Build" },
  { id: "scope", label: "Scope: Core" },
];

function Removable() {
  const [items, setItems] = createSignal(filters);
  return (
    // #region removable
    <div class="w-full">
      <ActiveFilterBar
        items={items().map((item) => ({
          ...item,
          onRemove: () => setItems((current) => current.filter((filter) => filter.id !== item.id)),
        }))}
        onClear={() => setItems([])}
        clearLabel="Clear all"
      />
      <Button size="sm" variant="ghost" onClick={() => setItems(filters)}>Reset example</Button>
    </div>
    // #endregion
  );
}

function Empty() {
  const [active, setActive] = createSignal(false);
  return (
    // #region empty
    <div class="w-full">
      <Button size="sm" onClick={() => setActive((value) => !value)}>
        {active() ? "Hide filter" : "Add filter"}
      </Button>
      <ActiveFilterBar
        items={active() ? [{ id: "stage", label: "Stage: Verify", onRemove: () => setActive(false) }] : []}
      />
    </div>
    // #endregion
  );
}

export default {
  name: "ActiveFilterBar",
  group: "Data",
  summary:
    "Removable active-filter pills displayed under PageToolbar. The bar is hidden when no filters remain.",
  exports: ["ActiveFilterBar"],
  examples: [
    { id: "removable", title: "Remove individual filters or clear all", wide: true, render: () => <Removable /> },
    { id: "empty", title: "Hidden until a filter is added", wide: true, render: () => <Empty /> },
  ],
} satisfies DocEntry;
