package polter

import (
	"errors"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/canvas"
	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

func briefFixture() BriefInput {
	system := structure.Node{ID: "s", Path: "app", Level: structure.LevelDomain, Title: "App", Status: structure.NodeActive}
	api := structure.Node{ID: "c", ParentID: "s", Path: "app/api", Level: structure.LevelComponent, Title: "API", Status: structure.NodeActive,
		Kind: "service", Tech: "Go", Folder: "backend", Decisions: []string{"Decision-0002"}}
	db := structure.Node{ID: "d", ParentID: "s", Path: "app/db", Level: structure.LevelComponent, Title: "DB", Status: structure.NodeActive}
	card := work.Card{
		ID: "card-1", Slug: "login", Title: "Login", Stage: work.StageBuild, Status: work.CardActive, Under: "app/api",
		Intent: "Sign people in.", Decisions: []string{"Decision-0001"}, MilestoneID: "m1", Milestone: "beta",
		Tasks: []work.Task{
			{Number: 1, Title: "Session table", State: work.TaskDone},
			{Number: 2, Title: "Login route", State: work.TaskOpen, Claim: &work.Claim{Holder: "codex"}},
		},
		Questions: []work.Question{
			{Text: "Remember me?", State: work.QuestionOpen},
			{Text: "Which hash?", Blocking: true, State: work.QuestionOpen, Options: []string{"argon2", "bcrypt"}},
		},
		Invariants: []work.Invariant{{Text: "Rate limit attempts", State: work.InvariantActive}},
		Handoffs:   []work.Handoff{{Agent: "codex", Branch: "feat/login", Next: "wire the route"}},
	}
	return BriefInput{
		Snapshot: work.Snapshot{
			Nodes: []structure.Node{system, api, db},
			Cards: []work.Card{card, {Slug: "old", Title: "Old", Stage: work.StageDelivered, Status: work.CardActive, Under: "app/api"}},
			Decisions: []decision.Decision{
				{ID: "k1", Title: "Decision 0001: Sessions in cookies", Status: "active", Body: "## Decision\nSessions live in signed cookies. Tokens are not used."},
				{ID: "k2", Title: "Decision 0002: One API process", Status: "proposed", Body: "One process serves the API."},
				{ID: "k3", Title: "Decision 0003: Postgres", Status: "superseded", Scopes: []string{"app"}},
				{ID: "k4", Title: "Decision 0004: Audit writes", Status: "challenged", Scopes: []string{"app"}, Body: "Every write is audited.", Meta: decision.Meta{StatusReason: "too slow"}},
				{ID: "k5", Title: "Local first", Status: "active"},
				// Any one context on the target's path picks a decision.
				{ID: "k6", Title: "Decision 0006: Cache reads", Status: "active", Scopes: []string{"app/db", "app/api"}, Body: "Reads go through a cache."},
				{ID: "k7", Title: "Decision 0007: Batch jobs", Status: "active", Scopes: []string{"app/db"}},
			},
			Rules: []work.Rule{
				{ID: "r1", Statement: "No secrets in logs", Scopes: []string{"app"}},
				{ID: "r2", Statement: "Handlers return typed errors", Scopes: []string{"app/api"}},
				{ID: "r3", Statement: "Migrations are reversible", Scopes: []string{"app/db"}},
				{ID: "r4", Statement: "Never commit credentials"},
			},
			Facts: []work.Fact{
				{Fact: canon.Fact{Statement: "The API runs on port 8080.", TruthClass: canon.TruthInferred}, Scopes: []string{"app/api", "app/db"}},
				{Fact: canon.Fact{Statement: "The app ships weekly.", TruthClass: canon.TruthDeclared}, Scopes: []string{"app"}},
				{Fact: canon.Fact{Statement: "Project-wide fact.", TruthClass: canon.TruthDeclared}},
			},
			Milestones: []work.Milestone{{ID: "m1", Slug: "beta", Name: "Beta", State: work.MilestoneActive, TargetDate: "2026-12-01", Goal: "Outside users sign in.", ExitCriteria: []string{"10 users", "no P1"}}},
		},
		Docs: []Doc{
			{ID: "doc-1", Title: "API runbook", DocType: "doc", ScopeNodeIDs: []string{"d", "c"}},
			{ID: "doc-2", Title: "Style guide", DocType: "doc", ScopeNodeIDs: []string{"s"}},
			{ID: "doc-3", Title: "Unrelated", ScopeNodeIDs: []string{"d"}},
		},
		Canvases: []canvas.Canvas{{Name: "Architecture", Graph: canvas.Graph{
			Nodes: []canvas.Node{{ID: "n1", Label: "API", Ref: &canvas.Ref{Kind: canvas.RefNode, ID: "c"}}, {ID: "n2", Label: "Postgres"}},
			Edges: []canvas.Edge{{From: "n1", To: "n2", Kind: canvas.EdgeReads}},
		}}},
	}
}

func TestBriefCardOrdersBlocksByPriority(t *testing.T) {
	text, err := Brief(briefFixture(), "login", 0)
	if err != nil {
		t.Fatal(err)
	}
	want := `## login: Login
stage: build · under: app/api · milestone: beta · claim: codex
kind: service · tech: Go · path: backend
Sign people in.

Rules:
- Handlers return typed errors (from app/api)
- No secrets in logs (from app)
- Never commit credentials (whole project)

- [ ] T2 Login route
? Which hash? [blocking] (argon2 | bcrypt)
? Remember me?
handoff codex on feat/login: next: wire the route

! Rate limit attempts

Decisions:
- Decision-0001 [active] Sessions in cookies: Sessions live in signed cookies.
- Decision-0002 [proposed] One API process: One process serves the API.
- Decision-0006 [active] Cache reads: Reads go through a cache.
- Decision-0004 [challenged] Audit writes: Every write is audited. (challenged: too slow)
principles: Local first

Facts:
- inferred: The API runs on port 8080.
- declared: The app ships weekly.

milestone beta: Beta · active · target 2026-12-01
goal: Outside users sign in.
exit: 10 users; no P1

Canvas:
- Architecture: API --reads--> Postgres

Docs:
- API runbook
- Style guide
`
	if text != want {
		t.Fatalf("brief:\n%s\nwant:\n%s", text, want)
	}
}

func TestBriefNodeListsOpenCardsAndBlockingQuestions(t *testing.T) {
	text, err := Brief(briefFixture(), "app/api", 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"# app/api: API\nlevel: component · kind: service · tech: Go · path: backend\n",
		"\nRules:\n- Handlers return typed errors\n- No secrets in logs (from app)\n- Never commit credentials (whole project)\n",
		`- login  build  "Login"  2 open?`,
		"? Which hash? [blocking] (argon2 | bcrypt) — login",
		"- Decision-0002 [proposed]",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q in:\n%s", want, text)
		}
	}
	for _, unwanted := range []string{`"Old"`, "Remember me?", "milestone beta", "Decision-0001", "Migrations are reversible"} {
		if strings.Contains(text, unwanted) {
			t.Fatalf("unexpected %q in:\n%s", unwanted, text)
		}
	}
}

