package wedge

import (
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/work"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// queryShow renders one record by id as text: a card (by slug), a Decision
// (by ref or id), a fact (by slug or id), evidence, a doc with its body, a
// Canon entity, or an AgentRun with its steps.
func queryShow(store *storepkg.Store, snapshot work.Snapshot, id string) (string, error) {
	id = strings.TrimSpace(id)
	if card, ok := snapshot.Card(id); ok {
		return polter.EncodeCard(card), nil
	}
	if target, ok := decision.Find(snapshot.Decisions, id); ok {
		return polter.EncodeDecision(target, snapshot.Decisions, polter.NodesCiting(snapshot.Nodes, target)), nil
	}
	for _, fact := range snapshot.Facts {
		if fact.ID != id && (fact.Slug == "" || fact.Slug != id) {
			continue
		}
		var b strings.Builder
		fmt.Fprintf(&b, "fact %s [%s] %s\n", fact.ID, fact.TruthClass, fact.Statement)
		if fact.Slug != "" {
			fmt.Fprintf(&b, "slug: %s\n", fact.Slug)
		}
		if fact.Scope != "" {
			fmt.Fprintf(&b, "scope: %s\n", fact.Scope)
		}
		fmt.Fprintf(&b, "source: %s · actor: %s\n", fact.Source, fact.Actor)
		for _, evidenceID := range fact.Evidence {
			line := "- " + evidenceID
			for _, item := range snapshot.Evidence {
				if item.ID == evidenceID {
					line += fmt.Sprintf(" %s: %s", item.Kind, firstNonEmptyText(item.Path, item.Summary))
				}
			}
			b.WriteString(line + "\n")
		}
		if len(fact.Evidence) == 0 {
			b.WriteString("no evidence: back it with evidence: file:<path>, commit:<sha>, or url:<link>\n")
		}
		return b.String(), nil
	}
	for _, item := range snapshot.Evidence {
		if item.ID == id {
			text := fmt.Sprintf("evidence %s [%s] %s\n", item.ID, item.Kind, item.Summary)
			if item.Path != "" {
				text += "path: " + item.Path + "\n"
			}
			return text + fmt.Sprintf("source: %s · actor: %s · observed %s\n", item.Source, item.Actor, item.ObservedAt.Format("2006-01-02")), nil
		}
	}
	if item, err := store.GetKnowledge(id); err == nil && item.ProjectID == snapshot.ProjectID && !item.Archived() {
		scopes, err := store.ScopeMap(snapshot.ProjectID, storepkg.ScopeKnowledge)
		if err != nil {
			return "", err
		}
		text := fmt.Sprintf("doc %s %q", item.ID, item.Title)
		if item.Kind == knowledge.KindDoc && item.DocType != "" && item.DocType != knowledge.DocTypeDoc {
			text += " (" + item.DocType + ")"
		}
		text += "\n"
		for _, node := range snapshot.Nodes {
			if node.ID == scopes[item.ID] {
				text += "scope: " + node.Path + "\n"
			}
		}
		if len(item.Tags) > 0 {
			text += "tags: " + strings.Join(item.Tags, ", ") + "\n"
		}
		return text + "\n" + strings.TrimRight(item.Body, "\n") + "\n", nil
	}
	if entity, err := store.GetCanonEntity(id); err == nil && entity.ProjectID == snapshot.ProjectID {
		return fmt.Sprintf("entity %s [%s] %s\nref: %s/%s · truth: %s · source: %s\n", entity.ID, entity.Kind, entity.Title, entity.RefKind, entity.RefID, entity.TruthClass, entity.Source), nil
	}
	if record, err := store.GetAgentRunRecord(id); err == nil && record.Run.ProjectID == snapshot.ProjectID {
		run := record.Run
		var b strings.Builder
		fmt.Fprintf(&b, "run %s [%s] %s\nagent: %s · actor: %s · started %s\n", run.ID, run.Status, run.Task, run.AgentLabel, run.ActorKind, run.CreatedAt.Format("2006-01-02 15:04"))
		for _, step := range record.Steps {
			fmt.Fprintf(&b, "- %s %s: %s\n", step.CreatedAt.Format("15:04"), step.Kind, step.Summary)
		}
		return b.String(), nil
	}
	return "", fmt.Errorf("unknown id %q: show takes a card slug, a Decision ref, a fact, evidence, doc, entity, or run id (search <terms> finds them)", id)
}

// queryDrift runs the narrow drift checker and lists its findings, one line each.
func queryDrift(store *storepkg.Store, projectID string) (string, error) {
	result, err := CheckDrift(store, DriftInput{ProjectID: projectID})
	if err != nil {
		return "", err
	}
	if len(result.Findings) == 0 {
		return "no drift findings (" + result.Checker + " checker)\n", nil
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%d drift findings (%s checker); they are advisory, never overwrite truth from one\n", len(result.Findings), result.Checker)
	for _, finding := range result.Findings {
		line := fmt.Sprintf("- %s %s: %s", finding.Severity, finding.Type, finding.Summary)
		if len(finding.SubjectIDs) > 0 {
			line += " [" + strings.Join(finding.SubjectIDs, ", ") + "]"
		}
		b.WriteString(line + "\n")
	}
	return b.String(), nil
}

func firstNonEmptyText(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
