package wedge_test

import (
	"path/filepath"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/atlas"
	"github.com/polterware/polterware/backend/domains/inbox"
	"github.com/polterware/polterware/backend/domains/integrations"
	"github.com/polterware/polterware/backend/domains/projects"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

func TestDeployLinksPersistAndInbox(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "work.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", RootPath: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	prod, err := projects.NewEnvironment(project.ID+"-prod", project.ID, "production", "production")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SaveEnvironment(prod); err != nil {
		t.Fatal(err)
	}
	localID := project.ID + "-local"
	text := `---
polter: 1
summary: Link the web component
rationale: Record where it deploys
---

# app: App
level: system

# app/web: Web
level: component
under: app
deploys: production=vercel:web, local=docker:api
`
	apply := func(body string) wedge.ApplyResult {
		t.Helper()
		result, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: body, AutoStartLabel: "cli"})
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	if result := apply(text); !result.Applied {
		t.Fatal("expected the links to be written")
	}
	web := nodeByPath(t, store, project.ID, "app/web")
	if len(web.Deploys) != 2 || web.Deploys[0].Provider != "docker" || web.Deploys[0].EnvironmentID != localID || web.Deploys[0].Resource != "api" {
		t.Fatalf("deploys = %+v", web.Deploys)
	}
	if web.Deploys[1].Provider != "vercel" || web.Deploys[1].EnvironmentID != prod.ID || web.Deploys[1].Resource != "web" || web.Deploys[1].Environment != "production" {
		t.Fatalf("deploys = %+v", web.Deploys)
	}
	vercelID := web.Deploys[1].ID
	if again := apply(text); again.Applied || len(again.Ops) != 0 {
		t.Fatalf("re-apply should be a no-op: %+v", again.Ops)
	}
	omit := `---
polter: 1
summary: Leave the links
rationale: An absent deploys line changes nothing
---

# app/web: Web
`
	if again := apply(omit); again.Applied || len(again.Ops) != 0 {
		t.Fatalf("omit should be a no-op: %+v", again.Ops)
	}

	bad := "---\npolter: 1\nsummary: Bad provider\nrationale: Should fail\n---\n# app/web: Web\ndeploys: production=heroku:web\n"
	if _, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: bad, AutoStartLabel: "cli"}); err == nil {
		t.Fatal("unknown provider should be rejected")
	}
	if kept := nodeByPath(t, store, project.ID, "app/web"); len(kept.Deploys) != 2 {
		t.Fatalf("rejected text must leave the links: %+v", kept.Deploys)
	}

	listed, err := wedge.ListInbox(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	prodKey := inbox.DeployKey(web.ID, prod.ID)
	item, ok := deployItem(listed, prodKey)
	if !ok || item.Kind != inbox.KindVerify || item.Title != "Connect vercel for app/web in production" || item.Detail != "vercel" {
		t.Fatalf("inbox = %+v", listed.Items)
	}
	localKey := inbox.DeployKey(web.ID, localID)
	if local, ok := deployItem(listed, localKey); !ok || local.Title != "Connect docker for app/web in local" {
		t.Fatalf("docker item = %+v", listed.Items)
	}

	if err := store.SaveConnection(integrations.Connection{
		ID: "conn-docker", ProjectID: project.ID, ProviderID: "docker", Status: inbox.ProviderStatusConnected, Label: "docker",
	}); err != nil {
		t.Fatal(err)
	}
	listed, err = wedge.ListInbox(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := deployItem(listed, localKey); ok {
		t.Fatalf("a connected docker CLI should clear the local item: %+v", listed.Items)
	}
	if _, ok := deployItem(listed, prodKey); !ok {
		t.Fatal("vercel stays open until its CLI is connected")
	}
	if err := store.SaveConnection(integrations.Connection{
		ID: "conn-vercel-local", ProjectID: project.ID, ProviderID: "vercel", Status: inbox.ProviderStatusConnected,
		Label: "vercel", EnvironmentID: localID,
	}); err != nil {
		t.Fatal(err)
	}
	listed, err = wedge.ListInbox(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := deployItem(listed, prodKey); !ok {
		t.Fatal("a connection for another environment does not cover production")
	}
	if err := store.SaveConnection(integrations.Connection{
		ID: "conn-vercel", ProjectID: project.ID, ProviderID: "vercel", Status: inbox.ProviderStatusConnected, Label: "vercel-global",
	}); err != nil {
		t.Fatal(err)
	}
	listed, err = wedge.ListInbox(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := deployItem(listed, prodKey); ok {
		t.Fatalf("connected vercel should clear the item: %+v", listed.Items)
	}

	replaced := `---
polter: 1
summary: Keep production only
rationale: A present deploys line replaces the set
---

# app/web: Web
deploys: production=vercel:web
`
	if result := apply(replaced); !result.Applied {
		t.Fatal("expected the production link to replace the set")
	}
	web = nodeByPath(t, store, project.ID, "app/web")
	if len(web.Deploys) != 1 || web.Deploys[0].ID != vercelID || web.Deploys[0].Provider != "vercel" {
		t.Fatalf("replaced = %+v, want id %s", web.Deploys, vercelID)
	}

	cleared := `---
polter: 1
summary: Clear links
rationale: Empty deploys clears
---

# app/web: Web
deploys:
`
	if result := apply(cleared); !result.Applied {
		t.Fatal("expected an empty deploys line to clear the links")
	}
	if web = nodeByPath(t, store, project.ID, "app/web"); len(web.Deploys) != 0 {
		t.Fatalf("cleared = %+v", web.Deploys)
	}
	listed, err = wedge.ListInbox(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := deployItem(listed, prodKey); ok {
		t.Fatalf("cleared links should leave the inbox: %+v", listed.Items)
	}
}

func nodeByPath(t *testing.T, store *storepkg.Store, projectID, path string) atlas.Node {
	t.Helper()
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		t.Fatal(err)
	}
	for _, node := range snapshot.Nodes {
		if node.Path == path {
			return node
		}
	}
	t.Fatalf("missing node %s", path)
	return atlas.Node{}
}

func deployItem(result inbox.Result, key string) (inbox.Item, bool) {
	for _, item := range result.Items {
		if item.Key == key {
			return item, true
		}
	}
	return inbox.Item{}, false
}
