package wedge

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/inbox"
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// ListInboxScoped derives the Inbox and keeps the items inside scope. An item's
// own scope wins; otherwise a Decision item takes its card's `under` and a
// Verify item takes its fact's scope. Everything else is unscoped and stays.
func ListInboxScoped(store *storepkg.Store, projectID string, scope structure.MultiScope) (inbox.Result, error) {
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return inbox.Result{}, err
	}
	return inboxScoped(store, snapshot, scope)
}

func inboxScoped(store *storepkg.Store, snapshot work.Snapshot, scope structure.MultiScope) (inbox.Result, error) {
	projectID := snapshot.ProjectID
	result, err := listInbox(store, snapshot)
	if err != nil || !scope.Active() {
		return result, err
	}
	resolved, err := store.LoadScopes(projectID, scope)
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

// scopeSnapshot narrows the snapshot's cards and Decisions to scope. Structure
// nodes stay whole so the map keeps its structure.
func scopeSnapshot(store *storepkg.Store, snapshot work.Snapshot, scope structure.MultiScope) (work.Snapshot, error) {
	if !scope.Active() {
		return snapshot, nil
	}
	resolved, err := store.LoadScopes(snapshot.ProjectID, scope)
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

// FilterCardsByScope keeps the cards whose `under` path is inside scope. The
// resolved set may be the union of several nodes. A card with no `under`
// belongs to the whole project and stays.
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

// ScopeRefs joins the legacy single node with the repeated list. Commas inside
// a value split it. Blanks and duplicates are dropped. The single node comes first.
func ScopeRefs(single string, many []string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(ref string) {
		for _, part := range strings.Split(ref, ",") {
			part = strings.TrimSpace(part)
			if part == "" || seen[part] {
				continue
			}
			seen[part] = true
			out = append(out, part)
		}
	}
	add(single)
	for _, ref := range many {
		add(ref)
	}
	return out
}

// ResolveScopeRef turns one node id, path, or slug into a Scope. An empty ref
// is the whole project. Removed nodes are unknown. The ref is one node: commas
// are not separators here (assignment stays a single node).
func ResolveScopeRef(store *storepkg.Store, projectID, ref string, exact bool) (structure.Scope, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return structure.Scope{}, nil
	}
	scope, err := resolveScopeIDs(store, projectID, []string{ref}, exact)
	if err != nil {
		return structure.Scope{}, err
	}
	return structure.Scope{NodeID: scope.NodeIDs[0], Exact: exact}, nil
}

// ResolveScopeRefs turns node ids, paths, or slugs into one MultiScope. An
// empty list is the whole project. Commas inside a ref split it. The first
// unknown ref is an error. Removed nodes are unknown.
func ResolveScopeRefs(store *storepkg.Store, projectID string, refs []string, exact bool) (structure.MultiScope, error) {
	return resolveScopeIDs(store, projectID, ScopeRefs("", refs), exact)
}

func resolveScopeIDs(store *storepkg.Store, projectID string, refs []string, exact bool) (structure.MultiScope, error) {
	if len(refs) == 0 {
		return structure.MultiScope{}, nil
	}
	nodes, err := store.StructureNodes(projectID)
	if err != nil {
		return structure.MultiScope{}, err
	}
	ids := make([]string, 0, len(refs))
	seen := map[string]bool{}
	for _, ref := range refs {
		id := ""
		for _, node := range nodes {
			if node.Status == structure.NodeRemoved {
				continue
			}
			if node.ID == ref || node.Path == ref || node.Slug == ref {
				id = node.ID
				break
			}
		}
		if id == "" {
			return structure.MultiScope{}, fmt.Errorf("unknown structure node %q: list them with polterware structure", ref)
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	return structure.MultiScope{NodeIDs: ids, Exact: exact}, nil
}

// LoadNodeScope resolves one scope reference against the project Structure.
func LoadNodeScope(store *storepkg.Store, projectID, ref string, exact bool) (storepkg.NodeScope, error) {
	return LoadNodeScopes(store, projectID, []string{ref}, exact)
}

// LoadNodeScopes resolves several scope references and returns their union.
func LoadNodeScopes(store *storepkg.Store, projectID string, refs []string, exact bool) (storepkg.NodeScope, error) {
	scope, err := ResolveScopeRefs(store, projectID, refs, exact)
	if err != nil {
		return storepkg.NodeScope{}, err
	}
	return store.LoadScopes(projectID, scope)
}

// EntityScopeIndex maps entity id (or inbox item key) to scope_node_id for
// every scoped knowledge item, fact, evidence row, and derived item.
func EntityScopeIndex(store *storepkg.Store, projectID string) (map[string]string, error) {
	out := map[string]string{}
	for _, kind := range []string{storepkg.ScopeKnowledge, storepkg.ScopeFact, storepkg.ScopeEvidence, storepkg.ScopeItem} {
		mapped, err := store.ScopeMap(projectID, kind)
		if err != nil {
			return nil, err
		}
		for id, node := range mapped {
			if node != "" {
				out[id] = node
			}
		}
	}
	return out, nil
}

// FilterChangesByScope keeps changes whose subjects are inside scope, plus
// changes that name no scoped subject. Subjects are the scope_node_id values
// already stored on knowledge, facts, and evidence. A nil set matches everything.
func FilterChangesByScope(resolved storepkg.NodeScope, scopes map[string]string, rows []storepkg.ChangeRow) []storepkg.ChangeRow {
	if resolved.Set == nil {
		return rows
	}
	out := make([]storepkg.ChangeRow, 0, len(rows))
	for _, row := range rows {
		if changeInScope(resolved, scopes, row.PayloadJSON) {
			out = append(out, row)
		}
	}
	return out
}

func changeInScope(resolved storepkg.NodeScope, scopes map[string]string, payload string) bool {
	var body agentrun.ChangePayload
	if err := json.Unmarshal([]byte(payload), &body); err != nil || len(body.SubjectIDs) == 0 {
		return true
	}
	for _, id := range body.SubjectIDs {
		if resolved.Matches(scopes[id]) {
			return true
		}
	}
	return false
}
