package drift

import (
	"fmt"

	"github.com/polterware/polterware/backend/domains/canon"
)

func checkEdgeDecisions(rels []RelationshipRef, decisions []AcceptedDecision) []Finding {
	governed := map[string][]AcceptedDecision{}
	for _, decision := range decisions {
		for _, entityID := range decision.EntityIDs {
			governed[entityID] = append(governed[entityID], decision)
		}
	}

	var findings []Finding
	for _, rel := range rels {
		if !isDependencyEdge(rel.Predicate) {
			continue
		}
		if rel.TruthClass != canon.TruthInferred {
			continue
		}
		var hit []AcceptedDecision
		hit = append(hit, governed[rel.SubjectEntityID]...)
		hit = append(hit, governed[rel.ObjectEntityID]...)
		if len(hit) == 0 {
			continue
		}
		decision := hit[0]
		findings = append(findings, Finding{
			Type:       TypeEdgeDecisionConflict,
			Summary:    fmt.Sprintf("Dependency edge without evidence under accepted decision %q", decision.Title),
			Severity:   SeverityConflict,
			SubjectIDs: []string{rel.ID, rel.SubjectEntityID, rel.ObjectEntityID, decision.ID},
			Details: map[string]string{
				"predicate":               rel.Predicate,
				"truth_class":             rel.TruthClass,
				"accepted_decision_id":    decision.ID,
				"accepted_decision_title": decision.Title,
			},
		})
	}
	return findings
}
