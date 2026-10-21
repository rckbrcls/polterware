package knowledge

import "testing"

func TestKnowledgeKinds(t *testing.T) {
	if _, err := NewItem("doc", "project", "Title", "Body", "decision", nil); err == nil {
		t.Fatal("expected unsupported kind")
	}
	for _, kind := range []string{"verdict", "evidence"} {
		if _, err := NewItem(kind+"-1", "project", "Title", "Body", kind, nil); err != nil {
			t.Fatalf("expected kind %s to be valid: %v", kind, err)
		}
	}
	// Former evidence kinds normalize to evidence and keep the old kind as a tag.
	for _, kind := range []string{"doc", "runbook", "source"} {
		item, err := NewItem(kind+"-1", "project", "Title", "Body", kind, nil)
		if err != nil {
			t.Fatalf("expected legacy kind %s to normalize: %v", kind, err)
		}
		if item.Kind != KindEvidence || len(item.Tags) != 1 || item.Tags[0] != kind {
			t.Fatalf("legacy kind %s normalized to %+v", kind, item)
		}
	}
	// The five-document Work model moved to the Work tables (Verdict 0006).
	for _, kind := range []string{"spec", "plan", "tasks", "clarify", "checklist", "constitution"} {
		if _, err := NewItem(kind+"-1", "project", "Title", "Body", kind, nil); err == nil {
			t.Fatalf("expected kind %s to be rejected", kind)
		}
	}
}
