import { createSignal } from "solid-js";
import { DisclosureButton } from "./disclosure-button";
import type { DocEntry } from "./docs/types";

export default {
  name: "DisclosureButton",
  group: "Buttons",
  summary:
    "Quiet chevron that expands or collapses a tree node, list group or section. It rotates when expanded and needs an aria-label that names what it controls.",
  exports: ["DisclosureButton"],
  examples: [
    {
      id: "toggle",
      title: "Toggle",
      render: () => {
        // #region toggle
        const [open, setOpen] = createSignal(false);
        return (
          <DisclosureButton
            expanded={open()}
            aria-label={`${open() ? "Collapse" : "Expand"} Billing`}
            onClick={() => setOpen((value) => !value)}
          />
        );
        // #endregion
      },
    },
    {
      id: "compact",
      title: "Compact",
      description: "Tree rows use the narrower hit area.",
      render: () => (
        // #region compact
        <DisclosureButton size="compact" expanded aria-label="Collapse Billing" />
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
