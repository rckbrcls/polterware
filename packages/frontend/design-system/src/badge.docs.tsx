import { createSignal } from "solid-js";
import { Badge } from "./badge";
import { FloatingCountBadge } from "./floating-count-badge";
import { Button } from "./button";
import type { DocEntry } from "./docs/types";

function InteractiveBadge() {
  const [selected, setSelected] = createSignal(false);
  return (
    // #region interactive
    <Badge tone={selected() ? "info" : "muted"} onClick={() => setSelected((value) => !value)}>{selected() ? "Selected" : "Select label"}</Badge>
    // #endregion
  );
}

export default {
  name: "Badge",
  group: "Feedback",
  summary: "Badge is solid metadata chrome for labels and relations, while FloatingCountBadge attaches a count to an interactive control. Use StatusChip instead for semantic status.",
  exports: ["Badge", "FloatingCountBadge"],
  examples: [
    { id: "tones", title: "Tones", render: () => (
      // #region tones
      <><Badge tone="muted">Draft</Badge><Badge tone="info">Design</Badge><Badge tone="ok">Approved</Badge><Badge tone="warn">Review</Badge><Badge tone="danger">Blocked</Badge></>
      // #endregion
    ) },
    { id: "interactive", title: "Interactive", render: () => <InteractiveBadge /> },
    { id: "count", title: "Floating count", render: () => (
      // #region count
      <span class="pw-floating-count-host"><Button size="sm">Notifications</Button><FloatingCountBadge count={3} tone="danger" ariaLabel="3 unread notifications" /></span>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
