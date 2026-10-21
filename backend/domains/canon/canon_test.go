package canon

import "testing"

func TestEntityIDStable(t *testing.T) {
	a := EntityID("proj", RefArchitectureNode, "n-gw")
	b := EntityID("proj", RefArchitectureNode, "n-gw")
	if a != b || a == "" {
		t.Fatalf("expected stable id, got %q %q", a, b)
	}
}

func TestParseLayoutNodesLegacyAndV1(t *testing.T) {
	legacy := `{"nodes":[{"id":"n-gw","label":"API Gateway","kind":"resource"}]}`
	nodes := ParseLayoutNodes(legacy)
	if len(nodes) != 1 || nodes[0].ID != "n-gw" || nodes[0].Title != "API Gateway" {
		t.Fatalf("legacy parse: %+v", nodes)
	}
	v1 := `{"formatVersion":1,"nodes":[{"id":"n-pg","name":"PostgreSQL","type":"database"}]}`
	nodes = ParseLayoutNodes(v1)
	if len(nodes) != 1 || nodes[0].Title != "PostgreSQL" {
		t.Fatalf("v1 parse: %+v", nodes)
	}
}

func TestParseLayoutEdgesLegacyAndV1(t *testing.T) {
	legacy := `{"edges":[{"id":"e1","from":"n-gw","to":"n-pg","kind":"depends_on","evidence":false}]}`
	edges := ParseLayoutEdges(legacy)
	if len(edges) != 1 || edges[0].Predicate != PredDependsOn || edges[0].Evidence {
		t.Fatalf("legacy edges: %+v", edges)
	}
	v1 := `{"relationships":[{"sourceNodeId":"n-gw","targetNodeId":"n-auth","type":"calls","evidence":true}]}`
	edges = ParseLayoutEdges(v1)
	if len(edges) != 1 || edges[0].Predicate != PredCalls || !edges[0].Evidence {
		t.Fatalf("v1 relationships: %+v", edges)
	}
	related := ParseLayoutEdges(`{"edges":[{"from":"a","to":"b","kind":"related"}]}`)
	if len(related) != 1 || related[0].Predicate != PredRelatedTo || !related[0].Evidence {
		t.Fatalf("related default evidence: %+v", related)
	}
}

func TestPredicateForCanvasType(t *testing.T) {
	if PredicateForCanvasType("stores_in") != PredDependsOn {
		t.Fatal("stores_in")
	}
	if PredicateForCanvasType("routes_to") != PredCalls {
		t.Fatal("routes_to")
	}
	if PredicateForCanvasType("custom") != PredRelatedTo {
		t.Fatal("custom")
	}
}

func TestDefaultPredicateForKnowledge(t *testing.T) {
	if DefaultPredicateForKnowledge("runbook") != PredOperates {
		t.Fatal("runbook")
	}
	if DefaultPredicateForKnowledge("doc") != PredDocuments {
		t.Fatal("doc")
	}
}
