import { Skeleton } from "./skeleton";
import type { DocEntry } from "./docs/types";

export default {
  name: "Skeleton",
  group: "Feedback",
  summary: "Opaque loading bone sized with utility classes. Give it a label only when it is the sole status indicator.",
  exports: ["Skeleton"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <Skeleton class="h-4 w-40" />
      // #endregion
    ) },
    { id: "shapes", title: "Common shapes", render: () => (
      // #region shapes
      <><Skeleton class="h-8 w-8 rounded-full" /><Skeleton class="h-3 w-52" /><Skeleton class="h-20 w-full" /></>
      // #endregion
    ) },
    { id: "labeled", title: "Labeled", render: () => (
      // #region labeled
      <Skeleton class="h-5 w-32" label="Loading activity" />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
