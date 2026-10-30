package inbox

import (
	"strings"
	"testing"
	"time"

	"github.com/polterware/polterware/backend/domains/drift"
)

func TestDeriveSourcesAndOrder(t *testing.T) {
	questions := []Question{
		{ID: "q1", CardSlug: "git-import", Text: "How many commits back?"},
		{ID: "q2", CardSlug: "git-import", Text: "Include merge commits?", Blocking: true, Options: []string{"yes", "no"}},
	}
	findings := []drift.Finding{
		{Type: drift.TypeCommitWithoutTask, Severity: drift.SeverityInfo, Summary: "needs no person", Details: map[string]string{"sha": "x"}},
		{Type: drift.TypeTaskDoneUnmatched, Severity: drift.SeverityWarning, Summary: "task git-import T2 is done with no commit on main",
			SubjectIDs: []string{"t2"}, Details: map[string]string{"slug": "git-import", "task": "T2"}},
		{Type: drift.TypeCommitWithoutTask, Severity: drift.SeverityConflict, Summary: "conflict", SubjectIDs: []string{"e1"}, Details: map[string]string{"sha": "e1"}},
	}
	result := Derive(questions, findings, nil, nil)

	if len(result.Items) != 4 {
		t.Fatalf("items = %d, want 4 (info drift left out): %+v", len(result.Items), result.Items)
	}
	var order []string
	for _, item := range result.Items {
		order = append(order, item.Kind+":"+item.Title)
	}
	want := []string{
		"decision:Include merge commits?",
		"drift:conflict",
		"decision:How many commits back?",
		"drift:task git-import T2 is done with no commit on main",
	}
	if strings.Join(order, "|") != strings.Join(want, "|") {
		t.Fatalf("order =\n%v\nwant\n%v", order, want)
	}
	if result.Open() != 4 || result.Blocking() != 2 {
		t.Fatalf("open=%d blocking=%d, want 4 and 2", result.Open(), result.Blocking())
	}
	if got := result.Items[3].Where; got != "git-import T2" {
		t.Fatalf("drift where = %q", got)
	}
	if got := result.Items[0].Actions; strings.Join(got, ",") != "decide,delegate,defer" {
		t.Fatalf("decision actions = %v", got)
	}
	if got := result.Items[1].Actions; strings.Join(got, ",") != "link,defer,ignore" {
		t.Fatalf("commit actions = %v", got)
	}
	if got := result.Items[3].Actions; strings.Join(got, ",") != "link,reopen,defer,ignore" {
		t.Fatalf("done task actions = %v", got)
	}
}

func TestDeriveDispositions(t *testing.T) {
	questions := []Question{
		{ID: "q1", CardSlug: "a", Text: "Defer me?"},
		{ID: "q2", CardSlug: "a", Text: "Delegate me?", Blocking: true},
	}
	finding := drift.Finding{Type: drift.TypeCommitWithoutTask, Severity: drift.SeverityWarning, Summary: "commit", SubjectIDs: []string{"ev1"}}
	kept := []DeployLink{{NodeID: "n1", NodePath: "app/web", EnvironmentID: "env-prod", Environment: "production", Provider: "vercel"}}
	t0 := time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)
	dispositions := []Disposition{
		{Key: "decision:q1", Action: ActionDefer, CreatedAt: t0},
		{Key: "decision:q2", Action: ActionDefer, CreatedAt: t0},
		{Key: "decision:q2", Action: ActionDelegate, CreatedAt: t0.Add(time.Minute)},
		{Key: DriftKey(finding), Action: ActionIgnore, CreatedAt: t0},
	}

	result := Derive(questions, []drift.Finding{finding}, kept, dispositions)

	if len(result.Items) != 2 {
		t.Fatalf("items = %+v, want the setup item and the deferred question", result.Items)
	}
	if result.Items[0].Kind != KindSetup || result.Items[1].State != StateDeferred {
		t.Fatalf("items = %+v: open first, deferred last", result.Items)
	}
	if result.Open() != 1 || result.Blocking() != 0 {
		t.Fatalf("open=%d blocking=%d, want 1 and 0 (deferred and routed not counted)", result.Open(), result.Blocking())
	}
	if len(result.Routed) != 1 || result.Routed[0].Action != ActionDelegate || result.Routed[0].Item.Title != "Delegate me?" {
		t.Fatalf("routed = %+v, want the delegated question (latest disposition wins)", result.Routed)
	}
	if _, ok := result.Find(result.Routed[0].Item.ID); !ok {
		t.Fatal("Find should also match routed items")
	}
}

