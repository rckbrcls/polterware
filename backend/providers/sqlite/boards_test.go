package sqlite_test

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/polterware/polterware/backend/domains/projects"
	"github.com/polterware/polterware/backend/domains/work"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestWorkBoardStoreRoundTrip(t *testing.T) {
	store := newStore(t)
	now := time.Now().UTC()
	for _, id := range []string{"proj-a", "proj-b"} {
		if err := store.SaveProject(projects.Project{ID: id, Name: id, RootPath: "/" + id, CreatedAt: now, UpdatedAt: now}); err != nil {
			t.Fatal(err)
		}
	}
	if boards, err := store.ListWorkBoards("proj-a"); err != nil || len(boards) != 0 {
		t.Fatalf("a project with no rows uses the implicit default board: %+v, %v", boards, err)
	}

	stage, err := store.CreateWorkBoard("proj-a", "run-1", "batch-create-stage", work.Board{Name: " Stage "})
	if err != nil {
		t.Fatal(err)
	}
	if stage.Name != "Stage" || stage.Position != 0 || stage.ConfigJSON != work.DefaultBoardConfig || stage.ProjectID != "proj-a" || stage.CreatedAt.IsZero() {
		t.Fatalf("stage = %+v", stage)
	}
	mine, err := store.CreateWorkBoard("proj-a", "run-1", "batch-create-mine", work.Board{
		Name: "Mine", ConfigJSON: `{"version":1,"group":"owner"}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if mine.Position != 1 {
		t.Fatalf("mine position = %d", mine.Position)
	}
	if _, err := store.CreateWorkBoard("proj-a", "run-1", "batch-dup", work.Board{Name: "Stage"}); !errors.Is(err, work.ErrBoardNameTaken) {
		t.Fatalf("duplicate name: %v", err)
	}
	if _, err := store.CreateWorkBoard("proj-a", "run-1", "batch-blank", work.Board{Name: "  "}); !errors.Is(err, work.ErrBoardNameRequired) {
		t.Fatalf("blank name: %v", err)
	}
	if _, err := store.CreateWorkBoard("proj-a", "run-1", "batch-config", work.Board{Name: "Bad", ConfigJSON: `{}`}); !errors.Is(err, work.ErrBoardConfig) {
		t.Fatalf("bad config: %v", err)
	}
	other, err := store.CreateWorkBoard("proj-b", "run-1", "batch-other", work.Board{Name: "Stage"})
	if err != nil || other.ProjectID != "proj-b" {
		t.Fatalf("same name in another project: %+v, %v", other, err)
	}

	updated, err := store.UpdateWorkBoard("proj-a", "run-1", "batch-update", work.Board{
		ID: mine.ID, Name: " Owners ", ConfigJSON: `{"version":2,"group":"owner"}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != "Owners" || updated.Position != 1 || updated.ConfigJSON != `{"version":2,"group":"owner"}` {
		t.Fatalf("updated = %+v", updated)
	}
	if _, err := store.UpdateWorkBoard("proj-a", "run-1", "batch-clash", work.Board{ID: mine.ID, Name: "Stage"}); !errors.Is(err, work.ErrBoardNameTaken) {
		t.Fatalf("rename clash: %v", err)
	}
	if _, err := store.UpdateWorkBoard("proj-a", "run-1", "batch-missing", work.Board{ID: "missing", Name: "Nope"}); !errors.Is(err, work.ErrBoardNotFound) {
		t.Fatalf("missing update: %v", err)
	}
	unchanged, err := store.UpdateWorkBoard("proj-a", "run-1", "batch-noop", work.Board{ID: stage.ID, Name: "Stage", ConfigJSON: work.DefaultBoardConfig})
	if err != nil || unchanged.Name != "Stage" {
		t.Fatalf("no-op update: %+v, %v", unchanged, err)
	}

	reordered, err := store.ReorderWorkBoards("proj-a", "run-1", "batch-reorder", []string{updated.ID, stage.ID})
	if err != nil || len(reordered) != 2 || reordered[0].ID != updated.ID || reordered[0].Position != 0 || reordered[1].ID != stage.ID || reordered[1].Position != 1 {
		t.Fatalf("reordered = %+v, %v", reordered, err)
	}
	again, err := store.ReorderWorkBoards("proj-a", "run-1", "batch-reorder-same", []string{updated.ID, stage.ID})
	if err != nil || len(again) != 2 || again[0].Position != 0 {
		t.Fatalf("same order = %+v, %v", again, err)
	}
	if _, err := store.ReorderWorkBoards("proj-a", "run-1", "batch-bad-order", []string{stage.ID}); !errors.Is(err, work.ErrBoardOrder) {
		t.Fatalf("partial order: %v", err)
	}
	listed, err := store.ListWorkBoards("proj-a")
	if err != nil || len(listed) != 2 || listed[0].ID != updated.ID {
		t.Fatalf("order must survive a rejected reorder: %+v, %v", listed, err)
	}

	if err := store.DeleteWorkBoard("proj-a", "run-1", "batch-delete", updated.ID); err != nil {
		t.Fatal(err)
	}
	listed, err = store.ListWorkBoards("proj-a")
	if err != nil || len(listed) != 1 || listed[0].ID != stage.ID || listed[0].Position != 0 || listed[0].Name != "Stage" {
		t.Fatalf("after delete = %+v, %v", listed, err)
	}
	if err := store.DeleteWorkBoard("proj-a", "run-1", "batch-delete-missing", updated.ID); !errors.Is(err, work.ErrBoardNotFound) {
		t.Fatalf("second delete: %v", err)
	}
	restored, err := store.CreateWorkBoard("proj-a", "run-1", "batch-restore", work.Board{Name: "Owners", ConfigJSON: `{"version":2}`})
	if err != nil || restored.Position != 1 {
		t.Fatalf("name can be reused after delete: %+v, %v", restored, err)
	}

	ops, err := boardOps(store, "proj-a")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"create", "create", "update", "update", "update", "remove", "update", "create"}
	if len(ops) != len(want) {
		t.Fatalf("ops = %+v", ops)
	}
	for i, kind := range want {
		if ops[i].kind != kind || ops[i].entity != work.EntityBoard {
			t.Fatalf("op[%d] = %+v, want %s board", i, ops[i], kind)
		}
	}
	if ops[2].fields["name"] != "Owners" || ops[2].fields["config_json"] != `{"version":2,"group":"owner"}` {
		t.Fatalf("rename op = %#v", ops[2].fields)
	}
	if ops[3].fields["position"] != float64(0) || ops[4].fields["position"] != float64(1) || ops[6].fields["position"] != float64(0) {
		t.Fatalf("position ops = %#v %#v %#v", ops[3].fields, ops[4].fields, ops[6].fields)
	}
	if _, err := store.DB.Exec(`INSERT INTO change_ops(id,project_id,agent_run_id,batch_id,entity,entity_id,op,data_json,node_id,created_at)
		VALUES('op-bad','proj-a','','batch-bad','nope','x','create','{}','','2026-01-01T00:00:00Z')`); err == nil {
		t.Fatal("change_ops must reject an unknown entity")
	}
}

type boardOp struct {
	kind   string
	entity string
	fields map[string]any
}

func boardOps(store *storepkg.Store, projectID string) ([]boardOp, error) {
	rows, err := store.DB.Query(`SELECT entity, op, data_json FROM change_ops WHERE project_id=? ORDER BY rowid`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ops []boardOp
	for rows.Next() {
		var op boardOp
		var data string
		if err := rows.Scan(&op.entity, &op.kind, &data); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(data), &op.fields); err != nil {
			return nil, err
		}
		ops = append(ops, op)
	}
	return ops, rows.Err()
}
