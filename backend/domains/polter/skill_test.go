package polter

import (
	"os"
	"strings"
	"testing"
)

// The Claude Code plugin skill embeds SpecCore verbatim; keep them in sync.
func TestPluginSkillEmbedsSpec(t *testing.T) {
	body, err := os.ReadFile("../../providers/agentsetup/plugin/skills/polter/SKILL.md")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), SpecCore) {
		t.Fatal("backend/providers/agentsetup/plugin/skills/polter/SKILL.md does not contain polter.SpecCore verbatim; copy the SpecCore text into its markdown fence")
	}
}
