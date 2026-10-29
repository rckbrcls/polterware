package polter

import (
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

func TestDecodeNodeRepoAndFolder(t *testing.T) {
	text := `---
polter: 1
---
# auth: Auth
level: component · under: core · repo: api · path: ./src/auth/

## login: Login
- [ ] T1 Callback endpoint [repo: api] ` + "`src/auth/*`" + `
- [ ] T2 Login page ` + "`web:src/login/*`" + `
- [ ] T3 Docs
`
	doc, diags := Decode(text)
	if HasErrors(diags) {
		t.Fatalf("decode: %+v", diags)
	}
	node := doc.Nodes[0]
	if node.Path != "auth" {
		t.Fatalf("node identity must stay the heading path: %q", node.Path)
	}
	if repo, _ := node.MetaValue("repo"); repo != "api" {
		t.Fatalf("repo = %q", repo)
	}
	if folder, _ := node.MetaValue("path"); folder != "src/auth" {
		t.Fatalf("folder = %q", folder)
	}
	tasks := doc.Cards[0].Tasks
	if tasks[0].Repo != "api" || tasks[0].Scope != "src/auth/*" || tasks[0].Title != "Callback endpoint" {
		t.Fatalf("T1 = %+v", tasks[0])
	}
	if tasks[1].Repo != "web" || tasks[1].Scope != "src/login/*" {
		t.Fatalf("T2 = %+v", tasks[1])
	}
	if tasks[2].Repo != "" || tasks[2].Scope != "" {
		t.Fatalf("T3 = %+v", tasks[2])
	}

	formatted := Format(doc)
	for _, want := range []string{"repo: api · path: src/auth", "Callback endpoint [repo: api] `src/auth/*`", "Login page [repo: web] `src/login/*`"} {
		if !strings.Contains(formatted, want) {
			t.Fatalf("format missing %q:\n%s", want, formatted)
		}
	}
	round, diags := Decode(formatted)
	if HasErrors(diags) || Format(round) != formatted {
		t.Fatalf("round trip: %+v\n%s", diags, Format(round))
	}
}

func TestDecodeRejectsBadRepoAndFolder(t *testing.T) {
	text := "---\npolter: 1\n---\n# auth: Auth\nlevel: system · path: ../outside\n\n## login: Login\n- [ ] Mixed [repo: api] `web:src/*`\n"
	_, diags := Decode(text)
	if !hasDiag(diags, 5, "invalid path") {
		t.Fatalf("folder: %+v", diags)
	}
	if !hasDiag(diags, 8, "differ") {
		t.Fatalf("mixed repos: %+v", diags)
	}
}

func TestLintUnknownRepo(t *testing.T) {
	text := "---\npolter: 1\n---\n# api: API\nlevel: system · repo: api\n\n## login: Login\n- [ ] Callback [repo: web]\n- [ ] Root task `src/*`\n"
	_, diags := Lint(text, &References{Repos: []string{"api"}})
	if hasDiag(diags, 5, "unknown repo") {
		t.Fatalf("api is registered: %+v", diags)
	}
	if !hasDiag(diags, 8, `unknown repo "web"`) {
		t.Fatalf("web is not registered: %+v", diags)
	}
	if hasDiag(diags, 9, "unknown repo") {
		t.Fatalf("no repo is the project root: %+v", diags)
	}
}

func TestPlanNodeRepoAndFolder(t *testing.T) {
	snapshot := work.Snapshot{ProjectID: "p1", Repos: []string{"api"}}
	doc := mustDecode(t, "---\npolter: 1\n---\n# api: API\nlevel: system · repo: api · path: services/api\n")
	ops, diags := Plan(doc, snapshot)
	if HasErrors(diags) || len(ops) != 1 {
		t.Fatalf("create: ops=%+v diags=%+v", ops, diags)
	}
	fields := ops[0].Fields
	if fields["path"] != "api" || fields["repo"] != "api" || fields["folder"] != "services/api" {
		t.Fatalf("fields = %+v", fields)
	}

	snapshot.Nodes = []structure.Node{{
		ID: "n1", Path: "api", Slug: "api", Title: "API", Level: structure.LevelSystem, Status: structure.NodeActive,
		Repo: "api", Folder: "services/api",
	}}
	// Absent keys leave the stored values; an empty repo: moves to the root.
	if ops, diags = Plan(mustDecode(t, "---\npolter: 1\n---\n# api: API\n"), snapshot); HasErrors(diags) || len(ops) != 0 {
		t.Fatalf("no-op: ops=%+v diags=%+v", ops, diags)
	}
	ops, diags = Plan(mustDecode(t, "---\npolter: 1\n---\n# api: API\nrepo:\n"), snapshot)
	if HasErrors(diags) || len(ops) != 1 || ops[0].Fields["repo"] != "" || ops[0].Before["repo"] != "api" {
		t.Fatalf("clear repo: ops=%+v diags=%+v", ops, diags)
	}
	if _, diags = Plan(mustDecode(t, "---\npolter: 1\n---\n# api: API\nrepo: web\n"), snapshot); !HasErrors(diags) {
		t.Fatalf("unknown repo should fail the plan")
	}
}

func TestBriefShowsCheckout(t *testing.T) {
	nodes := []structure.Node{{
		ID: "c", Path: "auth", Level: structure.LevelComponent, Title: "Auth", Status: structure.NodeActive,
		Repo: "api", Folder: "src/auth",
	}}
	text, err := Brief(BriefInput{Snapshot: work.Snapshot{Nodes: nodes}}, "auth", 800)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(text, "# auth: Auth\nlevel: component · repo: api · path: src/auth\n") {
		t.Fatalf("brief = %s", text)
	}
}

func TestClaimScopesAcrossRepos(t *testing.T) {
	snapshot := work.Snapshot{ProjectID: "p1", Repos: []string{"api", "web"}, Cards: []work.Card{
		{
			ID: "c1", Slug: "login", Title: "Login", Stage: work.StageBuild, Status: work.CardActive,
			Tasks: []work.Task{
				{ID: "t1", CardID: "c1", Number: 1, Title: "Callback", State: work.TaskOpen, Repo: "api", Scope: "src/auth/*"},
				{ID: "t2", CardID: "c1", Number: 2, Title: "Page", State: work.TaskOpen, Repo: "web", Scope: "src/auth/*"},
				{ID: "t3", CardID: "c1", Number: 3, Title: "Root", State: work.TaskOpen, Scope: "src/auth/*"},
			},
		},
		{
			ID: "c2", Slug: "session", Title: "Session", Stage: work.StageBuild, Status: work.CardActive,
			Tasks: []work.Task{
				{ID: "u1", CardID: "c2", Number: 1, Title: "Tokens", State: work.TaskOpen, Repo: "api", Scope: "src/**",
					Claim: &work.Claim{ID: "k1", ProjectID: "p1", TaskID: "u1", Holder: "claude", Scope: "api:src/**"}},
			},
		},
	}}

	// Same repository, overlapping globs: refused.
	_, diags := PlanAs(coordDoc(t, "## login\nclaim: T1\n"), snapshot, "codex")
	if !HasErrors(diags) || !strings.Contains(diags[0].Message, "scope api:src/auth/* overlaps session T1 held by claude (api:src/**)") {
		t.Fatalf("same repo: %+v", diags)
	}
	// Same glob in another checkout, or at the project root: allowed.
	ops, diags := PlanAs(coordDoc(t, "## login\nclaim: T2\n"), snapshot, "codex")
	if HasErrors(diags) || len(ops) != 1 || ops[0].Fields["scope"] != "web:src/auth/*" {
		t.Fatalf("other repo: ops=%+v diags=%+v", ops, diags)
	}
	ops, diags = PlanAs(coordDoc(t, "## login\nclaim: T3\n"), snapshot, "codex")
	if HasErrors(diags) || len(ops) != 1 || ops[0].Fields["scope"] != "src/auth/*" {
		t.Fatalf("root: ops=%+v diags=%+v", ops, diags)
	}
}
