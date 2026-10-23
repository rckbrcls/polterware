import { Kbd } from "./kbd";
import type { DocEntry } from "./docs/types";

export default {
  name: "Keyboard Key",
  group: "Layout",
  summary: "Compact keyboard-key chip for shortcut hints and tooltips. Compose multiple keys in the order a person presses them.",
  exports: ["Kbd"],
  examples: [
    { id: "single", title: "Single key", render: () => (
      // #region single
      <Kbd>Esc</Kbd>
      // #endregion
    ) },
    { id: "shortcut", title: "Shortcut", render: () => (
      // #region shortcut
      <span class="inline-flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
