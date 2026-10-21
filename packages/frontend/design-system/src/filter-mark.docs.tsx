import { FilterChip } from "./filter-chip";
import { FilterMark } from "./filter-mark";
import type { DocEntry } from "./docs/types";

export default {
  name: "FilterMark",
  group: "Data",
  summary:
    "Compact geometric mark for filter menus where color or shape carries the meaning. Pair the decorative mark with a visible label for status or linked states.",
  exports: ["FilterMark"],
  examples: [
    {
      id: "shapes",
      title: "Shapes",
      render: () => (
        // #region shapes
        <>
          <FilterChip><FilterMark /> Circle</FilterChip>
          <FilterChip><FilterMark shape="square" /> Square</FilterChip>
          <FilterChip><FilterMark shape="diamond" /> Diamond</FilterChip>
        </>
        // #endregion
      ),
    },
    {
      id: "tones",
      title: "Semantic tones",
      render: () => (
        // #region tones
        <>
          <FilterChip><FilterMark tone="ok" /> Verified</FilterChip>
          <FilterChip><FilterMark tone="warn" /> Needs review</FilterChip>
          <FilterChip><FilterMark tone="danger" /> Conflict</FilterChip>
          <FilterChip><FilterMark tone="syncing" /> Importing</FilterChip>
        </>
        // #endregion
      ),
    },
    {
      id: "outline",
      title: "Filled and outline states",
      render: () => (
        // #region outline
        <>
          <FilterChip><FilterMark shape="diamond" tone="ok" /> Linked</FilterChip>
          <FilterChip><FilterMark shape="diamond" variant="outline" /> Unlinked</FilterChip>
        </>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
