import { PromptCardGrid } from "./prompt-card";
import { FileText, FolderKanban } from "./hugeicons";
import type { DocEntry } from "./docs/types";

const items = [
  { id: "open-work", title: "Find open work", description: "Turn TODOs and issues into cards.", icon: <FolderKanban size={16} />, tone: "execution" as const, prompt: "Read the TODOs of this project and propose Work cards." },
  { id: "extract-decisions", title: "Extract decisions", description: "Record the decisions this code reflects.", icon: <FileText size={16} />, tone: "knowledge" as const, prompt: "Find the architectural decisions in this code and record them." },
];

export default {
  name: "Prompt Card",
  group: "Layout",
  summary: "Prompt cards copy a ready-made prompt for the user's coding agent, so an empty page fills from the real project instead of a fixed template. PromptCardGrid lays them out with an optional label.",
  exports: ["PromptCardGrid", "copyAgentPrompt"],
  examples: [
    { id: "grid", title: "Grid", wide: true, render: () => (
      // #region grid
      <PromptCardGrid items={items} />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
