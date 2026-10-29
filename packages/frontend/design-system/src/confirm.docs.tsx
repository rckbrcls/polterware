import { Button } from "./button";
import { ConfirmRegion, requestConfirm, requestReason } from "./confirm";
import { pushToast } from "./toast";
import type { DocEntry } from "./docs/types";

export default {
  name: "Confirm",
  group: "Overlays",
  summary: "Asks before an action that cannot be undone. The confirm states what the action touches and how to recover, and its primary button takes focus. Add one ConfirmRegion to the application shell; reversible actions skip the confirm and offer Undo in a toast instead. requestReason asks why before a change of intent (challenging a decision, moving a card back, archiving) and resolves the reason, or null when cancelled.",
  exports: ["ConfirmRegion", "requestConfirm", "requestReason"],
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
    {
      id: "reason",
      title: "Change of intent",
      render: () => (
        // #region reason
        <>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const reason = await requestReason({
                title: "Challenge “Use SQLite”?",
                description: "It goes back to review. Say what is wrong with it.",
                confirmLabel: "Challenge",
                placeholder: "Why challenge it?",
              });
              if (reason) pushToast(`Challenged: ${reason}`);
            }}
          >
            Challenge
          </Button>
          <ConfirmRegion />
        </>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
