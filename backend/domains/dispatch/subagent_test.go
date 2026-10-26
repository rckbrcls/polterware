package dispatch

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	adapter "github.com/polterware/polterware/backend/providers/dispatch/adapters"
)

func TestApplyProfileExplicitWins(t *testing.T) {
	o := Options{Tier: adapter.TierHard, Prompt: "do it"}
	o.Filters.Model = "pinned"
	p := Profile{Tier: "easy", Model: "profile", ReadOnly: true, Timeout: "2m", Instructions: "be brief", Prefer: []string{"codex"}}
	if err := ApplyProfile(&o, "reviewer", p); err != nil {
		t.Fatal(err)
	}
	if o.Tier != adapter.TierHard || o.Filters.Model != "pinned" {
		t.Fatalf("explicit values lost: %+v", o)
	}
	if !o.ReadOnly || o.Timeout != 2*time.Minute || o.Profile != "reviewer" {
		t.Fatalf("profile not applied: %+v", o)
	}
	if o.Prompt != "be brief\n\ndo it" {
		t.Fatalf("prompt = %q", o.Prompt)
	}
}

func TestLoadAllProfilesProjectWins(t *testing.T) {
	dir := t.TempDir()
	user, project := filepath.Join(dir, "u.json"), filepath.Join(dir, "p.json")
	os.WriteFile(user, []byte(`{"agents":{"a":{"tier":"easy"},"b":{"tier":"easy"}}}`), 0o644)
	os.WriteFile(project, []byte(`{"agents":{"a":{"tier":"hard"}}}`), 0o644)
	m, err := LoadAllProfiles(user, project)
	if err != nil {
		t.Fatal(err)
	}
	if m["a"].Tier != "hard" || m["b"].Tier != "easy" {
		t.Fatalf("merge wrong: %+v", m)
	}
	if _, err := LoadProfiles(filepath.Join(dir, "missing.json")); err != nil {
		t.Fatal(err)
	}
}

func TestValidateProfile(t *testing.T) {
	known := map[string]bool{"codex": true}
	if got := ValidateProfile("x", Profile{Tier: "hard", Prefer: []string{"codex"}}, known); len(got) != 0 {
		t.Fatalf("unexpected problems: %v", got)
	}
	got := ValidateProfile("x", Profile{Tier: "huge", Timeout: "soon", Prefer: []string{"codex"}, Avoid: []string{"codex"}}, known)
	if len(got) != 3 {
		t.Fatalf("want 3 problems, got %v", got)
	}
	if len(ValidateProfile("e", Profile{}, known)) != 1 {
		t.Fatal("empty profile not flagged")
	}
}
