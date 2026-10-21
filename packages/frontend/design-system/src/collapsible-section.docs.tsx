import { CollapsibleSection } from "./detail-panel";
import { Folder } from "./hugeicons";
import type { DocEntry } from "./docs/types";

export default {
  name: "Collapsible Section",
  group: "Layout",
  summary: "A titled page-content block whose measured body folds behind its heading. It shares the detail-panel motion and defaults to open.",
  exports: ["CollapsibleSection"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <CollapsibleSection title="Evidence"><p class="text-sm text-[var(--color-text-secondary)]">Three sources support this fact.</p></CollapsibleSection>
      // #endregion
    ) },
    { id: "icon", title: "With icon", render: () => (
      // #region icon
      <CollapsibleSection title="Project files" icon={<Folder size={14} />}><p class="text-sm text-[var(--color-text-secondary)]">Source imports are ready.</p></CollapsibleSection>
      // #endregion
    ) },
    { id: "closed", title: "Initially closed", render: () => (
      // #region closed
      <CollapsibleSection title="Advanced settings" defaultOpen={false}><p class="text-sm text-[var(--color-text-secondary)]">Open this section to reveal its content.</p></CollapsibleSection>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