func TestDriftKeyStableAndSensitive(t *testing.T) {
	a := drift.Finding{Type: drift.TypeCommitWithoutTask, SubjectIDs: []string{"b", "a"}, Details: map[string]string{"statement": "dep x"}}
	b := drift.Finding{Type: drift.TypeCommitWithoutTask, SubjectIDs: []string{"a", "b"}, Details: map[string]string{"statement": "dep x"}, Summary: "other text"}
	if DriftKey(a) != DriftKey(b) {
		t.Fatal("key must not depend on subject order or summary")
	}
	c := b
	c.Details = map[string]string{"statement": "dep y"}
	if DriftKey(b) == DriftKey(c) {
		t.Fatal("a changed finding must be a new key")
	}
	if id := ShortID(DriftKey(a)); len(id) != 9 || id[0] != 'i' {
		t.Fatalf("short id = %q", id)
	}
}

func TestDeriveUnconnectedDeploy(t *testing.T) {
	links := []DeployLink{
		{NodeID: "n1", NodePath: "app/web", EnvironmentID: "env-prod", Environment: "production", Provider: "vercel", Resource: "web"},
		{NodeID: "n1", NodePath: "app/web", EnvironmentID: "env-local", Environment: "local", Provider: "docker", Resource: "api"},
		{NodeID: "n2", NodePath: "app/api", EnvironmentID: "env-prod", Environment: "production", Provider: "aws", Resource: "fn"},
	}
	connections := []ProviderConnection{
		{ProviderID: "docker", Status: ProviderStatusConnected},
		{ProviderID: "aws", EnvironmentID: "env-local", Status: ProviderStatusConnected},
		{ProviderID: "vercel", Status: "ready"},
	}
	pending := UnconnectedDeploys(links, connections)
	if len(pending) != 2 {
		t.Fatalf("pending = %+v, want vercel and aws (other environment, and ready is not connected)", pending)
	}
	result := Derive(nil, nil, pending, nil)
	if len(result.Items) != 2 || result.Items[0].Kind != KindSetup || result.Items[1].Kind != KindSetup {
		t.Fatalf("items = %+v", result.Items)
	}
	key := DeployKey("n1", "env-prod")
	if result.Items[0].Key != key || result.Items[0].Key != DeployKey("n1", "env-prod") {
		t.Fatalf("key = %q", result.Items[0].Key)
	}
	if result.Items[0].Title != "Connect vercel for app/web in production" || result.Items[0].Detail != "vercel" || result.Items[0].Where != "app/web" {
		t.Fatalf("item = %+v", result.Items[0])
	}
	again := Derive(nil, nil, pending, nil)
	if again.Items[0].Key != result.Items[0].Key || again.Items[0].ID != result.Items[0].ID {
		t.Fatal("deploy item key must be stable")
	}
	hidden := Derive(nil, nil, pending, []Disposition{{Key: key, Action: ActionIgnore, CreatedAt: time.Now().UTC()}})
	if len(hidden.Items) != 1 || hidden.Items[0].Key == key {
		t.Fatalf("dismiss should hide the vercel item: %+v", hidden.Items)
	}
	// A connection for the same provider with no environment covers every environment.
	covered := UnconnectedDeploys(links, []ProviderConnection{{ProviderID: "vercel", Status: ProviderStatusConnected}})
	for _, link := range covered {
		if link.Provider == "vercel" {
			t.Fatalf("global connection should cover vercel: %+v", covered)
		}
	}
}

func TestParseActionAndStatusLines(t *testing.T) {
	if action, err := ParseAction("reopen"); err != nil || action != ActionReopen {
		t.Fatalf("ParseAction(reopen) = %q, %v", action, err)
	}
	if _, err := ParseAction("fix-code"); err == nil {
		t.Fatal("fix-code is retired")
	}
	if _, err := ParseAction("approve"); err == nil {
		t.Fatal("unknown action should fail")
	}
	if ValidAction(Item{Kind: KindSetup, Actions: KindActions[KindSetup]}, ActionDecide) {
		t.Fatal("setup items do not take decide")
	}

	result := Derive(
		[]Question{{ID: "q1", CardSlug: "a", Text: "Pick one?", Blocking: true}, {ID: "q2", CardSlug: "a", Text: "Later?"}},
		nil, nil,
		[]Disposition{{Key: "decision:q2", Action: ActionDelegate}},
	)
	lines := StatusLines(result)
	for _, want := range []string{"inbox: 1 open (1 blocking)\n", "decision Pick one?  a\n", "delegated: Later?  a: choose a default and record it with `? Later? -> answer`\n"} {
		if !strings.Contains(lines, want) {
			t.Fatalf("status lines missing %q:\n%s", want, lines)
		}
	}
	if StatusLines(Result{}) != "" {
		t.Fatal("an empty inbox prints nothing in status")
	}
	if got := List(Result{}); got != "inbox empty\n" {
		t.Fatalf("empty list = %q", got)
	}
}
