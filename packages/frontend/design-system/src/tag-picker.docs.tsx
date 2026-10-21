import { createSignal } from "solid-js";
import { TagPicker } from "./tag-picker";
import type { DocEntry } from "./docs/types";

const tags = [{ id: "architecture", name: "Architecture" }, { id: "research", name: "Research" }, { id: "verified", name: "Verified" }];

function Controlled() {
  const [selectedIds, setSelectedIds] = createSignal(["architecture"]);
  return (
    // #region controlled
    <TagPicker tags={tags} selectedIds={selectedIds()} onChange={setSelectedIds} onCreate={async (name) => name.toLowerCase().replaceAll(" ", "-")} />
    // #endregion
  );
}

export default {
  name: "Tag picker",
  group: "Inputs",
  summary: "TagPicker renders selected tags as removable badges and opens its suggestions only after Add tag is clicked. It filters existing tags and delegates creation to the caller.",
  exports: ["TagPicker"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <TagPicker tags={tags} selectedIds={[]} onChange={() => undefined} onCreate={async () => undefined} />
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "multiple", title: "Multiple selected", render: () => (
      // #region multiple
      <TagPicker tags={tags} selectedIds={["architecture", "verified"]} onChange={() => undefined} onCreate={async () => undefined} />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
