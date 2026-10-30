import { createSignal } from "solid-js";
import { Button } from "./button";
import { Peek, PeekChip, PeekSection } from "./peek";
import type { DocEntry } from "./docs/types";

function PeekExample() {
  const [open, setOpen] = createSignal(false);
  return (
    // #region default
    <>
      <Button variant="texture" onClick={() => setOpen(true)}>Peek at Login</Button>
      <Peek open={open()} title="Login" kind="Card" onClose={() => setOpen(false)} onOpen={() => setOpen(false)}
        properties={<><PeekChip>In progress</PeekChip><PeekChip>app/auth</PeekChip></>}>
        <p class="m-0">Sign people in with a signed cookie.</p>
        <PeekSection title="Open tasks"><p class="m-0">T1 Issue the session cookie</p></PeekSection>
      </Peek>
    </>
    // #endregion
  );
}

export default {
  name: "Peek",
  group: "Overlays",
  summary:
    "A quick look at an entity without leaving where you are, laid out like the Composer: the kind, the title, read-only property chips, then a summary. Expand (or ⌘Enter) opens its page. A DataTable row with onPeek opens it on Space; Space or Escape closes it and focus returns to the row.",
  exports: ["Peek", "PeekChip", "PeekSection"],
  examples: [{ id: "default", title: "Quick look", render: () => <PeekExample /> }],
} satisfies DocEntry;
