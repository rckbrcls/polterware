import { Button } from "./button";
import { ConfirmRegion, requestConfirm } from "./confirm";
import { pushToast } from "./toast";
import type { DocEntry } from "./docs/types";

export default {
  name: "Confirm",
  group: "Overlays",
  summary: "Asks before an action that cannot be undone. The confirm states what the action touches and how to recover, and its primary button takes focus. Add one ConfirmRegion to the application shell; reversible actions such as archive skip the confirm and offer Undo in a toast instead.",
  exports: ["ConfirmRegion", "requestConfirm"],
  examples: [
    {
      id: "delete",
      title: "Permanent delete",
      render: () => (
        // #region delete
        <>
          <Button
            size="sm"
            variant="danger"
            onClick={async () => {
              const confirmed = await requestConfirm({
                title: "Delete “Sketch” permanently?",
                description: "The canvas, its shapes, and its layout are removed from this project.",
                recovery: "This cannot be undone.",
                confirmLabel: "Delete permanently",
              });
              if (confirmed) pushToast("Deleted “Sketch”");
            }}
          >
            Delete permanently
          </Button>
          <ConfirmRegion />
        </>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
