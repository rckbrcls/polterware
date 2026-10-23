import { createSignal } from "solid-js";
import { TabPanel, Tabs } from "./tabs";
import type { DocEntry } from "./docs/types";

const items = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity", count: 4, countAriaLabel: "4 activity items", countTone: "info" as const },
  { id: "blocked", label: "Blocked", disabled: true },
];

function ControlledTabs() {
  const [value, setValue] = createSignal("overview");
  return (
    // #region controlled
    <><Tabs items={items} value={value()} onChange={setValue} aria-label="Project sections" /><TabPanel id="overview" active={value() === "overview"}><p class="p-2 text-sm text-[var(--color-text-secondary)]">Overview content</p></TabPanel><TabPanel id="activity" active={value() === "activity"}><p class="p-2 text-sm text-[var(--color-text-secondary)]">Activity content</p></TabPanel></>
    // #endregion
  );
}

export default {
  name: "Tabs",
  group: "Layout",
  summary: "Section navigation tabs pair Ark behavior with a gliding active pill. TabPanel is the presentational association for route- or state-owned content.",
  exports: ["Tabs", "TabPanel"],
  examples: [
    { id: "controlled", title: "Controlled", wide: true, render: () => <ControlledTabs /> },
    { id: "closable", title: "Closable", render: () => (
      // #region closable
      <Tabs items={[{ id: "notes", label: "Notes", closable: true }, { id: "files", label: "Files" }]} value="notes" onChange={() => {}} onClose={() => {}} aria-label="Editor tabs" />
      // #endregion
    ) },
    { id: "panel", title: "Active panel", render: () => (
      // #region panel
      <TabPanel id="details" active><p class="p-2 text-sm text-[var(--color-text-secondary)]">Details are visible.</p></TabPanel>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
