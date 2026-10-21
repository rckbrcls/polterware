import { createSignal } from "solid-js";
import { Button } from "./button";
import { A11yDialog, Dialog } from "./dialog";
import type { DocEntry } from "./docs/types";

function DefaultDialog() {
  const [open, setOpen] = createSignal(false);
  return (
    // #region default
    <><Button onClick={() => setOpen(true)}>Open dialog</Button><Dialog open={open()} onClose={() => setOpen(false)} title="Archive project" description="This can be restored later." footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" onClick={() => setOpen(false)}>Archive</Button></>}><p>Archive this project and remove it from the active list.</p></Dialog></>
    // #endregion
  );
}

function FlushDialog() {
  const [open, setOpen] = createSignal(false);
  return (
    // #region flush
    <><Button onClick={() => setOpen(true)}>Open catalog</Button><A11yDialog open={open()} onClose={() => setOpen(false)} title="Add component" chrome="flush" size="xl"><p>Dense catalog content begins at the top of the frame.</p></A11yDialog></>
    // #endregion
  );
}

export default {
  name: "Dialog",
  group: "Overlays",
  summary: "Product Ark dialog with opaque Polter surface, accessible title, and optional header, body, and footer regions. Use flush chrome for dense catalogs that own their own top content.",
  exports: ["Dialog", "A11yDialog"],
  examples: [{ id: "default", title: "Default", render: () => <DefaultDialog /> }, { id: "flush", title: "Flush chrome", render: () => <FlushDialog /> }],
} satisfies DocEntry;
