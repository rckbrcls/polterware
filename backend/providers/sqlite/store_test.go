package sqlite_test

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/domains/projects"
	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/providers/demoseed"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func newStore(t *testing.T) *storepkg.Store {
	t.Helper()
	store, err := storepkg.New(filepath.Join(t.TempDir(), "store.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func seededStore(t *testing.T) *storepkg.Store {
	t.Helper()
	store := newStore(t)
	if err := demoseed.Defaults(store); err != nil {
		t.Fatal(err)
	}
	return store
}

func TestStorePersistsAcrossReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "reopen.db")
	first, err := storepkg.New(path)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	project := projects.Project{ID: "proj-a", Name: "Alpha", RootPath: "/work/alpha", CreatedAt: now, UpdatedAt: now}
	if err := first.SaveProject(project); err != nil {
		t.Fatal(err)
	}
	if err := first.SetHookSwitch("session-start", false); err != nil {
		t.Fatal(err)
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}

	second, err := storepkg.New(path)
	if err != nil {
		t.Fatalf("reopen failed: %v", err)
	}
	defer second.Close()
	got, err := second.GetProject("proj-a")
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Alpha" || got.RootPath != "/work/alpha" || got.Status != projects.StatusActive {
		t.Fatalf("project = %+v", got)
	}
	switches, err := second.HookSwitches()
	if err != nil || switches["session-start"] {
		t.Fatalf("hook switch lost across reopen: %v, %v", switches, err)
	}
}

func TestProjectArchiveHidesFromDefaultList(t *testing.T) {
	store := newStore(t)
	now := time.Now().UTC()
	for _, id := range []string{"proj-a", "proj-b"} {
		if err := store.SaveProject(projects.Project{ID: id, Name: id, RootPath: "/" + id, CreatedAt: now, UpdatedAt: now}); err != nil {
			t.Fatal(err)
		}
	}
	archived, err := store.ArchiveProject("proj-a")
	if err != nil {
		t.Fatal(err)
	}
	if archived.Status != projects.StatusArchived || archived.ArchivedAt.IsZero() {
		t.Fatalf("archived = %+v", archived)
	}
	active, err := store.ListProjects(false)
	if err != nil || len(active) != 1 || active[0].ID != "proj-b" {
		t.Fatalf("active = %+v, err = %v", active, err)
	}
	all, err := store.ListProjects(true)
	if err != nil || len(all) != 2 {
		t.Fatalf("all = %+v, err = %v", all, err)
	}
	if _, err := store.ArchiveProject("missing"); err == nil {
		t.Fatal("archiving an unknown project must fail")
	}
}

func TestGetProjectMissingReturnsNoRows(t *testing.T) {
	if _, err := newStore(t).GetProject("nope"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("err = %v; want sql.ErrNoRows", err)
	}
}

func TestHookSwitchesDefaultOnAndRoundTrip(t *testing.T) {
	store := newStore(t)
	switches, err := store.HookSwitches()
	if err != nil || len(switches) != 0 {
		t.Fatalf("fresh store must have no rows (hooks default on): %v, %v", switches, err)
	}
	if err := store.SetHookSwitch("session-start", false); err != nil {
		t.Fatal(err)
	}
	if err := store.SetHookSwitch("stop", true); err != nil {
		t.Fatal(err)
	}
	// Updating an existing switch must not create a second row.
	if err := store.SetHookSwitch("session-start", true); err != nil {
		t.Fatal(err)
	}
	if err := store.SetHookSwitch("session-start", false); err != nil {
		t.Fatal(err)
	}
	switches, err = store.HookSwitches()
	if err != nil {
		t.Fatal(err)
	}
	if len(switches) != 2 || switches["session-start"] || !switches["stop"] {
		t.Fatalf("switches = %v", switches)
	}
}

