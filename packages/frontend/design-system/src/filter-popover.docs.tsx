import { createSignal } from "solid-js";
import { FilterPopover, FilterCategoryPopover } from "./filter-popover";
import { FilterMark } from "./filter-mark";
import type { DocEntry } from "./docs/types";

function Direct() {
  const [verified, setVerified] = createSignal(false);
  return (
    // #region direct
    <FilterPopover
      triggerLabel="Filters"
      active={verified()}
      onClear={() => setVerified(false)}
      groups={[{
        id: "evidence",
        label: "Evidence",
        options: [
          { id: "verified", label: "Verified", checked: verified(), leading: <FilterMark tone="ok" />, onCheckedChange: setVerified },
          { id: "archived", label: "Archived", disabled: true, onCheckedChange: () => {} },
        ],
      }]}
    />
    // #endregion
  );
}

function IconOnly() {
  const [verified, setVerified] = createSignal(false);
  return (
    // #region icon-only
    <FilterPopover
      ariaLabel="Filter evidence"
      title="Filter evidence"
      active={verified()}
      onClear={() => setVerified(false)}
      groups={[{
        id: "evidence",
        label: "Evidence",
        options: [{ id: "verified", label: "Verified", checked: verified(), onCheckedChange: setVerified }],
      }]}
    />
    // #endregion
  );
}

function IconOnlyActive() {
  return (
    // #region icon-only-active
    <FilterPopover
      ariaLabel="Filter evidence"
      active
      onClear={() => {}}
      groups={[{
        id: "evidence",
        label: "Evidence",
        options: [{ id: "verified", label: "Verified", checked: true, onCheckedChange: () => {} }],
      }]}
    />
    // #endregion
  );
}

function Grouped() {
  const [stage, setStage] = createSignal("build");
  const [linked, setLinked] = createSignal(false);
  const [query, setQuery] = createSignal("");
  return (
    // #region grouped
    <FilterPopover
      triggerLabel="Refine work"
      active={Boolean(stage()) || linked()}
      onClear={() => { setStage(""); setLinked(false); }}
      search={{ placeholder: "Find a filter…", value: query(), onInput: setQuery, ariaLabel: "Find a work filter" }}
      groups={[
        {
          id: "stage",
          label: "Stage",
          selectionMode: "single",
          options: ["build", "verify"].map((id) => ({
            id,
            label: id === "build" ? "Build" : "Verify",
            checked: stage() === id,
            onCheckedChange: (checked: boolean) => setStage(checked ? id : ""),
          })),
        },
        {
          id: "linked",
          label: "Linked to evidence",
          inline: true,
          options: [{ id: "linked", label: "Linked to evidence", checked: linked(), onCheckedChange: setLinked }],
        },
      ]}
    />
    // #endregion
  );
}

function Category() {
  const [selected, setSelected] = createSignal<string[]>([]);
  return (
    // #region category
    <FilterCategoryPopover
      label="Stage"
      options={[
        { id: "build", label: "Build", leading: <FilterMark tone="syncing" /> },
        { id: "verify", label: "Verify", leading: <FilterMark tone="warn" /> },
        { id: "delivered", label: "Delivered", disabled: true, leading: <FilterMark tone="ok" /> },
      ]}
      selectedValues={selected()}
      onToggle={(id, checked) => setSelected((current) => checked ? [...current, id] : current.filter((value) => value !== id))}
      onClear={() => setSelected([])}
    />
    // #endregion
  );
}

export default {
  name: "FilterPopover",
  group: "Data",
  summary:
    "Compact filter controls for PageToolbar actions, with Ark-backed positioning and dismissal. Group selections use a blue, round 18px CountBadge with the shared raised texture. FilterCategoryPopover opens a category from a chip with the same count material.",
  exports: ["FilterPopover", "FilterCategoryPopover"],
  examples: [
    {
      id: "icon-only",
      title: "Icon-only trigger (list toolbars)",
      description: "The filter button used in the product toolbars: just the funnel icon, named by ariaLabel and title.",
      render: () => <IconOnly />,
    },
    {
      id: "icon-only-active",
      title: "Icon-only trigger with filters applied",
      description: "While active the trigger takes the selected surface; open it to find Clear filters.",
      render: () => <IconOnlyActive />,
    },
    { id: "direct", title: "Labelled trigger with a disabled option", render: () => <Direct /> },
    { id: "grouped", title: "Grouped filters with search and an inline switch", render: () => <Grouped /> },
    { id: "category", title: "Category chip with controlled selection", render: () => <Category /> },
    {
      id: "empty",
      title: "No filter groups",
      render: () => (
        // #region empty
        <FilterPopover groups={[]} triggerLabel="Filters" />
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
