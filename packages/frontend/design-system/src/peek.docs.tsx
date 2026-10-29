import { createSignal } from "solid-js";
import { Button } from "./button";
import { Peek } from "./peek";
import type { DocEntry } from "./docs/types";

function PeekExample() {
  const [open, setOpen] = createSignal(false);
  return (
    // #region default
    <>
      <Button variant="texture" onClick={() => setOpen(true)}>Peek at Login</Button>
      <Peek open={open()} title="Login" onClose={() => setOpen(false)} onOpen={() => setOpen(false)}>
        <p class="text-[13px] text-[var(--color-text-secondary)]">Sign people in with a signed cookie. Two tasks open, one blocking question.</p>
      </Peek>
    </>
    // #endregion
  );
}

export default {
  name: "Peek",
  group: "Overlays",
  summary:
    "A quick look at an entity without leaving its list. A DataTable row with onPeek opens it on Space; Space or Escape closes it and focus returns to the row.",
  exports: ["Peek"],
  examples: [{ id: "default", title: "Quick look", render: () => <PeekExample /> }],
} satisfies DocEntry;
