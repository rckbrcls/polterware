package drift

import (
	"fmt"

	"github.com/polterware/polterware/backend/domains/canon"
)

func checkEdgeDecisions(rels []RelationshipRef, verdicts []AcceptedVerdict) []Finding {
	governed := map[string][]AcceptedVerdict{}
	for _, verdict := range verdicts {
		for _, entityID := range verdict.EntityIDs {
			governed[entityID] = append(governed[entityID], verdict)
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
		var hit []AcceptedVerdict
		hit = append(hit, governed[rel.SubjectEntityID]...)
		hit = append(hit, governed[rel.ObjectEntityID]...)
		if len(hit) == 0 {
			continue
		}
		verdict := hit[0]
		findings = append(findings, Finding{
			Type:       TypeEdgeDecisionConflict,
			Summary:    fmt.Sprintf("Dependency edge without evidence under accepted decision %q", verdict.Title),
			Severity:   SeverityConflict,
			SubjectIDs: []string{rel.ID, rel.SubjectEntityID, rel.ObjectEntityID, verdict.ID},
			Details: map[string]string{
				"predicate":         rel.Predicate,
				"truth_class":       rel.TruthClass,
				"accepted_verdict_id":   verdict.ID,
				"accepted_verdict_title": verdict.Title,
			},
		})
	}
	return findings
}
