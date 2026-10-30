import { Button } from "./button";
import { PageContent, PageHeader } from "./page";
import type { DocEntry } from "./docs/types";

export default {
  name: "Page layout",
  group: "Pages",
  summary:
    "PageHeader is the detail and entity header, while PageContent provides the scrolling content region below it. Section indexes belong in the window title bar rather than PageHeader.",
  exports: ["PageContent", "PageHeader"],
  examples: [
    {
      id: "header",
      title: "Detail header",
      render: () => (
        // #region header
        <PageHeader
          title="Project settings"
          subtitle={<span class="text-[13px] text-[var(--color-text-muted)]">Local project</span>}
          actions={<Button size="sm">Save changes</Button>}
        />
        // #endregion
      ),
    },
    {
      id: "header-with-leading",
      title: "Leading mark",
      render: () => (
        // #region header-with-leading
        <PageHeader
          leading={<span class="text-[14px]">P</span>}
          title="General"
          divider={false}
        />
        // #endregion
      ),
    },
    {
      id: "content",
      title: "Scrollable content",
      render: () => (
        // #region content
        <PageContent class="max-h-32 p-4">
          <p class="text-[13px] text-[var(--color-text-muted)]">
            PageContent fills the available space and scrolls when its content overflows.
          </p>
        </PageContent>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
