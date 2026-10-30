package polter

import (
	"testing"

	"github.com/polterware/polterware/backend/domains/structure"
)

func TestLintComponentUnderSystem(t *testing.T) {
	nodes := []structure.Node{{ID: "s1", Path: "app", Level: structure.LevelDomain, Status: structure.NodeActive}}
	text := "---\npolter: 1\n---\n# app/cli: CLI\nlevel: component\nunder: app\n"
	_, diags := Lint(text, &References{Nodes: nodes})
	if HasErrors(diags) {
		t.Fatalf("diags = %+v", diags)
	}
}

func TestLintRejectsRetiredUses(t *testing.T) {
	nodes := []structure.Node{{ID: "s1", Path: "app", Level: structure.LevelDomain, Status: structure.NodeActive}}
	text := "---\npolter: 1\n---\n# app/cli: CLI\nlevel: component\nunder: app\nuses: app\n"
	if _, diags := Lint(text, &References{Nodes: nodes}); !hasDiag(diags, 7, "uses: is retired") {
		t.Fatalf("diags = %+v", diags)
	}
}