func TestBriefIsDeterministicAndReportsUnknownTargets(t *testing.T) {
	first, _ := Brief(briefFixture(), "login", 0)
	second, _ := Brief(briefFixture(), "login", 0)
	if first != second {
		t.Fatal("brief changed between two reads of the same graph")
	}
	if _, err := Brief(briefFixture(), "backend/api/main.go", 0); !errors.Is(err, ErrUnknownBriefTarget) {
		t.Fatalf("err = %v", err)
	}
}

func TestSearchListsEveryKindOneLineEach(t *testing.T) {
	in := briefFixture()
	in.Docs[0].Body = "Restart the API with make restart when the port is stuck."
	text := Search(in, "API", 0)
	for _, want := range []string{
		`node app/api  component  "API"`,
		`decision Decision-0002  proposed  "One API process"`,
		`doc doc-1  "API runbook": Restart the API with make restart when the port is stuck.`,
		"fact inferred: The API runs on port 8080.",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q in:\n%s", want, text)
		}
	}
	if got := Search(in, "api port", 0); !strings.Contains(got, "fact inferred") || strings.Contains(got, "node app/api") {
		t.Fatalf("every term must match: %s", got)
	}
	if got := Search(in, "nothing-like-this", 0); got != "no matches for \"nothing-like-this\"\n" {
		t.Fatalf("empty search = %q", got)
	}
}

func TestBriefNeverCutsRules(t *testing.T) {
	text, err := Brief(briefFixture(), "login", 40)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"## login: Login", "Rules:\n", "- Never commit credentials (whole project)\n", "more lines cut to fit budget:40"} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q in a tight brief:\n%s", want, text)
		}
	}
	if strings.Contains(text, "Canvas:") {
		t.Fatalf("the tail should be cut:\n%s", text)
	}
}

func TestSearchFindsRules(t *testing.T) {
	if got := Search(briefFixture(), "credentials", 0); !strings.Contains(got, "rule r4: Never commit credentials") {
		t.Fatalf("search = %q", got)
	}
}
