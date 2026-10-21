import { createSignal } from "solid-js";
import { Button } from "./button";
import { Popover } from "./popover";
import type { DocEntry } from "./docs/types";

function PopoverExample() {
  const [open, setOpen] = createSignal(false);
  let anchor: HTMLButtonElement | undefined;
  return (
    // #region default
    <><Button ref={anchor} onClick={() => setOpen(true)}>Open details</Button><Popover open={open()} onClose={() => setOpen(false)} anchorRef={() => anchor} title="Project details"><div class="p-4">Project context and actions.</div></Popover></>
    // #endregion
  );
}

function EndAlignedPopover() {
  const [open, setOpen] = createSignal(false);
  let anchor: HTMLButtonElement | undefined;
  return (
    // #region end-aligned
    <><Button ref={anchor} onClick={() => setOpen(true)}>More</Button><Popover open={open()} onClose={() => setOpen(false)} anchorRef={() => anchor} align="end" width={240}><div class="p-4">End-aligned content.</div></Popover></>
    // #endregion
  );
}

export default {
  name: "Popover",
  group: "Overlays",
  summary: "Non-modal Ark popover with Polter surface and spring presence. Prefer an anchorRef so placement, focus, Escape, and outside dismissal stay with Ark.",
  exports: ["Popover"],
  examples: [{ id: "default", title: "Default", render: () => <PopoverExample /> }, { id: "end-aligned", title: "End aligned", render: () => <EndAlignedPopover /> }],
} satisfies DocEntry;