func TestProjectReposCRUD(t *testing.T) {
	store := seededStore(t)
	now := time.Now().UTC().Truncate(time.Second)
	repo := projects.Repository{ID: "repo-api", ProjectID: demoseed.ProjectID, Name: "api", Path: "/work/api", CreatedAt: now, UpdatedAt: now}
	other := projects.Repository{ID: "repo-web", ProjectID: demoseed.ProjectID, Name: "web", Path: "/work/web", CreatedAt: now, UpdatedAt: now}
	for _, item := range []projects.Repository{other, repo} {
		if err := store.SaveProjectRepo(item); err != nil {
			t.Fatal(err)
		}
	}
	listed, err := store.ListProjectRepos(demoseed.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 2 || listed[0].Name != "api" || listed[1].Name != "web" {
		t.Fatalf("repos must be ordered by name: %+v", listed)
	}

	repo.Path = "/moved/api"
	repo.UpdatedAt = now.Add(time.Minute)
	if err := store.SaveProjectRepo(repo); err != nil {
		t.Fatal(err)
	}
	listed, _ = store.ListProjectRepos(demoseed.ProjectID)
	if len(listed) != 2 || listed[0].Path != "/moved/api" {
		t.Fatalf("upsert did not update the path: %+v", listed)
	}

	if err := store.DeleteProjectRepo(demoseed.ProjectID, "api"); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteProjectRepo(demoseed.ProjectID, "api"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("deleting twice: err = %v; want sql.ErrNoRows", err)
	}
	listed, _ = store.ListProjectRepos(demoseed.ProjectID)
	if len(listed) != 1 || listed[0].Name != "web" {
		t.Fatalf("after delete: %+v", listed)
	}
}

func TestProjectReposRejectUnknownProject(t *testing.T) {
	store := newStore(t)
	now := time.Now().UTC()
	err := store.SaveProjectRepo(projects.Repository{ID: "r", ProjectID: "ghost", Name: "api", Path: "/x", CreatedAt: now, UpdatedAt: now})
	if err == nil {
		t.Fatal("foreign keys must reject a repo for an unknown project")
	}
}

func TestAgentRunLifecycle(t *testing.T) {
	store := seededStore(t)
	run, err := agentrun.Start(demoseed.ProjectID, "Ship the build", "codex", time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if err := store.CreateAgentRun(run); err != nil {
		t.Fatal(err)
	}
	got, err := store.GetAgentRun(run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != agentrun.StatusOpen || got.Task != "Ship the build" || got.AgentLabel != "codex" || got.CompletedAt != nil {
		t.Fatalf("run = %+v", got)
	}

	done, err := agentrun.Complete(got, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpdateAgentRun(done); err != nil {
		t.Fatal(err)
	}
	got, _ = store.GetAgentRun(run.ID)
	if got.Status != agentrun.StatusCompleted || got.CompletedAt == nil {
		t.Fatalf("completed run = %+v", got)
	}
	if _, err := agentrun.Complete(got, time.Now().UTC()); err == nil {
		t.Fatal("a completed run must not complete again")
	}
}

func TestAgentRunListIsScopedToProject(t *testing.T) {
	store := seededStore(t)
	before, err := store.ListAgentRuns(demoseed.ProjectID, 50)
	if err != nil {
		t.Fatal(err)
	}
	run, _ := agentrun.Start(demoseed.ProjectID, "One", "claude", time.Now().UTC())
	if err := store.CreateAgentRun(run); err != nil {
		t.Fatal(err)
	}
	after, _ := store.ListAgentRuns(demoseed.ProjectID, 50)
	if len(after) != len(before)+1 {
		t.Fatalf("runs before %d, after %d", len(before), len(after))
	}
	empty, err := store.ListAgentRuns(demoseed.EmptyProjectID, 50)
	if err != nil || len(empty) != 0 {
		t.Fatalf("other project must see no runs: %v, %v", empty, err)
	}
	limited, _ := store.ListAgentRuns(demoseed.ProjectID, 1)
	if len(limited) > 1 {
		t.Fatalf("limit ignored: %d rows", len(limited))
	}
}

func TestAgentRunStepsAreOrderedAndValidated(t *testing.T) {
	store := seededStore(t)
	run, _ := agentrun.Start(demoseed.ProjectID, "Audit", "codex", time.Now().UTC())
	if err := store.CreateAgentRun(run); err != nil {
		t.Fatal(err)
	}
	base := time.Now().UTC()
	for i, kind := range []string{agentrun.KindContext, agentrun.KindChange, agentrun.KindEvidence} {
		step := agentrun.Step{AgentRunID: run.ID, Kind: kind, Summary: kind, CreatedAt: base.Add(time.Duration(i) * time.Second)}
		if err := store.AppendAgentRunStep(step); err != nil {
			t.Fatal(err)
		}
	}
	steps, err := store.ListAgentRunSteps(run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(steps) != 3 || steps[0].Kind != agentrun.KindContext || steps[2].Kind != agentrun.KindEvidence {
		t.Fatalf("steps must come back oldest first: %+v", steps)
	}
	if steps[0].PayloadJSON != "{}" {
		t.Fatalf("empty payload must default to {}, got %q", steps[0].PayloadJSON)
	}
	record, err := store.GetAgentRunRecord(run.ID)
	if err != nil || len(record.Steps) != 3 || record.Run.ID != run.ID {
		t.Fatalf("record = %+v, err = %v", record, err)
	}
	if err := store.AppendAgentRunStep(agentrun.Step{AgentRunID: run.ID, Kind: "bogus"}); err == nil {
		t.Fatal("unknown step kind must be rejected")
	}
	if err := store.AppendAgentRunStep(agentrun.Step{AgentRunID: "missing", Kind: agentrun.KindChange}); err == nil {
		t.Fatal("a step for an unknown run must be rejected")
	}
}

func TestGetAgentRunUnknown(t *testing.T) {
	if _, err := newStore(t).GetAgentRun("missing"); err == nil {
		t.Fatal("want error for an unknown run")
	}
}

func TestReplaceCommitLinksReplacesAndFilters(t *testing.T) {
	store := seededStore(t)
	var evidenceID, taskID string
	if err := store.DB.QueryRow(`SELECT id FROM canon_evidence WHERE project_id=? LIMIT 1`, demoseed.ProjectID).Scan(&evidenceID); err != nil {
		t.Skipf("seed has no evidence row: %v", err)
	}
	if err := store.DB.QueryRow(`SELECT t.id FROM work_tasks t JOIN work_cards c ON c.id=t.card_id WHERE c.project_id=? LIMIT 1`, demoseed.ProjectID).Scan(&taskID); err != nil {
		t.Skipf("seed has no work task: %v", err)
	}
	now := time.Now().UTC()
	links := []work.CommitLink{
		{TaskID: taskID, Method: work.LinkExplicit},
		{TaskID: taskID, Method: work.LinkExplicit}, // duplicate is dropped
		{TaskID: taskID, Method: work.LinkSuggested},
		{TaskID: "", Method: work.LinkExplicit}, // empty task is dropped
		{TaskID: taskID, Method: "made-up"},     // unknown method is dropped
	}
	if err := store.ReplaceCommitLinks(demoseed.ProjectID, evidenceID, links, now); err != nil {
		t.Fatal(err)
	}
	stored, err := store.ListCommitLinks(demoseed.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored) != 2 {
		t.Fatalf("want explicit + suggested only, got %+v", stored)
	}

	if err := store.ReplaceCommitLinks(demoseed.ProjectID, evidenceID, nil, now); err != nil {
		t.Fatal(err)
	}
	stored, _ = store.ListCommitLinks(demoseed.ProjectID)
	if len(stored) != 0 {
		t.Fatalf("replacement with no links must clear them: %+v", stored)
	}
}

func TestSaveAndListKnowledge(t *testing.T) {
	store := seededStore(t)
	decisions, err := store.ListKnowledge(demoseed.ProjectID, "decision")
	if err != nil {
		t.Fatal(err)
	}
	if len(decisions) == 0 {
		t.Fatal("seed must provide Decisions")
	}
	for _, item := range decisions {
		if item.Kind != "decision" || item.ProjectID != demoseed.ProjectID {
			t.Fatalf("filter leaked %+v", item)
		}
	}
	first := decisions[0]
	if got, err := store.GetKnowledge(first.ID); err != nil || got.Title != first.Title {
		t.Fatalf("GetKnowledge = %+v, %v", got, err)
	}
	if err := store.DeleteKnowledge(first.ID); !errors.Is(err, knowledge.ErrDecisionArchive) {
		t.Fatalf("delete of a decision = %v, want ErrDecisionArchive", err)
	}
	if _, err := store.SetKnowledgeArchived(first.ID, true, time.Now()); !errors.Is(err, knowledge.ErrDecisionArchive) {
		t.Fatalf("archive of a decision = %v, want ErrDecisionArchive", err)
	}
}

func TestKnowledgeArchiveRestoreAndDelete(t *testing.T) {
	store := seededStore(t)
	items, err := store.ListKnowledge(demoseed.ProjectID, knowledge.KindDoc)
	if err != nil || len(items) == 0 {
		t.Fatalf("seed evidence = %d err=%v", len(items), err)
	}
	item := items[0]
	if err := store.DeleteKnowledge(item.ID); !errors.Is(err, knowledge.ErrNotArchived) {
		t.Fatalf("delete of an active item = %v, want ErrNotArchived", err)
	}
	archived, err := store.SetKnowledgeArchived(item.ID, true, time.Now())
	if err != nil || !archived.Archived() {
		t.Fatalf("archive = %+v err=%v", archived, err)
	}
	active, err := store.ListKnowledge(demoseed.ProjectID, knowledge.KindDoc)
	if err != nil {
		t.Fatal(err)
	}
	for _, other := range active {
		if other.ID == item.ID {
			t.Fatal("archived item must leave the active list")
		}
	}
	if listed, err := store.ListArchivedKnowledge(demoseed.ProjectID, ""); err != nil || len(listed) != 1 || listed[0].ID != item.ID {
		t.Fatalf("archived list = %+v err=%v", listed, err)
	}
	if hits, err := store.SearchKnowledge(demoseed.ProjectID, item.Title, "", 20); err != nil {
		t.Fatal(err)
	} else {
		for _, hit := range hits {
			if hit.Item.ID == item.ID {
				t.Fatal("archived item must leave search")
			}
		}
	}
	// An import that rewrites an archived row keeps it out of search.
	if err := store.SaveKnowledge(archived); err != nil {
		t.Fatal(err)
	}
	var indexed int
	if err := store.DB.QueryRow(`SELECT COUNT(1) FROM knowledge_fts WHERE knowledge_id=?`, item.ID).Scan(&indexed); err != nil || indexed != 0 {
		t.Fatalf("archived item indexed=%d err=%v", indexed, err)
	}
	restored, err := store.SetKnowledgeArchived(item.ID, false, time.Now())
	if err != nil || restored.Archived() {
		t.Fatalf("restore = %+v err=%v", restored, err)
	}
	if err := store.DB.QueryRow(`SELECT COUNT(1) FROM knowledge_fts WHERE knowledge_id=?`, item.ID).Scan(&indexed); err != nil || indexed != 1 {
		t.Fatalf("restored item indexed=%d err=%v", indexed, err)
	}
	if _, err := store.SetKnowledgeArchived(item.ID, true, time.Now()); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteKnowledge(item.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetKnowledge(item.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("deleted item get = %v", err)
	}
}

func TestStoreHealthStartsHealthy(t *testing.T) {
	quarantined, _, err := newStore(t).StoreHealth()
	if err != nil || quarantined {
		t.Fatalf("quarantined = %v, err = %v", quarantined, err)
	}
}

func TestResetClearsProjects(t *testing.T) {
	store := seededStore(t)
	if err := store.Reset(); err != nil {
		t.Fatal(err)
	}
	all, err := store.ListProjects(true)
	if err != nil || len(all) != 0 {
		t.Fatalf("projects after reset: %v, %v", all, err)
	}
}
