package wedge

import (
	"fmt"
	"slices"
	"strings"

	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/work"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// queryShow renders one record by id as text: a card (by slug), a Decision
// (by ref or id), a fact or Rule (by slug or id), a doc with its body, a
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
		if len(fact.Scopes) > 0 {
			fmt.Fprintf(&b, "scope: %s\n", strings.Join(fact.Scopes, ", "))
		}
		fmt.Fprintf(&b, "source: %s · actor: %s\n", fact.Source, fact.Actor)
		return b.String(), nil
	}
	for _, rule := range snapshot.Rules {
		if rule.ID != id && (rule.Slug == "" || rule.Slug != id) {
			continue
		}
		text := fmt.Sprintf("rule %s %s\n", rule.Handle(), rule.Statement)
		if len(rule.Scopes) > 0 {
			return text + "scope: " + strings.Join(rule.Scopes, ", ") + "\n", nil
		}
		return text + "scope: whole project\n", nil
	}
	if item, err := store.GetKnowledge(id); err == nil && item.ProjectID == snapshot.ProjectID && !item.Archived() {
		scopes, err := store.ScopeMap(snapshot.ProjectID, storepkg.ScopeKnowledge)
		if err != nil {
			return "", err
		}
		text := fmt.Sprintf("doc %s %q", item.ID, item.Title)
		text += "\n"
		var paths []string
		for _, node := range snapshot.Nodes {
			if slices.Contains(scopes[item.ID], node.ID) {
				paths = append(paths, node.Path)
			}
		}
		if len(paths) > 0 {
			slices.Sort(paths)
			text += "scope: " + strings.Join(paths, ", ") + "\n"
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
	return "", fmt.Errorf("unknown id %q: show takes a card slug, a Decision ref, a fact, rule, doc, entity, or run id (search <terms> finds them)", id)
}

// queryCommits lists a card's commits, one line each: task, short sha,
// subject, and the GitHub URL when there is one.
func queryCommits(store *storepkg.Store, projectID, slug string) (string, error) {
	commits, err := CardCommits(store, projectID, slug)
	if err != nil {
		return "", err
	}
	if len(commits) == 0 {
		return "no commits for " + slug + ": cite `" + slug + "#T2` in a commit subject, or run polterware task done " + slug + "#T2 --commit <sha>\n", nil
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%d commits for %s\n", len(commits), slug)
	for _, commit := range commits {
		line := fmt.Sprintf("- T%d %s %s", commit.TaskNumber, commit.ShortSHA(), commit.Subject)
		if commit.URL != "" {
			line += " " + commit.URL
		}
		b.WriteString(line + "\n")
	}
	return b.String(), nil
}
