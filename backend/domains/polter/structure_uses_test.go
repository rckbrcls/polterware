package polter

import (
	"testing"

	"github.com/polterware/polterware/backend/domains/structure"
)

func TestLintComponentUnderSystem(t *testing.T) {
	nodes := []structure.Node{{ID: "s1", Path: "app", Level: structure.LevelSystem, Status: structure.NodeActive}}
	text := "---\npolter: 1\n---\n# app/cli: CLI\nlevel: component\nunder: app\n"
	_, diags := Lint(text, &References{Nodes: nodes})
	if HasErrors(diags) {
		t.Fatalf("diags = %+v", diags)
	}
}

func TestLintNodeUses(t *testing.T) {
	nodes := []structure.Node{
		{ID: "s1", Path: "app", Level: structure.LevelSystem, Status: structure.NodeActive},
		{ID: "d1", Path: "app/platform", Level: structure.LevelDomain, Status: structure.NodeActive, ParentID: "s1"},
		{ID: "c1", Path: "app/platform/core", Level: structure.LevelComponent, Status: structure.NodeActive, ParentID: "d1"},
	}
	ok := "---\npolter: 1\n---\n# app/cli: CLI\nlevel: component\nunder: app\nuses: app/platform/core\n"
	if _, diags := Lint(ok, &References{Nodes: nodes}); HasErrors(diags) {
		t.Fatalf("diags = %+v", diags)
	}
	bad := "---\npolter: 1\n---\n# app/cli: CLI\nlevel: component\nunder: app\nuses: app/missing\n"
	if _, diags := Lint(bad, &References{Nodes: nodes}); !hasDiag(diags, 4, "unknown uses") {
		t.Fatalf("diags = %+v", diags)
	}
	self := "---\npolter: 1\n---\n# app/cli: CLI\nlevel: component\nunder: app\nuses: app/cli\n"
	if _, diags := Lint(self, &References{Nodes: nodes}); !hasDiag(diags, 4, "cannot use itself") {
		t.Fatalf("diags = %+v", diags)
	}
}
