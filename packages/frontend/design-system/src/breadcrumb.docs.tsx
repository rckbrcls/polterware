import { createSignal } from "solid-js";
import { Breadcrumb } from "./breadcrumb";
import { Input } from "./input";
import { PageToolbar } from "./page";
import { Tabs } from "./tabs";
import type { DocEntry } from "./docs/types";

function BoardToolbar() {
  const [layout, setLayout] = createSignal("board");
  return (
    // #region toolbar
    <PageToolbar.Root>
      <PageToolbar.Leading>
        <Tabs aria-label="Beta layout" items={[{ id: "board", label: "Board" }, { id: "list", label: "List" }]} value={layout()} onChange={setLayout} />
      </PageToolbar.Leading>
      <PageToolbar.Center>
        <Breadcrumb items={[{ label: "Milestones", onSelect: () => undefined }]} current="Beta" />
      </PageToolbar.Center>
      <PageToolbar.Actions>
        <Input size="sm" type="search" aria-label="Search cards" placeholder="Search…" />
      </PageToolbar.Actions>
    </PageToolbar.Root>
    // #endregion
  );
}

export default {
  name: "Breadcrumb",
  group: "Layout",
  summary:
    "The trail to the open place: links to the places above it, then the current one in primary text. It sits in the middle of the bar, in PageToolbar.Center or a document header, spaced between the tabs at the start and the actions at the end (justify-between), so it lands in the exact center only when both sides match.",
  exports: ["Breadcrumb"],
  examples: [{ id: "toolbar", title: "A board's toolbar", wide: true, render: () => <BoardToolbar /> }],
} satisfies DocEntry;
