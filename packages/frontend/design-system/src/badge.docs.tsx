import { createSignal } from "solid-js";
import { Badge } from "./badge";
import { CountBadge } from "./count-badge";
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
  summary: "Badge is solid metadata chrome for labels and relations. CountBadge shares its opaque frame, lit rim, and gradient face for inline counts; FloatingCountBadge positions that same count on a control. Use StatusChip for semantic status.",
  exports: ["Badge", "CountBadge", "FloatingCountBadge"],
  examples: [
    { id: "tones", title: "Tones", render: () => (
      // #region tones
      <><Badge tone="muted">Draft</Badge><Badge tone="info">Design</Badge><Badge tone="ok">Approved</Badge><Badge tone="warn">Review</Badge><Badge tone="danger">Blocked</Badge></>
      // #endregion
    ) },
    { id: "interactive", title: "Interactive", render: () => <InteractiveBadge /> },
    { id: "inline-counts", title: "Inline counts in every tone", render: () => (
      // #region inline-counts
      <><CountBadge count={0} tone="neutral" /><CountBadge count={2} /><CountBadge count={12} tone="warning" /><CountBadge count={99} tone="success" /><CountBadge count={100} tone="danger" /></>
      // #endregion
    ) },
    { id: "count", title: "Floating count", render: () => (
      // #region count
      <><span class="pw-floating-count-host"><Button size="sm">Notifications</Button><FloatingCountBadge count={3} tone="danger" ariaLabel="3 unread notifications" /></span><span class="pw-floating-count-host"><Button size="sm">Items</Button><FloatingCountBadge count={12} tone="neutral" ariaLabel="12 items" /></span></>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
