import { createSignal } from "solid-js";
import { Button } from "./button";
import type { DocEntry } from "./docs/types";
import { FloatingWindow } from "./floating-window";

function FloatingWindowExample() {
  const [open, setOpen] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [minimized, setMinimized] = createSignal(false);
  return (
    // #region default
    <><Button onClick={() => setOpen(true)}>Open floating window</Button><FloatingWindow.Root open={open()} expanded={expanded()} minimized={minimized()} onOpenChange={setOpen} onExpandedChange={setExpanded} onMinimizedChange={setMinimized} aria-label="Activity window"><FloatingWindow.Workspace><p>Workspace content remains behind the card.</p></FloatingWindow.Workspace><FloatingWindow.Content><p>Floating activity content.</p></FloatingWindow.Content></FloatingWindow.Root></>
    // #endregion
  );
}

function CloseControlWindow() {
  const [open, setOpen] = createSignal(false);
  return (
    // #region close-controls
    <><Button onClick={() => setOpen(true)}>Open simple window</Button><FloatingWindow.Root open={open()} expanded={false} minimized={false} controls="close" onOpenChange={setOpen} onExpandedChange={() => undefined} onMinimizedChange={() => undefined}><FloatingWindow.Workspace><p>Workspace.</p></FloatingWindow.Workspace><FloatingWindow.Content><p>Close-only window controls.</p></FloatingWindow.Content></FloatingWindow.Root></>
    // #endregion
  );
}

export default {
  name: "Floating window",
  group: "Overlays",
  summary: "Movable and resizable floating card that can expand, minimize into a bubble, or close while preserving its geometry. Compose the workspace and portalled window content through its named parts.",
  exports: ["FloatingWindow"],
  examples: [{ id: "default", title: "Default", render: () => <FloatingWindowExample />, wide: true }, { id: "close-controls", title: "Close-only controls", render: () => <CloseControlWindow />, wide: true }],
} satisfies DocEntry;
