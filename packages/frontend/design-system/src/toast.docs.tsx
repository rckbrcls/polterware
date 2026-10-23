import { Button } from "./button";
import { ToastRegion, pushToast } from "./toast";
import type { DocEntry } from "./docs/types";

export default {
  name: "Toast",
  group: "Feedback",
  summary: "A live region for brief, non-blocking feedback. Add one ToastRegion to the application shell and trigger messages from completed actions.",
  exports: ["ToastRegion", "pushToast"],
  examples: [
    {
      id: "tones",
      title: "Message tones",
      render: () => (
        // #region tones
        <>
          <Button size="sm" onClick={() => pushToast("Changes saved.", "success")}>Show success</Button>
          <Button size="sm" onClick={() => pushToast("Connection lost.", "danger")}>Show error</Button>
          <ToastRegion />
        </>
        // #endregion
      ),
    },
    {
      id: "default",
      title: "Default",
      render: () => (
        // #region default
        <>
          <Button size="sm" onClick={() => pushToast("Invite copied to clipboard.")}>Show message</Button>
          <ToastRegion />
        </>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
