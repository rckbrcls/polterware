import { createSignal } from "solid-js";
import { FilterChip, FilterChipGroup } from "./filter-chip";
import { FileText } from "./hugeicons";
import type { DocEntry } from "./docs/types";

function Toggle() {
  const [selected, setSelected] = createSignal(false);
  return (
    // #region toggle
    <FilterChip selected={selected()} onClick={() => setSelected((value) => !value)}>
      <FileText size={14} aria-hidden />
      Documents
    </FilterChip>
    // #endregion
  );
}

function Exclusive() {
  const [value, setValue] = createSignal("all");
  return (
    // #region exclusive
    <FilterChipGroup
      aria-label="Work stage"
      items={[
        { id: "all", label: "All", count: 12, countAriaLabel: "12 work cards" },
        { id: "build", label: "Build", count: 5 },
        { id: "verify", label: "Verify", count: 7 },
      ]}
      value={value()}
      onChange={setValue}
    />
    // #endregion
  );
}

export default {
  name: "FilterChip",
  group: "Data",
  summary:
    "Quiet filter chip with fill and type for secondary status, scope, or category filters under PageToolbar. FilterChipGroup arranges an exclusive set of choices.",
  exports: ["FilterChip", "FilterChipGroup"],
  examples: [
    {
      id: "states",
      title: "Default, selected, and disabled",
      render: () => (
        // #region states
        <>
          <FilterChip>All</FilterChip>
          <FilterChip selected count={5} countAriaLabel="5 active cards">Active</FilterChip>
          <FilterChip disabled>Archived</FilterChip>
        </>
        // #endregion
      ),
    },
    { id: "toggle", title: "Controlled toggle with icon", render: () => <Toggle /> },
    { id: "exclusive", title: "Exclusive group with counts", render: () => <Exclusive /> },
  ],
} satisfies DocEntry;
