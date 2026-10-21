package wedge

import (
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/domains/atlas"
	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/inbox"
	"github.com/polterware/polterware/backend/domains/work"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// ListInboxScoped derives the Inbox and keeps the items inside scope. An item's
// own scope wins; otherwise a Decision item takes its card's `under` and a
// Verify item takes its fact's scope. Everything else is unscoped and stays.
func ListInboxScoped(store *storepkg.Store, projectID string, scope atlas.Scope) (inbox.Result, error) {
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return inbox.Result{}, err
	}
	return inboxScoped(store, snapshot, scope)
}

func inboxScoped(store *storepkg.Store, snapshot work.Snapshot, scope atlas.Scope) (inbox.Result, error) {
	projectID := snapshot.ProjectID
	result, err := listInbox(store, snapshot)
	if err != nil || !scope.Active() {
		return result, err
	}
	resolved, err := store.LoadScope(projectID, scope)
	if err != nil {
		return result, err
	}
	assigned, err := store.ScopeMap(projectID, storepkg.ScopeItem)
	if err != nil {
		return result, err
	}
	factScopes, err := store.ScopeMap(projectID, storepkg.ScopeFact)
	if err != nil {
		return result, err
	}
	under := map[string]string{}
	for _, card := range snapshot.Cards {
		under[card.Slug] = card.Under
	}
	visible := func(item inbox.Item) bool {
		if node, ok := assigned[item.Key]; ok {
			return resolved.Matches(node)
		}
		switch item.Kind {
		case inbox.KindDecision:
			return resolved.MatchesPath(under[item.CardSlug])
		case inbox.KindVerify:
			return resolved.Matches(factScopes[item.FactID])
		}
		return true
	}
	filtered := inbox.Result{}
	for _, item := range result.Items {
		if visible(item) {
			filtered.Items = append(filtered.Items, item)
		}
	}
	for _, routed := range result.Routed {
		if visible(routed.Item) {
			filtered.Routed = append(filtered.Routed, routed)
		}
	}
	return filtered, nil
}

// scopeSnapshot narrows the snapshot's cards and Decisions to scope. Atlas
// nodes stay whole so the map keeps its structure.
func scopeSnapshot(store *storepkg.Store, snapshot work.Snapshot, scope atlas.Scope) (work.Snapshot, error) {
	if !scope.Active() {
		return snapshot, nil
	}
	resolved, err := store.LoadScope(snapshot.ProjectID, scope)
	if err != nil {
		return snapshot, err
	}
	scopes, err := store.ScopeMap(snapshot.ProjectID, storepkg.ScopeDecision)
	if err != nil {
		return snapshot, err
	}
	snapshot.Cards = FilterCardsByScope(resolved, snapshot.Cards)
	kept := make([]decision.Decision, 0, len(snapshot.Decisions))
	for _, item := range snapshot.Decisions {
		if resolved.Matches(scopes[item.ID]) {
			kept = append(kept, item)
		}
	}
	snapshot.Decisions = kept
	return snapshot, nil
}

// FilterCardsByScope keeps the cards whose `under` path is inside scope. A card
// with no `under` belongs to the whole project and stays.
func FilterCardsByScope(resolved storepkg.NodeScope, cards []work.Card) []work.Card {
	if resolved.Set == nil {
		return cards
	}
	out := make([]work.Card, 0, len(cards))
	for _, card := range cards {
		if resolved.MatchesPath(card.Under) {
			out = append(out, card)
		}
	}
	return out
}

// FilterFactsByScope keeps the facts scoped inside scope plus unscoped ones.
func FilterFactsByScope(resolved storepkg.NodeScope, scopes map[string]string, facts []canon.Fact) []canon.Fact {
	if resolved.Set == nil {
		return facts
	}
	out := make([]canon.Fact, 0, len(facts))
	for _, fact := range facts {
		if resolved.Matches(scopes[fact.ID]) {
			out = append(out, fact)
		}
	}
	return out
}

// FilterEvidenceByScope keeps the evidence scoped inside scope plus unscoped.
func FilterEvidenceByScope(resolved storepkg.NodeScope, scopes map[string]string, items []canon.Evidence) []canon.Evidence {
	if resolved.Set == nil {
		return items
	}
	out := make([]canon.Evidence, 0, len(items))
	for _, item := range items {
		if resolved.Matches(scopes[item.ID]) {
			out = append(out, item)
		}
	}
	return out
}

// ResolveScopeRef turns a node id, path, or slug into a Scope. An empty ref is
// the whole project.
func ResolveScopeRef(store *storepkg.Store, projectID, ref string, exact bool) (atlas.Scope, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return atlas.Scope{}, nil
	}
	nodes, err := store.AtlasNodes(projectID)
	if err != nil {
		return atlas.Scope{}, err
	}
	for _, node := range nodes {
		if node.Status == atlas.NodeRemoved {
			continue
		}
		if node.ID == ref || node.Path == ref || node.Slug == ref {
			return atlas.Scope{NodeID: node.ID, Exact: exact}, nil
		}
	}
	return atlas.Scope{}, fmt.Errorf("unknown atlas node %q: list them with polterware atlas", ref)
}

// LoadNodeScope resolves a request's scope reference against the project Atlas.
func LoadNodeScope(store *storepkg.Store, projectID, ref string, exact bool) (storepkg.NodeScope, error) {
	scope, err := ResolveScopeRef(store, projectID, ref, exact)
	if err != nil {
		return storepkg.NodeScope{}, err
	}
	return store.LoadScope(projectID, scope)
}
