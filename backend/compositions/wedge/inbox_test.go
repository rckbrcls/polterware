package wedge_test

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/polterware/polterware/backend/compositions/wedge"
	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/inbox"
	"github.com/polterware/polterware/backend/domains/canon"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

const inboxRoadmap = `---
polter: 1
summary: Add a card with open questions
rationale: Exercise slice 7
---

## git-import: Git import
stage: plan

? Include merge commits? [blocking] (yes | no | first-parent)
? How many commits back?
`

func TestInboxEndToEnd(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "work.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", RootPath: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: inboxRoadmap, AutoStartLabel: "cli"}); err != nil {
		t.Fatal(err)
	}
	declared, err := canon.NewFact(project.ID, "Local auth is bearer token", canon.TruthDeclared, "mcp", "codex", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertCanonFact(declared); err != nil {
		t.Fatal(err)
	}

	listed, err := wedge.ListInbox(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if listed.Open() != 3 || listed.Blocking() != 1 {
		t.Fatalf("open=%d blocking=%d items=%+v", listed.Open(), listed.Blocking(), listed.Items)
	}
	blocking := listed.Items[0]
	if blocking.Kind != inbox.KindDecision || blocking.Title != "Include merge commits?" {
		t.Fatalf("first item = %+v, want the blocking decision", blocking)
	}

	// Status carries the same count and the blocking item.
	status, err := wedge.QueryPolter(store, project.ID, "status")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(status, "inbox: 3 open (1 blocking)\n") || !strings.Contains(status, "! "+blocking.ID+" decision Include merge commits?") {
		t.Fatalf("status:\n%s", status)
	}

	resolve := func(ref, action, answer string) (wedge.ResolveInboxResult, error) {
		return wedge.ResolveInbox(store, wedge.ResolveInboxInput{
			ProjectID: project.ID, ItemID: ref, Action: action, Answer: answer, Actor: "desktop",
			Apply: wedge.ApplyInput{ActorKind: agentrun.ActorKindHuman, Tool: "desktop.inbox.resolve"},
		})
	}

	// Wrong action for the kind, and a decide without an answer, are caller errors.
	var inputErr *wedge.InboxInputError
	if _, err := resolve(blocking.ID, inbox.ActionIgnore, ""); !errors.As(err, &inputErr) {
		t.Fatalf("ignore on a decision: %v", err)
	}
	if _, err := resolve(blocking.ID, inbox.ActionDecide, ""); !errors.As(err, &inputErr) {
		t.Fatalf("decide without answer: %v", err)
	}
	if _, err := resolve("i00000000", inbox.ActionDefer, ""); !errors.Is(err, wedge.ErrUnknownInboxItem) {
		t.Fatalf("unknown item: %v", err)
	}

	// Decide writes `? text -> answer` through apply; the item closes.
	decided, err := resolve(blocking.ID, inbox.ActionDecide, "first-parent")
	if err != nil || decided.Apply == nil || !decided.Apply.Applied {
		t.Fatalf("decide: err=%v result=%+v", err, decided)
	}
	card, err := wedge.QueryPolter(store, project.ID, "card git-import")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(card, "? Include merge commits? [blocking] (yes | no | first-parent) -> first-parent\n") {
		t.Fatalf("card after decide:\n%s", card)
	}

	// Delegate routes the other question to agents through status.
	other, ok := findKind(t, store, project.ID, inbox.KindDecision)
	if !ok {
		t.Fatal("second decision missing")
	}
	if _, err := resolve(other.ID, inbox.ActionDelegate, ""); err != nil {
		t.Fatal(err)
	}
	status, _ = wedge.QueryPolter(store, project.ID, "status")
	if !strings.Contains(status, "delegated: How many commits back?") {
		t.Fatalf("status after delegate:\n%s", status)
	}

	// Verify marks the fact verified with the acting label; the item closes.
	fact, ok := findKind(t, store, project.ID, inbox.KindVerify)
	if !ok {
		t.Fatal("verify item missing")
	}
	if _, err := wedge.ResolveInbox(store, wedge.ResolveInboxInput{ProjectID: project.ID, ItemID: fact.ID, Action: inbox.ActionVerify, Actor: "system"}); !errors.Is(err, canon.ErrVerifiedRequiresActor) {
		t.Fatalf("verify as system: %v", err)
	}
	if _, err := resolve(fact.ID, inbox.ActionVerify, ""); err != nil {
		t.Fatal(err)
	}
	stored, err := store.GetCanonFact(declared.ID)
	if err != nil || stored.TruthClass != canon.TruthVerified || stored.Actor != "desktop" {
		t.Fatalf("fact after verify = %+v err=%v", stored, err)
	}

	final, err := wedge.ListInbox(store, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if final.Open() != 0 || len(final.Items) != 0 || len(final.Routed) != 1 {
		t.Fatalf("final inbox = %+v", final)
	}
	if text, _ := wedge.QueryPolter(store, project.ID, "inbox"); text != "inbox empty\n" {
		t.Fatalf("inbox query = %q", text)
	}
}

func TestInboxRejectAndDefer(t *testing.T) {
	store, err := storepkg.New(filepath.Join(t.TempDir(), "work.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := wedge.InitProject(store, wedge.InitInput{Name: "Demo", RootPath: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := wedge.ApplyPolter(store, wedge.ApplyInput{ProjectID: project.ID, Text: inboxRoadmap, AutoStartLabel: "cli"}); err != nil {
		t.Fatal(err)
	}
	observed, _ := canon.NewFact(project.ID, "Uses pnpm", canon.TruthObserved, "agent", "claude", "")
	if err := store.UpsertCanonFact(observed); err != nil {
		t.Fatal(err)
	}

	fact, _ := findKind(t, store, project.ID, inbox.KindVerify)
	if _, err := wedge.ResolveInbox(store, wedge.ResolveInboxInput{ProjectID: project.ID, ItemID: fact.ID, Action: inbox.ActionReject, Actor: "desktop"}); err != nil {
		t.Fatal(err)
	}
	listed, _ := wedge.ListInbox(store, project.ID)
	blocking := listed.Items[0]
	if _, err := wedge.ResolveInbox(store, wedge.ResolveInboxInput{ProjectID: project.ID, ItemID: blocking.ID, Action: inbox.ActionDefer, Actor: "desktop"}); err != nil {
		t.Fatal(err)
	}

	listed, _ = wedge.ListInbox(store, project.ID)
	if listed.Open() != 1 || listed.Blocking() != 0 {
		t.Fatalf("open=%d blocking=%d, want 1 and 0 after reject and defer", listed.Open(), listed.Blocking())
	}
	last := listed.Items[len(listed.Items)-1]
	if last.ID != blocking.ID || last.State != inbox.StateDeferred {
		t.Fatalf("deferred item should be listed last: %+v", listed.Items)
	}
	// The rejected fact is hidden but kept as history.
	if _, err := store.GetCanonFact(observed.ID); err != nil {
		t.Fatalf("rejected fact must stay: %v", err)
	}
}

func findKind(t *testing.T, store *storepkg.Store, projectID, kind string) (inbox.Item, bool) {
	t.Helper()
	result, err := wedge.ListInbox(store, projectID)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range result.Items {
		if item.Kind == kind {
			return item, true
		}
	}
	return inbox.Item{}, false
}
