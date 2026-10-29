package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

func kindSnapshot() work.Snapshot {
	return work.Snapshot{
		ProjectID: "p1",
		Nodes: []structure.Node{
			{ID: "app", Path: "app", Level: structure.LevelSystem, Title: "App", Status: structure.NodeActive},
			{ID: "data", ParentID: "app", Path: "app/data", Level: structure.LevelDomain, Title: "Data", Status: structure.NodeActive},
			{ID: "db", ParentID: "data", Path: "app/data/db", Level: structure.LevelComponent, Title: "DB", Status: structure.NodeActive, Kind: "database", Tech: "Postgres"},
		},
	}
}

func planKind(t *testing.T, text string) ([]work.Op, []Diagnostic) {
	t.Helper()
	doc, diags := Decode("---\npolter: 1\n---\n" + text)
	if HasErrors(diags) {
		return nil, diags
	}
	return Plan(doc, kindSnapshot())
}

func TestPlanCreatesComponentKindAndTech(t *testing.T) {
	ops, diags := planKind(t, "# app/data/cache: Cache\nlevel: component\nkind: Cache\ntech: Redis\n")
	if HasErrors(diags) {
		t.Fatalf("plan: %+v", diags)
	}
	if len(ops) != 1 || ops[0].Fields["kind"] != "cache" || ops[0].Fields["tech"] != "Redis" {
		t.Fatalf("ops = %+v", ops)
	}
}

func TestPlanUpdatesAndClearsKindAndTech(t *testing.T) {
	ops, diags := planKind(t, "# app/data/db: DB\nkind:\ntech: SQLite\n")
	if HasErrors(diags) {
		t.Fatalf("plan: %+v", diags)
	}
	if len(ops) != 1 || ops[0].Fields["kind"] != "" || ops[0].Fields["tech"] != "SQLite" ||
		ops[0].Before["kind"] != "database" || ops[0].Before["tech"] != "Postgres" {
		t.Fatalf("ops = %+v", ops)
	}
	// An unchanged kind writes nothing.
	ops, diags = planKind(t, "# app/data/db: DB\nkind: database\n")
	if HasErrors(diags) || len(ops) != 0 {
		t.Fatalf("unchanged kind: ops = %+v diags = %+v", ops, diags)
	}
}

func TestKindIsOnlyForComponents(t *testing.T) {
	_, diags := planKind(t, "# app/ops: Ops\nlevel: domain\nunder: app\nkind: service\n")
	if !HasErrors(diags) || !strings.Contains(diags[0].Message, "only components have a kind") {
		t.Fatalf("domain kind: %+v", diags)
	}
	// A component that becomes a domain must clear its kind in the same block.
	_, diags = planKind(t, "# app/data/db: DB\nlevel: domain\nunder: app\n")
	if !HasErrors(diags) || !strings.Contains(diags[0].Message, "write kind: to clear it") {
		t.Fatalf("level change keeps kind: %+v", diags)
	}
	if _, diags = planKind(t, "# app/data/db: DB\nlevel: domain\nunder: app\nkind:\n"); HasErrors(diags) {
		t.Fatalf("cleared kind should pass: %+v", diags)
	}
}

func TestDecodeRejectsUnknownKindAndLongTech(t *testing.T) {
	_, diags := Decode("---\npolter: 1\n---\n# app/x: X\nlevel: component\nkind: spaceship\n")
	if !hasDiag(diags, 6, `unknown kind "spaceship"`) {
		t.Fatalf("diags = %+v", diags)
	}
	_, diags = Decode("---\npolter: 1\n---\n# app/x: X\nlevel: component\ntech: " + strings.Repeat("x", maxTechRunes+1) + "\n")
	if !hasDiag(diags, 6, "tech is too long") {
		t.Fatalf("diags = %+v", diags)
	}
}

func TestEncodeStructureShowsKindAndTech(t *testing.T) {
	snapshot := kindSnapshot()
	rows := make([]structure.Row, len(snapshot.Nodes))
	for i, node := range snapshot.Nodes {
		rows[i] = structure.Row{Node: node}
	}
	out := EncodeStructure("demo", rows, nil, "app/data/db")
	if !strings.Contains(out, "kind: database · tech: Postgres\n") {
		t.Fatalf("out = %s", out)
	}
	if strings.Contains(EncodeStructure("demo", rows, nil, "app/data"), "kind:") {
		t.Fatal("a node without kind or tech prints no kind line")
	}
}
