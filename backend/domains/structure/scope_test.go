package structure

import "testing"

func scopeNodes() []Node {
	return []Node{
		{ID: "root", Path: "app", Status: NodeActive},
		{ID: "auth", ParentID: "root", Path: "app/auth", Status: NodeActive},
		{ID: "login", ParentID: "auth", Path: "app/auth/login", Status: NodeActive},
		{ID: "gone", ParentID: "auth", Path: "app/auth/gone", Status: NodeRemoved},
		{ID: "orphan", ParentID: "gone", Path: "app/auth/gone/orphan", Status: NodeActive},
		{ID: "billing", ParentID: "root", Path: "app/billing", Status: NodeActive},
		{ID: "invoices", ParentID: "billing", Path: "app/billing/invoices", Status: NodeActive},
	}
}

func has(set ScopeSet, ids ...string) bool {
	for _, id := range ids {
		if !set[id] {
			return false
		}
	}
	return true
}

func TestResolveScopesUnion(t *testing.T) {
	nodes := scopeNodes()
	set := ResolveScopes(nodes, MultiScope{NodeIDs: []string{"login", "billing"}})
	if !has(set, "login", "auth", "root", "billing", "invoices") {
		t.Fatalf("union = %+v", set)
	}
	if set["gone"] || set["orphan"] {
		t.Fatalf("removed subtree leaked: %+v", set)
	}
	single := ResolveScope(nodes, Scope{NodeID: "login"})
	if !has(single, "login", "auth", "root") || single["billing"] || single["invoices"] {
		t.Fatalf("single = %+v", single)
	}
}

func TestResolveScopesParentIncludesChildren(t *testing.T) {
	set := ResolveScopes(scopeNodes(), MultiScope{NodeIDs: []string{"auth"}})
	if !has(set, "auth", "login", "root") || set["gone"] || set["orphan"] || set["billing"] {
		t.Fatalf("parent = %+v", set)
	}
}

func TestResolveScopesExactDropsAncestors(t *testing.T) {
	set := ResolveScopes(scopeNodes(), MultiScope{NodeIDs: []string{"auth", "billing"}, Exact: true})
	if !has(set, "auth", "login", "billing", "invoices") || set["root"] || set["gone"] || set["orphan"] {
		t.Fatalf("exact = %+v", set)
	}
}

func TestResolveScopesSkipsRemovedAndUnknown(t *testing.T) {
	nodes := scopeNodes()
	onlyRemoved := ResolveScopes(nodes, MultiScope{NodeIDs: []string{"gone"}})
	if len(onlyRemoved) != 0 || onlyRemoved == nil {
		t.Fatalf("removed node = %#v", onlyRemoved)
	}
	unknown := ResolveScopes(nodes, MultiScope{NodeIDs: []string{"missing"}})
	if len(unknown) != 0 || unknown == nil {
		t.Fatalf("unknown node = %#v", unknown)
	}
	mixed := ResolveScopes(nodes, MultiScope{NodeIDs: []string{"gone", "invoices", ""}})
	if !has(mixed, "invoices", "billing", "root") || mixed["gone"] || mixed["auth"] || len(mixed) != 3 {
		t.Fatalf("mixed = %+v", mixed)
	}
}

func TestResolveScopesInactiveMatchesEverything(t *testing.T) {
	if got := ResolveScopes(scopeNodes(), MultiScope{}); got != nil {
		t.Fatalf("empty = %#v", got)
	}
	if got := ResolveScopes(scopeNodes(), MultiScope{NodeIDs: []string{"", ""}}); got != nil {
		t.Fatalf("blanks = %#v", got)
	}
}

func TestScopeSetMatchesUnscopedAlways(t *testing.T) {
	var open ScopeSet
	if !open.Matches("auth") || !open.Matches("") {
		t.Fatal("nil set must match every entity, scoped or not")
	}
	empty := ScopeSet{}
	if !empty.Matches("") || empty.Matches("auth") {
		t.Fatal("empty set must match only unscoped entities")
	}
	filtered := ResolveScopes(scopeNodes(), MultiScope{NodeIDs: []string{"auth"}, Exact: true})
	if !filtered.Matches("") || !filtered.Matches("login") || filtered.Matches("billing") {
		t.Fatalf("matches = login:%v billing:%v unscoped:%v", filtered.Matches("login"), filtered.Matches("billing"), filtered.Matches(""))
	}
}
