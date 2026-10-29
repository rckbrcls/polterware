package localcore

import (
	"context"
	"net/http"
	"testing"

	"connectrpc.com/connect"

	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	"github.com/polterware/polterware/backend/platform/gen/polterware/local/v1/localv1connect"
	"github.com/polterware/polterware/backend/providers/seed"
)

func TestSavedFilterServiceOverRPC(t *testing.T) {
	core, url := startCore(t)
	client := localv1connect.NewSavedFilterServiceClient(http.DefaultClient, url)
	ctx := context.Background()
	save := func(msg *localv1.SaveSavedFilterRequest) (*localv1.SavedFilter, error) {
		response, err := client.SaveSavedFilter(ctx, withToken(connect.NewRequest(msg), testToken))
		if err != nil {
			return nil, err
		}
		return response.Msg.GetFilter(), nil
	}
	list := func(projectID, surface string) []*localv1.SavedFilter {
		t.Helper()
		response, err := client.ListSavedFilters(ctx, withToken(connect.NewRequest(&localv1.ListSavedFiltersRequest{ProjectId: projectID, Surface: surface}), testToken))
		if err != nil {
			t.Fatal(err)
		}
		return response.Msg.GetFilters()
	}

	if _, err := client.ListSavedFilters(ctx, connect.NewRequest(&localv1.ListSavedFiltersRequest{Surface: "work"})); connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Fatalf("missing token: %v", err)
	}

	mine, err := save(&localv1.SaveSavedFilterRequest{ProjectId: seed.ProjectID, Surface: "work", Name: "Mine", PayloadJson: `{"version":1,"clauses":[]}`})
	if err != nil {
		t.Fatal(err)
	}
	if mine.GetId() == "" || mine.GetProjectId() != seed.ProjectID || mine.GetPosition() != 0 || mine.GetCreatedAt() == "" {
		t.Fatalf("save = %+v", mine)
	}
	again, err := save(&localv1.SaveSavedFilterRequest{ProjectId: seed.ProjectID, Surface: "work", Name: "Mine", PayloadJson: `{"version":1,"clauses":[{"field":"stage"}]}`})
	if err != nil || again.GetId() != mine.GetId() || again.GetPayloadJson() != `{"version":1,"clauses":[{"field":"stage"}]}` {
		t.Fatalf("upsert = %+v, %v", again, err)
	}
	app, err := save(&localv1.SaveSavedFilterRequest{Surface: "projects", Name: "Active", PayloadJson: `{"version":1}`})
	if err != nil || app.GetProjectId() != "" {
		t.Fatalf("app-level save = %+v, %v", app, err)
	}
	if got := list(seed.ProjectID, "work"); len(got) != 1 || got[0].GetId() != mine.GetId() {
		t.Fatalf("project list = %v", got)
	}
	if got := list("", "projects"); len(got) != 1 || got[0].GetId() != app.GetId() {
		t.Fatalf("app list = %v", got)
	}

	for name, msg := range map[string]*localv1.SaveSavedFilterRequest{
		"blank surface": {Surface: " ", Name: "a", PayloadJson: `{"version":1}`},
		"blank name":    {Surface: "work", Name: "", PayloadJson: `{"version":1}`},
		"no version":    {Surface: "work", Name: "a", PayloadJson: `{"clauses":[]}`},
		"not an object": {Surface: "work", Name: "a", PayloadJson: `[1]`},
	} {
		if _, err := save(msg); connect.CodeOf(err) != connect.CodeInvalidArgument {
			t.Errorf("%s: %v", name, err)
		}
	}
	if _, err := save(&localv1.SaveSavedFilterRequest{ProjectId: "missing", Surface: "work", Name: "a", PayloadJson: `{"version":1}`}); connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatalf("unknown project: %v", err)
	}
	if _, err := client.ListSavedFilters(ctx, withToken(connect.NewRequest(&localv1.ListSavedFiltersRequest{ProjectId: seed.ProjectID}), testToken)); connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("list without surface: %v", err)
	}

	if _, err := client.DeleteSavedFilter(ctx, withToken(connect.NewRequest(&localv1.DeleteSavedFilterRequest{Id: mine.GetId()}), testToken)); err != nil {
		t.Fatal(err)
	}
	if _, err := client.DeleteSavedFilter(ctx, withToken(connect.NewRequest(&localv1.DeleteSavedFilterRequest{Id: mine.GetId()}), testToken)); connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatalf("second delete: %v", err)
	}
	if _, err := client.DeleteSavedFilter(ctx, withToken(connect.NewRequest(&localv1.DeleteSavedFilterRequest{}), testToken)); connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("delete without id: %v", err)
	}
	if got := list(seed.ProjectID, "work"); len(got) != 0 {
		t.Fatalf("after delete = %v", got)
	}

	var changeOps int
	if err := core.Store.DB.QueryRow(`SELECT COUNT(*) FROM change_ops WHERE entity_id IN (?, ?)`, mine.GetId(), app.GetId()).Scan(&changeOps); err != nil || changeOps != 0 {
		t.Fatalf("saved filters are not audited: %d, %v", changeOps, err)
	}
}
