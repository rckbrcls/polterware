import { createSignal } from "solid-js";
import { Button } from "./button";
import { ContextMenu } from "./context-menu";
import type { DocEntry } from "./docs/types";

function ContextMenuExample() {
  const [open, setOpen] = createSignal(false);
  const [anchorPoint, setAnchorPoint] = createSignal<{ x: number; y: number } | null>(null);
  return (
    // #region default
    <>
      <Button
        onContextMenu={(event) => {
          event.preventDefault();
          setAnchorPoint({ x: event.clientX, y: event.clientY });
          setOpen(true);
        }}
      >
        Right-click this area
      </Button>
      <ContextMenu.Root open={open()} onOpenChange={setOpen} anchorPoint={anchorPoint()}>
        <ContextMenu.Content>
          <ContextMenu.Item value="copy">Copy link</ContextMenu.Item>
          <ContextMenu.Item value="archive">Archive</ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item value="delete" danger>Delete</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    </>
    // #endregion
  );
}

export default {
  name: "Context menu",
  group: "Menus",
  summary:
    "Positioned Ark menu for a caller-provided pointer anchor. It reuses the compact dropdown rows, including selected and destructive states.",
  exports: ["ContextMenu"],
  examples: [{ id: "default", title: "Pointer menu", description: "Open it with a right-click on the target.", render: () => <ContextMenuExample /> }],
} satisfies DocEntry;
