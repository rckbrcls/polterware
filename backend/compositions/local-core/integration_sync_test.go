package localcore

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"connectrpc.com/connect"

	"github.com/polterware/polterware/backend/domains/integrations"
	"github.com/polterware/polterware/backend/domains/projects"
	localv1 "github.com/polterware/polterware/backend/platform/gen/polterware/local/v1"
	cliprobe "github.com/polterware/polterware/backend/providers/cli"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func seedSyncTestProject(t *testing.T, store *storepkg.Store, projectID string) {
	t.Helper()
	now := time.Now().UTC()
	if err := store.SaveProject(projects.Project{
		ID: projectID, Name: "Test", CreatedAt: now, UpdatedAt: now, Status: projects.StatusActive,
	}); err != nil {
		t.Fatal(err)
	}
}

func TestSyncIntegrationConnectionFailedLeavesResources(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "sync.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	seedSyncTestProject(t, store, "proj-test")
	connection := integrations.Connection{
		ID:         "int-github",
		ProjectID:  "proj-test",
		ProviderID: "github",
		Status:     "connected",
		Label:      "demo",
		Freshness:  "fresh",
	}
	if err := store.SaveConnection(connection); err != nil {
		t.Fatal(err)
	}
	existing := integrations.Resource{
		ID:           "ires-keep",
		ConnectionID: connection.ID,
		Name:         "keep-me",
		Kind:         "Repository",
		ExternalID:   "keep-me",
		Status:       "synced",
	}
	if err := store.SaveIntegrationResource(existing); err != nil {
		t.Fatal(err)
	}

	previous := listInventoryFn
	listInventoryFn = func(providerID string) cliprobe.InventoryResult {
		return cliprobe.InventoryResult{
			Err:     errors.New("auth required"),
			Message: "gh auth required",
		}
	}
	t.Cleanup(func() { listInventoryFn = previous })

	core := NewCore(store, "test-token")
	response, err := core.SyncIntegrationConnection(context.Background(), connect.NewRequest(&localv1.SyncIntegrationConnectionRequest{
		ConnectionId: connection.ID,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if response.Msg.GetRun().GetResult() != "failed" {
		t.Fatalf("result = %s, want failed", response.Msg.GetRun().GetResult())
	}

	count, err := store.CountIntegrationResourcesByConnection(connection.ID)
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("resource count = %d, want 1 (unchanged)", count)
	}

	updated, err := store.GetConnection(connection.ID)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Freshness != "stale" {
		t.Fatalf("freshness = %s, want stale", updated.Freshness)
	}
	if updated.ErrorMessage != "gh auth required" {
		t.Fatalf("error_message = %q", updated.ErrorMessage)
	}
}

func TestSyncIntegrationConnectionSuccessReplacesResources(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "sync-ok.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	seedSyncTestProject(t, store, "proj-test")
	connection := integrations.Connection{
		ID:         "int-docker",
		ProjectID:  "proj-test",
		ProviderID: "docker",
		Status:     "connected",
		Label:      "local",
		Freshness:  "stale",
	}
	if err := store.SaveConnection(connection); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveIntegrationResource(integrations.Resource{
		ID: "ires-old", ConnectionID: connection.ID, Name: "old", Kind: "Container", ExternalID: "old", Status: "synced",
	}); err != nil {
		t.Fatal(err)
	}

	previous := listInventoryFn
	listInventoryFn = func(providerID string) cliprobe.InventoryResult {
		return cliprobe.InventoryResult{
			Items: []cliprobe.InventoryItem{
				{Name: "nginx", Kind: "Container", ExternalID: "abc123"},
			},
			Message: "Imported 1 containers from docker.",
		}
	}
	t.Cleanup(func() { listInventoryFn = previous })

	core := NewCore(store, "test-token")
	response, err := core.SyncIntegrationConnection(context.Background(), connect.NewRequest(&localv1.SyncIntegrationConnectionRequest{
		ConnectionId: connection.ID,
	}))
	if err != nil {
		t.Fatal(err)
	}
	run := response.Msg.GetRun()
	if run.GetResult() != "success" {
		t.Fatalf("result = %s", run.GetResult())
	}
	if run.GetImported() != 1 {
		t.Fatalf("imported = %d", run.GetImported())
	}

	count, err := store.CountIntegrationResourcesByConnection(connection.ID)
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("resource count = %d, want 1", count)
	}
	items, err := store.ListIntegrationResources(connection.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Name != "nginx" {
		t.Fatalf("resources = %+v", items)
	}
	if items[0].ID != integrationResourceID(connection.ID, "abc123") {
		t.Fatalf("id = %s", items[0].ID)
	}

	updated, err := store.GetConnection(connection.ID)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Freshness != "fresh" || updated.ErrorMessage != "" {
		t.Fatalf("connection = %+v", updated)
	}
	if updated.Summary != "Imported 1 containers from docker." {
		t.Fatalf("summary = %q", updated.Summary)
	}
}

func TestSyncIntegrationConnectionMissing(t *testing.T) {
	t.Parallel()
	store, err := storepkg.New(filepath.Join(t.TempDir(), "sync-missing.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	core := NewCore(store, "test-token")
	_, err = core.SyncIntegrationConnection(context.Background(), connect.NewRequest(&localv1.SyncIntegrationConnectionRequest{
		ConnectionId: "missing",
	}))
	if err == nil {
		t.Fatal("expected not found")
	}
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatalf("code = %v, err = %v", connect.CodeOf(err), err)
	}
}

func TestIntegrationResourceIDStable(t *testing.T) {
	t.Parallel()
	a := integrationResourceID("int-a", "repo/x")
	b := integrationResourceID("int-a", "repo/x")
	c := integrationResourceID("int-a", "repo/y")
	if a != b {
		t.Fatal("expected stable ids")
	}
	if a == c {
		t.Fatal("expected distinct external ids")
	}
	if len(a) < len("ires-int-a-") {
		t.Fatalf("unexpected id %s", a)
	}
}
