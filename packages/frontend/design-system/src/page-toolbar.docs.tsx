import { createSignal } from "solid-js";
import { Button } from "./button";
import { FilterPopover } from "./filter-popover";
import { PlusIcon } from "./hugeicons";
import { Input } from "./input";
import { PageToolbar } from "./page";
import { Tabs } from "./tabs";
import type { DocEntry } from "./docs/types";

function Navigation() {
  const [value, setValue] = createSignal("facts");
  return (
    // #region navigation
    <PageToolbar.Root>
      <PageToolbar.Tabs>
        <Tabs
          aria-label="Truth section"
          items={[{ id: "facts", label: "Facts" }, { id: "evidence", label: "Evidence" }]}
          value={value()}
          onChange={setValue}
        />
      </PageToolbar.Tabs>
      <PageToolbar.Actions>
        <FilterPopover groups={[]} ariaLabel="Truth filters" />
        <Button size="sm" disabled><PlusIcon size={14} aria-hidden /> Add item</Button>
      </PageToolbar.Actions>
    </PageToolbar.Root>
    // #endregion
  );
}

export default {
  name: "PageToolbar",
  group: "Data",
  summary:
    "First row inside the main surface, with a solid fill and a soft fade trail beneath the bar. Compound tabs, leading, and actions slots arrange collection controls above the divided workspace.",
  exports: ["PageToolbar"],
  examples: [
    {
      id: "leading",
      title: "Leading content and actions",
      wide: true,
      render: () => (
        // #region leading
        <PageToolbar.Root>
          <PageToolbar.Leading><span>12 work cards</span></PageToolbar.Leading>
          <PageToolbar.Actions>
            <Input size="sm" type="search" aria-label="Search work cards" placeholder="Search work…" />
            <FilterPopover groups={[]} ariaLabel="Work filters" />
          </PageToolbar.Actions>
        </PageToolbar.Root>
        // #endregion
      ),
    },
    { id: "navigation", title: "Section tabs and a disabled action", wide: true, render: () => <Navigation /> },
  ],
} satisfies DocEntry;
