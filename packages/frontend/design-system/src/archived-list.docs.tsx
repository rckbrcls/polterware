import { ArchivedList } from "./archived-list";
import { pushToast } from "./toast";
import type { DocEntry } from "./docs/types";

export default {
  name: "Archived list",
  group: "Data",
  summary: "The archive of one surface. Every row offers Restore and Delete permanently; deleting is the only way out of the archive that cannot be undone, so pair it with requestConfirm.",
  exports: ["ArchivedList"],
  examples: [
    {
      id: "rows",
      title: "Archived rows",
      render: () => (
        // #region rows
        <ArchivedList
          label="Archived evidence"
          items={[
            { id: "doc-release", title: "Release process", detail: "doc", archivedAt: "Oct 29, 2026" },
            { id: "runbook-cache", title: "Clear the session cache", detail: "runbook", archivedAt: "Oct 28, 2026" },
          ]}
          onRestore={(item) => pushToast(`Restored “${item.title}”`)}
          onDelete={(item) => pushToast(`Would delete “${item.title}”`)}
        />
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
