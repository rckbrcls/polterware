import { createSignal } from "solid-js";
import { SearchBar } from "./search-bar";
import type { DocEntry } from "./docs/types";

function Controlled() {
  const [value, setValue] = createSignal("");
  return (
    // #region controlled
    <SearchBar placeholder="Search facts" value={value()} onInput={setValue} />
    // #endregion
  );
}

export default {
  name: "Search bar",
  group: "Inputs",
  summary: "SearchBar is the compact search control for PageToolbar slots and defaults to toolbar density. It is controlled by the caller and forwards its accessible name to the underlying input.",
  exports: ["SearchBar"],
  examples: [
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "value", title: "With value", render: () => (
      // #region value
      <SearchBar placeholder="Search decisions" value="scope" onInput={() => undefined} aria-label="Search decisions" />
      // #endregion
    ) },
    { id: "medium", title: "Medium density", render: () => (
      // #region medium
      <SearchBar placeholder="Search evidence" value="" onInput={() => undefined} size="md" />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
