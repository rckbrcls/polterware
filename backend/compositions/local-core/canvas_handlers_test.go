package localcore

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/projects"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestCanvasServiceRejectsAndUpdatesParts(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "canvas.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	now := time.Now().UTC()
	project := projects.Project{ID: "proj-canvas", Name: "Canvas", CreatedAt: now, UpdatedAt: now}
	if err := store.SaveProject(project); err != nil {
		t.Fatal(err)
	}
	core := NewCore(store, "token")
	ctx := context.Background()
	change := &localv1.ChangeEnvelope{Summary: "Save canvas", Rationale: "The roadmap needs a surface"}

	types, err := core.ListCanvasTypes(ctx, connect.NewRequest(&localv1.ListCanvasTypesRequest{}))
	if err != nil || len(types.Msg.GetTypes()) != 1 {
		t.Fatalf("types: err=%v n=%d", err, len(types.Msg.GetTypes()))
	}
	sawNote := false
	for _, item := range types.Msg.GetTypes() {
		if item.GetType() != "canvas" {
			continue
		}
		for _, kind := range item.GetNodeKinds() {
			if kind == "note" {
				sawNote = true
			}
		}
	}
	if !sawNote {
		t.Fatal("canvas palette must include note")
	}

	_, err = core.CreateCanvas(ctx, connect.NewRequest(&localv1.CreateCanvasRequest{
		ProjectId: project.ID,
		Name:      "Broken",
		Type:      "canvas",
		Change:    change,
		Graph:     &localv1.CanvasGraph{Nodes: []*localv1.CanvasNode{{Id: "a", Kind: "spaceship"}}},
	}))
	var connectErr *connect.Error
	if !errors.As(err, &connectErr) || connectErr.Code() != connect.CodeInvalidArgument || !strings.Contains(connectErr.Message(), "not allowed") {
		t.Fatalf("bad kind: %v", err)
	}

	_, err = core.CreateCanvas(ctx, connect.NewRequest(&localv1.CreateCanvasRequest{
		ProjectId: project.ID,
		Name:      "Sketch",
		Type:      "canvas",
		Change:    change,
		Graph:     &localv1.CanvasGraph{Nodes: []*localv1.CanvasNode{{Id: "s", Kind: "domain", Label: "API"}}},
	}))
	if !errors.As(err, &connectErr) || connectErr.Code() != connect.CodeInvalidArgument || !strings.Contains(connectErr.Message(), "structure node") {
		t.Fatalf("missing ref: %v", err)
	}

	noteOnly, err := core.CreateCanvas(ctx, connect.NewRequest(&localv1.CreateCanvasRequest{
		ProjectId: project.ID,
		Name:      "Sketch",
		Type:      "canvas",
		Change:    change,
		Graph:     &localv1.CanvasGraph{Nodes: []*localv1.CanvasNode{{Id: "n", Kind: "note", Label: "later"}}},
	}))
	if err != nil || noteOnly.Msg.GetCanvas().GetGraph().GetNodes()[0].GetKind() != "note" {
		t.Fatalf("note on canvas: err=%v msg=%+v", err, noteOnly)
	}

	created, err := core.CreateCanvas(ctx, connect.NewRequest(&localv1.CreateCanvasRequest{
		ProjectId:    project.ID,
		Name:         "Platform",
		Type:         "canvas",
		AgentVisible: true,
		Change:       change,
		Graph: &localv1.CanvasGraph{
			Nodes: []*localv1.CanvasNode{
				{Id: "a", Kind: "service", Label: "Import", PropsJson: `{"technology":"Go"}`},
				{Id: "n", Kind: "note", Label: "ask"},
			},
			Edges: []*localv1.CanvasEdge{{Id: "e", From: "a", To: "n", Kind: "depends_on"}},
		},
	}))
	if err != nil {
		t.Fatal(err)
	}
	canvasID := created.Msg.GetCanvas().GetId()
	if canvasID == "" || created.Msg.GetCanvas().GetLayoutJson() != "{}" || !created.Msg.GetCanvas().GetAgentVisible() {
		t.Fatalf("created = %+v", created.Msg.GetCanvas())
	}
	var runID, entity string
	if err := store.DB.QueryRow(`SELECT agent_run_id, entity FROM change_ops WHERE entity_id=? AND op='create'`, canvasID).Scan(&runID, &entity); err != nil || entity != "canvas" || runID == "" {
		t.Fatalf("audit row entity=%s run=%s err=%v", entity, runID, err)
	}
	record, err := store.GetAgentRunRecord(runID)
	if err != nil || record.Run.ActorKind != "human" {
		t.Fatalf("human run: err=%v run=%+v", err, record.Run)
	}

	name := "Platform map"
	renamed, err := core.UpdateCanvas(ctx, connect.NewRequest(&localv1.UpdateCanvasRequest{
		ProjectId: project.ID, Id: canvasID, Change: change, Name: &name,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Msg.GetCanvas().GetName() != name || len(renamed.Msg.GetCanvas().GetGraph().GetNodes()) != 2 || renamed.Msg.GetCanvas().GetLayoutJson() != "{}" {
		t.Fatalf("name update clobbered other parts: %+v", renamed.Msg.GetCanvas())
	}

	layout := `{"nodes":{"a":{"x":4,"y":8}}}`
	moved, err := core.UpdateCanvas(ctx, connect.NewRequest(&localv1.UpdateCanvasRequest{
		ProjectId: project.ID, Id: canvasID, Change: change, LayoutJson: &layout,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if moved.Msg.GetCanvas().GetLayoutJson() != layout || moved.Msg.GetCanvas().GetName() != name {
		t.Fatalf("layout update = %+v", moved.Msg.GetCanvas())
	}
	if !strings.Contains(moved.Msg.GetCanvas().GetGraph().GetNodes()[0].GetPropsJson(), "technology") {
		t.Fatalf("layout update changed the graph: %+v", moved.Msg.GetCanvas().GetGraph())
	}

	_, err = core.UpdateCanvas(ctx, connect.NewRequest(&localv1.UpdateCanvasRequest{
		ProjectId: project.ID,
		Id:        canvasID,
		Change:    change,
		Graph:     &localv1.CanvasGraph{Nodes: []*localv1.CanvasNode{{Id: "a", Kind: "spaceship"}}},
	}))
	if !errors.As(err, &connectErr) || connectErr.Code() != connect.CodeInvalidArgument {
		t.Fatalf("bad graph update: %v", err)
	}
	got, err := core.GetCanvas(ctx, connect.NewRequest(&localv1.GetCanvasRequest{ProjectId: project.ID, Id: canvasID}))
	if err != nil || len(got.Msg.GetCanvas().GetGraph().GetEdges()) != 1 || got.Msg.GetCanvas().GetLayoutJson() != layout {
		t.Fatalf("rejected write changed the canvas: err=%v canvas=%+v", err, got.Msg.GetCanvas())
	}

	_, err = core.DeleteCanvas(ctx, connect.NewRequest(&localv1.DeleteCanvasRequest{ProjectId: project.ID, Id: canvasID, Change: change}))
	if !errors.As(err, &connectErr) || connectErr.Code() != connect.CodeFailedPrecondition {
		t.Fatalf("delete of an active canvas: %v", err)
	}
	archived, err := core.SetCanvasArchived(ctx, connect.NewRequest(&localv1.SetCanvasArchivedRequest{ProjectId: project.ID, Id: canvasID, Archived: true, Change: change}))
	if err != nil || archived.Msg.GetCanvas().GetArchivedAt() == "" {
		t.Fatalf("archive: err=%v canvas=%+v", err, archived)
	}
	_, err = core.UpdateCanvas(ctx, connect.NewRequest(&localv1.UpdateCanvasRequest{ProjectId: project.ID, Id: canvasID, Change: change, Name: ptr("Renamed")}))
	if !errors.As(err, &connectErr) || connectErr.Code() != connect.CodeFailedPrecondition {
		t.Fatalf("update of an archived canvas: %v", err)
	}
	listed, err := core.ListCanvases(ctx, connect.NewRequest(&localv1.ListCanvasesRequest{ProjectId: project.ID, Archived: true}))
	if err != nil || len(listed.Msg.GetCanvases()) != 1 {
		t.Fatalf("archived list: err=%v", err)
	}
	if _, err := core.DeleteCanvas(ctx, connect.NewRequest(&localv1.DeleteCanvasRequest{ProjectId: project.ID, Id: canvasID, Change: change})); err != nil {
		t.Fatal(err)
	}
	_, err = core.GetCanvas(ctx, connect.NewRequest(&localv1.GetCanvasRequest{ProjectId: project.ID, Id: canvasID}))
	if !errors.As(err, &connectErr) || connectErr.Code() != connect.CodeNotFound {
		t.Fatalf("deleted get: %v", err)
	}
}

func ptr[T any](value T) *T { return &value }
