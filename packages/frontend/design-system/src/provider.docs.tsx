import { DesignSystemProvider } from "./provider";
import type { DocEntry } from "./docs/types";

export default {
  name: "Design system provider",
  group: "Pages",
  summary:
    "DesignSystemProvider lets an app adapter supply the storage namespace, detail expansion, and shortcut behavior used by shared components. Explicit storage keys are never prefixed.",
  exports: ["DesignSystemProvider"],
  examples: [
    {
      id: "default-adapter",
      title: "App storage namespace",
      render: () => (
        // #region default-adapter
        <DesignSystemProvider storagePrefix="polterware.desktop">
          <p class="text-[13px] text-[var(--color-text-muted)]">Shared UI for the desktop app.</p>
        </DesignSystemProvider>
        // #endregion
      ),
    },
    {
      id: "custom-detail-adapter",
      title: "Custom detail adapter",
      render: () => (
        // #region custom-detail-adapter
        <DesignSystemProvider storagePrefix="polterware.gallery" expandDetail={() => undefined}>
          <p class="text-[13px] text-[var(--color-text-muted)]">The host can own detail-panel behavior.</p>
        </DesignSystemProvider>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
