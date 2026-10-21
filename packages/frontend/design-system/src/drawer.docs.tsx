import { createSignal } from "solid-js";
import { Button } from "./button";
import { Drawer } from "./drawer";
import type { DocEntry } from "./docs/types";

function DrawerExample() {
  const [open, setOpen] = createSignal(false);
  return (
    // #region default
    <><Button onClick={() => setOpen(true)}>Open drawer</Button><Drawer open={open()} onClose={() => setOpen(false)} title="Project activity" subtitle="Recent changes" footer={<Button onClick={() => setOpen(false)}>Done</Button>}><p>Changes from this project appear here.</p></Drawer></>
    // #endregion
  );
}

function FlushDrawerExample() {
  const [open, setOpen] = createSignal(false);
  return (
    // #region flush
    <><Button onClick={() => setOpen(true)}>Open full-bleed drawer</Button><Drawer open={open()} onClose={() => setOpen(false)} title="Terminal" flush closeOnInteractOutside={false}><div class="p-4">Interactive content stays inside the drawer.</div></Drawer></>
    // #endregion
  );
}

export default {
  name: "Drawer",
  group: "Overlays",
  summary: "Temporary modal side sheet with Ark-managed Escape, scrim, focus, and dismissal behavior. It supports a standard padded body or a flush full-bleed surface.",
  exports: ["Drawer"],
  examples: [{ id: "default", title: "Default", render: () => <DrawerExample /> }, { id: "flush", title: "Flush body", render: () => <FlushDrawerExample /> }],
} satisfies DocEntry;
