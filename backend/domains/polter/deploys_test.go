package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

func deployEnvs() []work.NamedEnvironment {
	return []work.NamedEnvironment{
		{ID: "env-local", Name: "local"},
		{ID: "env-prod", Name: "production"},
	}
}

func TestDecodeDeploysAndRejectsProvider(t *testing.T) {
	text := "---\npolter: 1\n---\n# app/web: Web\nlevel: component\nunder: app\ndeploys: production=vercel:web, local=google-cloud:proj\n"
	doc, diags := Decode(text)
	if HasErrors(diags) {
		t.Fatalf("diags = %+v", diags)
	}
	got, ok := doc.Nodes[0].MetaValue("deploys")
	if !ok || got != "production=vercel:web, local=google-cloud:proj" {
		t.Fatalf("deploys = %q ok=%v", got, ok)
	}
	again := Format(doc)
	round, diags := Decode(again)
	if HasErrors(diags) || Format(round) != again {
		t.Fatalf("round trip: %+v\n%s", diags, again)
	}

	_, diags = Decode("---\npolter: 1\n---\n# app/web: Web\nlevel: component\nunder: app\ndeploys: local=heroku:web\n")
	if !hasDiag(diags, 7, `unknown provider "heroku"`) {
		t.Fatalf("diags = %+v", diags)
	}
	_, diags = Decode("---\npolter: 1\n---\n# app/web: Web\ndeploys: local=vercel:web, local=docker:api\n")
	if !hasDiag(diags, 5, "duplicate environment") {
		t.Fatalf("diags = %+v", diags)
	}
	_, diags = Decode("---\npolter: 1\n---\n# app/web: Web\ndeploys: local=docker:-----BEGIN PRIVATE KEY-----\n")
	if !hasDiag(diags, 5, "credential") {
		t.Fatalf("diags = %+v", diags)
	}
}

func TestPlanDeploysRoundTrip(t *testing.T) {
	text := "---\npolter: 1\n---\n# app: App\nlevel: domain\n\n# app/web: Web\nlevel: component\nunder: app\ndeploys: production=vercel:web, local=docker:api\n"
	doc := mustDecode(t, text)
	snapshot := work.Snapshot{Environments: deployEnvs()}
	ops, diags := Plan(doc, snapshot)
	if HasErrors(diags) {
		t.Fatalf("plan: %+v", diags)
	}
	var systemID, webID string
	var deploys []structure.Deployment
	for _, op := range ops {
		if op.Entity != work.EntityNode || op.Kind != work.OpCreate {
			continue
		}
		switch op.Fields["path"] {
		case "app":
			systemID = op.EntityID
		case "app/web":
			webID = op.EntityID
			deploys, _ = op.Fields["deploys"].([]structure.Deployment)
		}
	}
	if systemID == "" || webID == "" || len(deploys) != 2 {
		t.Fatalf("ops = %s", FormatPlan(ops))
	}
	if deploys[0].EnvironmentID != "env-local" || deploys[0].Provider != "docker" || deploys[0].Resource != "api" {
		t.Fatalf("first = %+v", deploys[0])
	}
	if deploys[1].EnvironmentID != "env-prod" || deploys[1].Provider != "vercel" || deploys[1].Resource != "web" || deploys[1].Environment != "production" {
		t.Fatalf("second = %+v", deploys[1])
	}
	if deploys[0].ID == "" || deploys[0].ID == deploys[1].ID {
		t.Fatalf("ids = %q %q", deploys[0].ID, deploys[1].ID)
	}

	snapshot.Nodes = []structure.Node{
		{ID: systemID, Path: "app", Slug: "app", Title: "App", Level: structure.LevelDomain, Status: structure.NodeActive},
		{ID: webID, Path: "app/web", Slug: "web", Title: "Web", Level: structure.LevelComponent, Status: structure.NodeActive, ParentID: systemID, Deploys: deploys},
	}
	if ops, diags = Plan(doc, snapshot); HasErrors(diags) || len(ops) != 0 {
		t.Fatalf("re-plan should be a no-op: %s %+v", FormatPlan(ops), diags)
	}
	// An absent deploys: line leaves the stored links.
	if ops, diags = Plan(mustDecode(t, "---\npolter: 1\n---\n# app/web: Web\n"), snapshot); HasErrors(diags) || len(ops) != 0 {
		t.Fatalf("omit should be a no-op: %s %+v", FormatPlan(ops), diags)
	}
	// A present line replaces the set. Empty clears.
	ops, diags = Plan(mustDecode(t, "---\npolter: 1\n---\n# app/web: Web\ndeploys: production=vercel:web\n"), snapshot)
	if HasErrors(diags) || len(ops) != 1 {
		t.Fatalf("replace: %s %+v", FormatPlan(ops), diags)
	}
	replaced := ops[0].Fields["deploys"].([]structure.Deployment)
	if len(replaced) != 1 || replaced[0].EnvironmentID != "env-prod" || replaced[0].ID != deploys[1].ID {
		t.Fatalf("replaced = %+v", replaced)
	}
	ops, diags = Plan(mustDecode(t, "---\npolter: 1\n---\n# app/web: Web\ndeploys:\n"), snapshot)
	if HasErrors(diags) || len(ops) != 1 {
		t.Fatalf("clear: %s %+v", FormatPlan(ops), diags)
	}
	if cleared := ops[0].Fields["deploys"].([]structure.Deployment); len(cleared) != 0 {
		t.Fatalf("cleared = %+v", cleared)
	}
	if !strings.Contains(FormatPlan(ops), "deploys:") {
		t.Fatalf("plan = %s", FormatPlan(ops))
	}
}

func TestLintUnknownDeployEnvironment(t *testing.T) {
	text := "---\npolter: 1\n---\n# app: App\nlevel: domain\ndeploys: staging=aws:api\n"
	_, diags := Lint(text, &References{Environments: deployEnvs()})
	if !hasDiag(diags, 4, `unknown environment "staging"`) {
		t.Fatalf("diags = %+v", diags)
	}
	ok := "---\npolter: 1\n---\n# app: App\nlevel: domain\ndeploys: local=docker:api\n"
	if _, diags = Lint(ok, &References{Environments: deployEnvs()}); HasErrors(diags) {
		t.Fatalf("known environment: %+v", diags)
	}
}
