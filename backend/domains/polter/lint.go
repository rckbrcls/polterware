package polter

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/work"
)

// References is what reference-level lint checks against. A nil *References
// means the project could not be resolved and only syntax is checked.
type References struct {
	// Verdicts holds each Verdict's knowledge id and title.
	Verdicts []VerdictRef
	// Cards is the project's current Work graph, for similarity hints.
	Cards []work.Card
	// Nodes are the project's Structure nodes. Card under: is checked once any
	// component exists.
	Nodes []structure.Node
	// Repos names the project's registered checkouts. Node repo: and task
	// [repo: …] must name one; empty is the project root.
	Repos []string
	// Environments are the project's environments. deploys: names one by id
	// or by name.
	Environments []work.NamedEnvironment
	Evidence     []canon.Evidence
	// Git is the local repository view used to hint on handoff mismatches.
	// Nil skips that check.
	Git *GitView
}

type VerdictRef struct {
	ID    string
	Title string
	// Status is the Verdict knowledge status (proposed, accepted, …).
	Status string
}

var verdictNumber = regexp.MustCompile(`(?i)\b(?:adr|verdict)[\s\-_]*0*(\d+)\b`)

// Lint decodes text and runs syntax checks, plus reference checks and
// similarity hints when refs is set. It returns the decoded document so callers can continue to Plan.
func Lint(text string, refs *References) (Document, []Diagnostic) {
	doc, diags := Decode(text)
	if refs != nil {
		diags = append(diags, checkReferences(doc, *refs)...)
		diags = append(diags, checkFactEvidence(doc, refs.Evidence)...)
		diags = append(diags, CheckGraph(doc, refs.Nodes, refs.Cards)...)
		diags = append(diags, CheckRepos(doc, refs.Repos)...)
		diags = append(diags, CheckDeploys(doc, refs.Environments)...)
		diags = append(diags, checkHints(doc, refs.Cards)...)
		diags = append(diags, stageHints(doc, refs.Cards)...)
		diags = append(diags, architectureHints(doc, refs.Cards, refs.Nodes)...)
		if refs.Git != nil {
			diags = append(diags, HandoffHints(doc, *refs.Git)...)
		}
	}
	return doc, diags
}

func checkReferences(doc Document, refs References) []Diagnostic {
	known := map[string]bool{}
	numbers := map[int]bool{}
	for _, verdict := range refs.Verdicts {
		known[strings.ToLower(verdict.ID)] = true
		if n, ok := parseVerdictNumber(verdict.Title); ok {
			numbers[n] = true
		}
	}
	// stale hints at a cited decision that no longer settles the question.
	stale := func(line int, ref string) []Diagnostic {
		for _, verdict := range refs.Verdicts {
			if !CitesDecision(ref, verdict.ID, verdict.Title) || decisionBinding(verdict.Status) {
				continue
			}
			state := decisionState(verdict.Status)
			message := fmt.Sprintf("decision %s is %s", verdict.Title, state)
			if state == "superseded" {
				message += ": cite its successor"
			}
			return []Diagnostic{{Line: line, Severity: SeverityHint, Message: message}}
		}
		return nil
	}
	var diags []Diagnostic
	for _, card := range doc.Cards {
		for _, entry := range card.Meta {
			if entry.Key != "decisions" {
				continue
			}
			for _, ref := range splitList(entry.Value) {
				if known[strings.ToLower(ref)] {
					diags = append(diags, stale(entry.Line, ref)...)
					continue
				}
				if n, ok := parseVerdictNumber(ref); ok && numbers[n] {
					diags = append(diags, stale(entry.Line, ref)...)
					continue
				}
				diags = append(diags, Diagnostic{
					Line:     entry.Line,
					Severity: SeverityError,
					Message:  fmt.Sprintf("unknown decision %q: no Verdict with that number or id in this project", ref),
				})
			}
		}
	}
	return diags
}

// CheckRepos reports node repo: and task repo values that name no
// registered checkout.
func CheckRepos(doc Document, repos []string) []Diagnostic {
	known := map[string]bool{"": true}
	for _, repo := range repos {
		known[repo] = true
	}
	unknown := func(line int, repo string) Diagnostic {
		return Diagnostic{
			Line: line, Severity: SeverityError,
			Message: fmt.Sprintf("unknown repo %q: register it with polterware repo add --name %s --path <dir>", repo, repo),
		}
	}
	var diags []Diagnostic
	for _, node := range doc.Nodes {
		for _, entry := range node.Meta {
			if entry.Key == "repo" && !known[entry.Value] {
				diags = append(diags, unknown(entry.Line, entry.Value))
			}
		}
	}
	for _, card := range doc.Cards {
		for _, task := range card.Tasks {
			if !known[task.Repo] {
				diags = append(diags, unknown(task.Line, task.Repo))
			}
		}
	}
	return diags
}

// ParseVerdictNumber reads the number from "Verdict 0008", "Verdict-8", or a title.
func ParseVerdictNumber(value string) (int, bool) {
	return parseVerdictNumber(value)
}

func parseVerdictNumber(value string) (int, bool) {
	m := verdictNumber.FindStringSubmatch(value)
	if m == nil {
		return 0, false
	}
	n, err := strconv.Atoi(m[1])
	return n, err == nil
}

// architectureHints reminds that a delivered Architecture Change should clear
// the migrating: state of the node it changes.
func architectureHints(doc Document, cards []work.Card, nodes []structure.Node) []Diagnostic {
	stored := map[string]work.Card{}
	for _, card := range cards {
		stored[card.Slug] = card
	}
	var diags []Diagnostic
	for _, card := range doc.Cards {
		stage, hasStage := card.MetaValue("stage")
		if !hasStage || stage != work.StageDelivered {
			continue
		}
		kind, hasKind := card.MetaValue("kind")
		under, hasUnder := card.MetaValue("under")
		if prev, ok := stored[card.Slug]; ok {
			if !hasKind {
				kind = prev.Kind
			}
			if !hasUnder {
				under = prev.Under
			}
		}
		if kind != work.KindArchitecture || under == "" {
			continue
		}
		for _, node := range nodes {
			if node.Path == under && node.Status != structure.NodeRemoved && node.Migrating() && !clearsMigration(doc, under) {
				diags = append(diags, Diagnostic{
					Line: card.Line, Severity: SeverityHint,
					Message: fmt.Sprintf("architecture change %s is delivered but node %s is still migrating %s -> %s: clear migrating: on it", card.Slug, under, node.MigrationFrom, node.MigrationTo),
				})
			}
		}
	}
	return diags
}

func clearsMigration(doc Document, path string) bool {
	for _, node := range doc.Nodes {
		if node.Path != path {
			continue
		}
		if value, ok := node.MetaValue("migrating"); ok && strings.TrimSpace(value) == "" {
			return true
		}
	}
	return false
}
