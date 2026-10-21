package drift

import (
	"strings"

	"github.com/polterware/polterware/backend/domains/canon"
)

// Check runs the narrow drift rules and returns a stable result.
func Check(input Input) Result {
	findings := make([]Finding, 0)
	if input.ImportReady {
		findings = append(findings, checkImportDeps(input.StoredFacts, input.ParsedDeps)...)
	}
	findings = append(findings, checkEdgeDecisions(input.Relationships, input.AcceptedVerdicts)...)
	findings = append(findings, checkDeclaredObserved(input.StoredFacts)...)
	if input.GitDeliveryReady {
		findings = append(findings, checkCommitTasks(input.DoneTasks, input.TaskCommits, input.WindowCommits)...)
	}

	if input.EntityID != "" {
		findings = filterByEntity(findings, input.EntityID, input.StoredFacts, input.Relationships)
	}

	if findings == nil {
		findings = []Finding{}
	}
	return Result{
		ProjectID: input.ProjectID,
		EntityID:  input.EntityID,
		Status:    "ok",
		Checker:   CheckerNarrow,
		Findings:  findings,
	}
}

func filterByEntity(findings []Finding, entityID string, facts []FactRef, rels []RelationshipRef) []Finding {
	relatedFact := map[string]struct{}{}
	for _, fact := range facts {
		if fact.EntityID == entityID {
			relatedFact[fact.ID] = struct{}{}
		}
	}
	relatedRel := map[string]struct{}{}
	for _, rel := range rels {
		if rel.SubjectEntityID == entityID || rel.ObjectEntityID == entityID {
			relatedRel[rel.ID] = struct{}{}
		}
	}

	out := make([]Finding, 0, len(findings))
	for _, finding := range findings {
		keep := false
		for _, id := range finding.SubjectIDs {
			if id == entityID {
				keep = true
				break
			}
			if _, ok := relatedFact[id]; ok {
				keep = true
				break
			}
			if _, ok := relatedRel[id]; ok {
				keep = true
				break
			}
		}
		if keep {
			out = append(out, finding)
		}
	}
	return out
}

func isImportSource(source string) bool {
	return strings.HasPrefix(source, "import:")
}

func isDependencyEdge(predicate string) bool {
	return canon.IsDependencyPredicate(predicate)
}
