package knowledge

import "testing"

func TestKnowledgeKinds(t *testing.T) {
	for _, kind := range []string{"evidence", "verdict", "adr"} { // legacy kinds
		if _, err := NewItem(kind+"-1", "project", "Title", "Body", kind, nil); err == nil {
			t.Fatalf("expected kind %s to be rejected", kind)
		}
	}
	decision, err := NewItem("decision-1", "project", "Title", "Body", KindDecision, nil)
	if err != nil || decision.DocType != "" {
		t.Fatalf("decision = %+v, err %v", decision, err)
	}
	// A doc type names a doc of that type; tags stay as given.
	for _, kind := range []string{"doc", "runbook", "source"} {
		item, err := NewItem(kind+"-1", "project", "Title", "Body", kind, []string{"ops"})
		if err != nil {
			t.Fatalf("expected doc type %s to be valid: %v", kind, err)
		}
		if item.Kind != KindDoc || item.DocType != kind || len(item.Tags) != 1 || item.Tags[0] != "ops" {
			t.Fatalf("doc type %s read as %+v", kind, item)
		}
	}
	// The five-document Work model moved to the Work tables (Decision 0006).
	for _, kind := range []string{"spec", "plan", "tasks", "clarify", "checklist", "constitution"} {
		if _, err := NewItem(kind+"-1", "project", "Title", "Body", kind, nil); err == nil {
			t.Fatalf("expected kind %s to be rejected", kind)
		}
	}
}
