import { BookOpen, Button, Copy, Download, pushToast } from "@polterware/frontend-design-system";
import { SettingsRow, SettingsSection } from "./settings-section";
import {
  POLTERWARE_AI_SKILL_FILENAME,
  POLTERWARE_AI_SKILL_MARKDOWN,
} from "./polterware-ai-skill";

function downloadSkill() {
  const blob = new Blob([POLTERWARE_AI_SKILL_MARKDOWN], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = POLTERWARE_AI_SKILL_FILENAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Polterware AI skill export (copy / download). */
export function SkillCard() {
  return (
    <SettingsSection title="AI skill" description="Copy or download the Polterware instructions for coding agents.">
      <SettingsRow
        icon={BookOpen}
        tone="knowledge"
        seed="ai-skill"
        label="Polterware AI skill"
        description="Markdown that teaches any agent the Polterware MCP tools and local CLI."
      >
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            void navigator.clipboard.writeText(POLTERWARE_AI_SKILL_MARKDOWN).then(
              () => pushToast("Skill copied.", "success"),
              () => pushToast("Could not copy skill.", "danger"),
            );
          }}
        >
          <Copy size={14} />
          Copy
        </Button>
        <Button size="sm" variant="ghost" onClick={() => downloadSkill()}>
          <Download size={14} />
          Download .md
        </Button>
      </SettingsRow>
    </SettingsSection>
  );
}
