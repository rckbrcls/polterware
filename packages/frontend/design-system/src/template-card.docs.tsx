import { TemplateCard, TemplateCardGrid } from "./template-card";
import { FileText, FolderKanban } from "./hugeicons";
import type { DocEntry } from "./docs/types";

const templates = [
  { id: "decision", title: "Decision", description: "Capture a durable project verdict.", icon: <FileText size={16} />, tone: "knowledge" as const, onSelect: () => {} },
  { id: "work", title: "Work card", description: "Track a scoped implementation thread.", icon: <FolderKanban size={16} />, tone: "execution" as const, onSelect: () => {} },
];

export default {
  name: "Template Card",
  group: "Layout",
  summary: "Selectable template cards pair a concise title and description with a seeded icon finish. TemplateCardGrid lays these choices out with an optional group label.",
  exports: ["TemplateCard", "TemplateCardGrid"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <TemplateCard title="Decision" description="Capture a durable project verdict." icon={<FileText size={16} />} tone="knowledge" onSelect={() => {}} />
      // #endregion
    ) },
    { id: "branded", title: "Branded", render: () => (
      // #region branded
      <TemplateCard title="GitHub import" description="Bring repository evidence into the project." icon={<FolderKanban size={16} />} brand="github" onSelect={() => {}} />
      // #endregion
    ) },
    { id: "grid", title: "Grid", wide: true, render: () => (
      // #region grid
      <TemplateCardGrid label="Start from a template" items={templates} />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
