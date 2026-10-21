package drift

import (
	"strings"

	"github.com/polterware/polterware/backend/domains/canon"
)

func checkDeclaredObserved(facts []FactRef) []Finding {
	byEntity := map[string][]FactRef{}
	for _, fact := range facts {
		if fact.EntityID == "" {
			continue
		}
		byEntity[fact.EntityID] = append(byEntity[fact.EntityID], fact)
	}

	var findings []Finding
	for entityID, group := range byEntity {
		var declared, observed []FactRef
		for _, fact := range group {
			switch fact.TruthClass {
			case canon.TruthDeclared:
				declared = append(declared, fact)
			case canon.TruthObserved:
				observed = append(observed, fact)
			}
		}
		if len(declared) == 0 || len(observed) == 0 {
			continue
		}
		for _, d := range declared {
			for _, o := range observed {
				if !statementsConflict(d.Statement, o.Statement) {
					continue
				}
				findings = append(findings, Finding{
					Type:        TypeDeclaredObservedConflict,
					Summary:     "Declared fact conflicts with observed fact on the same entity",
					Severity:    SeverityConflict,
					SubjectIDs:  []string{entityID, d.ID, o.ID},
					EvidenceIDs: append(append([]string{}, d.EvidenceIDs...), o.EvidenceIDs...),
					Details: map[string]string{
						"declared_statement": d.Statement,
						"observed_statement": o.Statement,
					},
				})
			}
		}
	}
	return findings
}

// statementsConflict is a narrow deterministic check: shared topic prefix with different value.
func statementsConflict(declared, observed string) bool {
	dTopic, dValue := splitTopicValue(declared)
	oTopic, oValue := splitTopicValue(observed)
	if dTopic == "" || oTopic == "" || dValue == "" || oValue == "" {
		return false
	}
	if dTopic != oTopic {
		return false
	}
	return dValue != oValue
}

func splitTopicValue(statement string) (topic, value string) {
	normalized := strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(statement))), " ")
	if normalized == "" {
		return "", ""
	}
	separators := []string{" is ", " requires ", " uses ", " dependency ", " devdependency "}
	for _, sep := range separators {
		if idx := strings.Index(normalized, sep); idx >= 0 {
			topic = strings.TrimSpace(normalized[:idx])
			value = strings.TrimSpace(normalized[idx+len(sep):])
			return topic, value
		}
	}
	// Fallback: last token is value, rest is topic (needs at least two tokens).
	parts := strings.Fields(normalized)
	if len(parts) < 2 {
		return "", ""
	}
	return strings.Join(parts[:len(parts)-1], " "), parts[len(parts)-1]
}
