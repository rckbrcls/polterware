import { createSignal } from "solid-js";
import { Button } from "./button";
import type { DocEntry } from "./docs/types";
import { SidePanel } from "./detail-panel";

function SidePanelExample() {
  const [open, setOpen] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  return (
    // #region default
    <><Button onClick={() => setOpen(true)}>Open details</Button><SidePanel.Root open={open()} expanded={expanded()} onOpenChange={setOpen} onExpandedChange={setExpanded} aria-label="Project details"><SidePanel.Collection><p>Project list stays in the workspace.</p></SidePanel.Collection><SidePanel.Content><SidePanel.Body><SidePanel.Title title="Project details" /><SidePanel.Section title="Overview"><p>Evidence-backed project context.</p></SidePanel.Section></SidePanel.Body></SidePanel.Content></SidePanel.Root></>
    // #endregion
  );
}

function OverlayPanel() {
  const [open, setOpen] = createSignal(false);
  return (
    // #region overlay
    <><Button onClick={() => setOpen(true)}>Open overlay details</Button><SidePanel.Root open={open()} onOpenChange={setOpen} mode="overlay"><SidePanel.Collection><p>Overlay mode does not reserve space.</p></SidePanel.Collection><SidePanel.Content><SidePanel.Body><SidePanel.Title title="Overlay details" /></SidePanel.Body></SidePanel.Content></SidePanel.Root></>
    // #endregion
  );
}

export default {
  name: "Side panel",
  group: "Overlays",
  summary: "Detail panel composition for a workspace and a focused record surface. It can reserve collection space or float in overlay mode, with built-in close, resize, and expansion behavior.",
  exports: ["SidePanel"],
  examples: [{ id: "default", title: "Reserved detail panel", render: () => <SidePanelExample />, wide: true }, { id: "overlay", title: "Overlay mode", render: () => <OverlayPanel />, wide: true }],
} satisfies DocEntry;
