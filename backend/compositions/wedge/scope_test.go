package wedge

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/atlas"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestScopeRefsMergesSingleRepeatedAndCommas(t *testing.T) {
	got := ScopeRefs(" auth , billing ", []string{"billing", "login, auth", "", " invoices "})
	if strings.Join(got, "|") != "auth|billing|login|invoices" {
		t.Fatalf("refs = %v", got)
	}
	if ScopeRefs("", nil) != nil {
		t.Fatal("empty refs")
	}
}

func TestFilterChangesByScope(t *testing.T) {
	resolved := storepkg.NodeScope{Set: atlas.ScopeSet{"auth": true}}
	scopes := map[string]string{"fact-auth": "auth", "fact-bill": "billing"}
	rows := []storepkg.ChangeRow{
		{StepID: "open", PayloadJSON: `{"summary":"note"}`},
		{StepID: "bad-json", PayloadJSON: `{`},
		{StepID: "unscoped", PayloadJSON: `{"subject_ids":["other"]}`},
		{StepID: "in", PayloadJSON: `{"subject_ids":["fact-auth"]}`},
		{StepID: "out", PayloadJSON: `{"subject_ids":["fact-bill"]}`},
		{StepID: "either", PayloadJSON: `{"subject_ids":["fact-bill","fact-auth"]}`},
	}
	kept := FilterChangesByScope(resolved, scopes, rows)
	var ids []string
	for _, row := range kept {
		ids = append(ids, row.StepID)
	}
	if strings.Join(ids, "|") != "open|bad-json|unscoped|in|either" {
		t.Fatalf("kept = %v", ids)
	}
	if got := FilterChangesByScope(storepkg.NodeScope{}, scopes, rows); len(got) != len(rows) {
		t.Fatalf("nil set kept %d", len(got))
	}
}
