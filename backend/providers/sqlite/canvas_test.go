package sqlite_test

import (
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/polterware/polterware/backend/domains/canvas"
	"github.com/polterware/polterware/backend/domains/projects"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestCanvasRoundTrip(t *testing.T) {
	storePath := filepath.Join(t.TempDir(), "canvas.db")
	store, err := storepkg.New(storePath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	now := time.Now().UTC()
	for _, id := range []string{"proj-canvas", "proj-other"} {
		if err := store.SaveProject(projects.Project{ID: id, Name: id, RootPath: "/" + id, CreatedAt: now, UpdatedAt: now}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.DB.Exec(`INSERT INTO atlas_nodes(id,project_id,level,slug,path,title,created_at,updated_at)
		VALUES('node-1','proj-canvas','system','app','app','App',?,?)`, now.Format(time.RFC3339), now.Format(time.RFC3339)); err != nil {
		t.Fatal(err)
	}

	layout := `{"nodes":{"a":{"x":10,"y":20}},"groups":[],"token":"LAYOUT_ONLY_TOKEN"}`
	created, err := store.CreateCanvas(canvas.Canvas{
		ProjectID:    "proj-canvas",
		Name:         "Platform",
		Type:         canvas.TypeCanvas,
		AgentVisible: true,
		ScopeNodeID:  "node-1",
		LayoutJSON:   layout,
		Graph: canvas.Graph{
			Nodes: []canvas.Node{
				{ID: "lane", Kind: "frame", Label: "Platform"},
				{ID: "a", Kind: "service", Label: "Import", Props: map[string]any{"technology": "Go"}},
				{ID: "n", Kind: canvas.KindNote, Label: "ask design"},
			},
			Edges: []canvas.Edge{{ID: "e", From: "a", To: "lane", Kind: canvas.EdgeDependsOn}},
		},
	}, "run-1", "batch-1")
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == "" || created.ScopeNodeID != "node-1" || !created.AgentVisible || created.CreatedAt.IsZero() {
		t.Fatalf("created = %+v", created)
	}
	if _, err := store.CreateCanvas(canvas.Canvas{
		ProjectID: "proj-other", Name: "Other", Type: canvas.TypeCanvas,
	}, "run-1", "batch-other"); err != nil {
		t.Fatal(err)
	}

	var graphRaw, layoutRaw, entity, op, nodeID string
	if err := store.DB.QueryRow(`SELECT graph_json, layout_json FROM canvases WHERE id=?`, created.ID).Scan(&graphRaw, &layoutRaw); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(graphRaw, "LAYOUT_ONLY_TOKEN") || strings.Contains(graphRaw, `"source"`) {
		t.Fatalf("graph stored layout or export shape: %s", graphRaw)
	}
	if !strings.Contains(graphRaw, `"from"`) || layoutRaw != layout {
		t.Fatalf("graph=%s layout=%s", graphRaw, layoutRaw)
	}
	if err := store.DB.QueryRow(`SELECT entity, op, node_id FROM change_ops WHERE entity_id=? AND op='create'`, created.ID).Scan(&entity, &op, &nodeID); err != nil {
		t.Fatal(err)
	}
	if entity != "canvas" || op != "create" || nodeID != "node-1" {
		t.Fatalf("change_ops entity=%s op=%s node=%s", entity, op, nodeID)
	}

	listed, err := store.ListCanvases("proj-canvas")
	if err != nil || len(listed) != 1 || listed[0].ID != created.ID || listed[0].Graph.Nodes[1].Props["technology"] != "Go" {
		t.Fatalf("list = %+v err=%v", listed, err)
	}

	created.Name = "Platform map"
	created.LayoutJSON = `{"nodes":{"a":{"x":1}}}`
	created.AgentVisible = false
	updated, err := store.UpdateCanvas(created, "run-1", "batch-2")
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != "Platform map" || updated.AgentVisible || updated.Type != canvas.TypeCanvas || len(updated.Graph.Edges) != 1 {
		t.Fatalf("updated = %+v", updated)
	}
	if updated.Graph.Edges[0].From != "a" || updated.LayoutJSON == layout {
		t.Fatalf("partial update clobbered graph or kept layout: %+v", updated)
	}

	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := storepkg.New(storePath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	got, err := reopened.GetCanvas("proj-canvas", created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Platform map" || got.Graph.Nodes[2].Kind != canvas.KindNote || got.ScopeNodeID != "node-1" {
		t.Fatalf("reopen = %+v", got)
	}
	if _, err := reopened.DB.Exec(`DELETE FROM atlas_nodes WHERE id='node-1'`); err != nil {
		t.Fatal(err)
	}
	got, err = reopened.GetCanvas("proj-canvas", created.ID)
	if err != nil || got.ScopeNodeID != "" {
		t.Fatalf("scope after node delete = %q err=%v", got.ScopeNodeID, err)
	}
	if err := reopened.DeleteCanvas("proj-canvas", created.ID, "run-1", "batch-3"); !errors.Is(err, canvas.ErrNotArchived) {
		t.Fatalf("delete of an active canvas = %v, want ErrNotArchived", err)
	}
	archived, err := reopened.SetCanvasArchived("proj-canvas", created.ID, true, now, "run-1", "batch-4")
	if err != nil || !archived.Archived() {
		t.Fatalf("archive = %+v err=%v", archived, err)
	}
	if active, err := reopened.ListCanvases("proj-canvas"); err != nil || len(active) != 0 {
		t.Fatalf("active list after archive = %d err=%v", len(active), err)
	}
	if listed, err := reopened.ListArchivedCanvases("proj-canvas"); err != nil || len(listed) != 1 {
		t.Fatalf("archived list = %d err=%v", len(listed), err)
	}
	restored, err := reopened.SetCanvasArchived("proj-canvas", created.ID, false, now, "run-1", "batch-5")
	if err != nil || restored.Archived() {
		t.Fatalf("restore = %+v err=%v", restored, err)
	}
	if active, err := reopened.ListCanvases("proj-canvas"); err != nil || len(active) != 1 {
		t.Fatalf("active list after restore = %d err=%v", len(active), err)
	}
	if _, err := reopened.SetCanvasArchived("proj-canvas", created.ID, true, now, "run-1", "batch-6"); err != nil {
		t.Fatal(err)
	}
	if err := reopened.DeleteCanvas("proj-canvas", created.ID, "run-1", "batch-3"); err != nil {
		t.Fatal(err)
	}
	if _, err := reopened.GetCanvas("proj-canvas", created.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("deleted get = %v", err)
	}
	var removes int
	if err := reopened.DB.QueryRow(`SELECT COUNT(1) FROM change_ops WHERE entity='canvas' AND entity_id=? AND op='remove'`, created.ID).Scan(&removes); err != nil || removes != 1 {
		t.Fatalf("removes=%d err=%v", removes, err)
	}
}

func TestCanvasRejectsInvalidGraphAndScope(t *testing.T) {
	store := newStore(t)
	now := time.Now().UTC()
	if err := store.SaveProject(projects.Project{ID: "proj-canvas", Name: "Canvas", RootPath: "/canvas", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	_, err := store.CreateCanvas(canvas.Canvas{
		ProjectID: "proj-canvas",
		Name:      "Broken",
		Type:      canvas.TypeCanvas,
		Graph:     canvas.Graph{Nodes: []canvas.Node{{ID: "a", Kind: "spaceship"}}},
	}, "run-1", "batch-bad")
	if err == nil || !errors.Is(err, canvas.ErrInvalidGraph) {
		t.Fatalf("invalid graph err = %v", err)
	}
	_, err = store.CreateCanvas(canvas.Canvas{
		ProjectID: "proj-canvas", Name: "Scoped", Type: canvas.TypeCanvas, ScopeNodeID: "missing",
	}, "run-1", "batch-scope")
	if err == nil || !errors.Is(err, canvas.ErrUnknownScope) {
		t.Fatalf("scope err = %v", err)
	}
	var n int
	if err := store.DB.QueryRow(`SELECT COUNT(1) FROM canvases`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("rows = %d err=%v", n, err)
	}
}
