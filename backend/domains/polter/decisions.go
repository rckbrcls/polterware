package polter

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
)

// planDecisions turns decision blocks into Verdict ops. Existing decisions move
// through the lifecycle; `new` proposes one; `supersedes:` on the newer
// decision marks the older one superseded in the same batch.
func (p *planner) planDecisions(doc Document) {
	if len(doc.Decisions) == 0 {
		return
	}
	// state tracks the decisions this text changes, by id.
	state := map[string]decision.Decision{}
	list := func() []decision.Decision {
		out := make([]decision.Decision, 0, len(p.snapshot.Decisions))
		for _, d := range p.snapshot.Decisions {
			if changed, ok := state[d.ID]; ok {
				d = changed
			}
			out = append(out, d)
		}
		for _, d := range state {
			found := false
			for _, e := range out {
				found = found || e.ID == d.ID
			}
			if !found {
				out = append(out, d)
			}
		}
		return out
	}
	for _, node := range doc.Decisions {
		if p.failed(node.Line) {
			continue
		}
		if strings.EqualFold(node.Ref, DecisionNewRef) {
			p.createDecision(node, state, list)
			continue
		}
		current, ok := decision.Find(list(), node.Ref)
		if !ok {
			p.errorf(node.Line, "unknown decision %q: use an Verdict number, id, or ### new: Title to propose one", node.Ref)
			continue
		}
		p.updateDecision(node, current, state, list)
	}
}

func (p *planner) createDecision(node DecisionNode, state map[string]decision.Decision, list func() []decision.Decision) {
	if node.Title == "" {
		p.errorf(node.Line, `a new decision needs a title: write "### new: Title"`)
		return
	}
	all := list()
	title := node.Title
	if n, ok := decision.Number(title); ok {
		for _, d := range all {
			if m, ok := decision.Number(d.Title); ok && m == n {
				p.errorf(node.Line, "Verdict number %d is taken by %q: omit the number and it is assigned", n, d.Title)
				return
			}
		}
	} else {
		title = decision.TitleFor(decision.NextNumber(all), title)
	}
	status, hasStatus := node.MetaValue("status")
	supersedes, hasSupersedes := node.MetaValue("supersedes")
	if !hasStatus {
		status = decision.StateProposed
		if hasSupersedes {
			status = decision.StateActive
		}
	}
	if status != decision.StateProposed && status != decision.StateActive {
		p.errorf(node.Line, "a new decision starts proposed or active, not %s", status)
		return
	}
	if hasSupersedes && status != decision.StateActive {
		p.errorf(node.Line, "supersedes needs status: active on the new decision")
		return
	}
	trigger, _ := node.MetaValue("trigger")
	reason, _ := node.MetaValue("reason")
	scope, _ := node.MetaValue("scope")
	id := ids.NewULID()
	created := decision.Decision{ID: id, Title: title, Status: status, Scope: scope, Meta: decision.Meta{ReviewTrigger: trigger}}
	state[id] = created
	p.ops = append(p.ops, work.Op{
		Entity: work.EntityDecision, Kind: work.OpCreate, EntityID: id, CardSlug: title, Label: title,
		Fields: map[string]any{
			"title": title, "body": node.Body, "status": status,
			"review_trigger": trigger, "scope": scope,
		},
	})
	if hasSupersedes {
		p.supersede(node, supersedes, created, reason, state, list)
	}
}

func (p *planner) updateDecision(node DecisionNode, current decision.Decision, state map[string]decision.Decision, list func() []decision.Decision) {
	fields, before := map[string]any{}, map[string]any{}
	set := func(key string, old, value any) {
		fields[key], before[key] = value, old
	}
	updated := current
	status, hasStatus := node.MetaValue("status")
	supersedes, hasSupersedes := node.MetaValue("supersedes")
	reason, hasReason := node.MetaValue("reason")
	if !hasStatus && hasSupersedes && decision.Normalize(current.Status) == decision.StateProposed {
		status, hasStatus = decision.StateActive, true
	}
	if hasStatus && status != decision.Normalize(current.Status) {
		switch {
		case status == decision.StateSuperseded:
			p.errorf(node.Line, "%s is superseded by naming it in the newer decision: write supersedes: %s there", current.Title, decisionHandle(current))
			return
		case !decision.CanTransition(current.Status, status):
			p.errorf(node.Line, "%s cannot move %s → %s: %s", current.Title, decision.Normalize(current.Status), status, transitionHint(current.Status))
			return
		case status == decision.StateChallenged && strings.TrimSpace(reason) == "" && !hasReason:
			p.errorf(node.Line, "challenging %s needs a reason: add reason: <why it is under review>", current.Title)
			return
		}
		set("status", decision.Normalize(current.Status), status)
		updated.Status = status
	}
	if hasSupersedes && decision.Normalize(updated.Status) != decision.StateActive {
		p.errorf(node.Line, "%s must be active to supersede another decision", current.Title)
		return
	}
	if trigger, ok := node.MetaValue("trigger"); ok && trigger != current.ReviewTrigger {
		set("review_trigger", current.ReviewTrigger, trigger)
		updated.ReviewTrigger = trigger
	}
	if scope, ok := node.MetaValue("scope"); ok && scope != current.Scope {
		set("scope", current.Scope, scope)
		updated.Scope = scope
	}
	if hasReason && hasStatus && reason != current.StatusReason {
		set("status_reason", current.StatusReason, reason)
		updated.StatusReason = reason
	}
	if node.BodySet {
		set("body", "", node.Body)
	}
	if node.Title != "" && node.Title != current.Title {
		set("title", current.Title, node.Title)
		updated.Title = node.Title
	}
	if len(fields) > 0 {
		state[current.ID] = updated
		p.ops = append(p.ops, work.Op{
			Entity: work.EntityDecision, Kind: work.OpUpdate, EntityID: current.ID, CardSlug: current.Title,
			Label: updated.Title, Fields: fields, Before: before,
		})
	}
	if hasSupersedes {
		p.supersede(node, supersedes, updated, reason, state, list)
	}
}

// supersede marks the decision named by target as superseded by newer.
func (p *planner) supersede(node DecisionNode, target string, newer decision.Decision, reason string, state map[string]decision.Decision, list func() []decision.Decision) {
	all := list()
	old, ok := decision.Find(all, target)
	if !ok {
		p.errorf(node.Line, "unknown decision %q in supersedes: no Verdict with that number or id", target)
		return
	}
	if decision.Normalize(old.Status) == decision.StateSuperseded {
		if old.SupersededBy != newer.ID {
			p.errorf(node.Line, "%s is already superseded: cite its successor instead", old.Title)
		}
		return
	}
	if !decision.CanTransition(old.Status, decision.StateSuperseded) {
		p.errorf(node.Line, "%s is %s and cannot be superseded: activate it first", old.Title, decision.Normalize(old.Status))
		return
	}
	if err := decision.CheckSupersede(all, old.ID, newer.ID); err != nil {
		p.errorf(node.Line, "%s", err)
		return
	}
	fields := map[string]any{"status": decision.StateSuperseded, "superseded_by": newer.ID}
	before := map[string]any{"status": decision.Normalize(old.Status), "superseded_by": old.SupersededBy}
	if reason != "" {
		fields["status_reason"], before["status_reason"] = reason, old.StatusReason
	}
	old.Status, old.SupersededBy = decision.StateSuperseded, newer.ID
	state[old.ID] = old
	p.ops = append(p.ops, work.Op{
		Entity: work.EntityDecision, Kind: work.OpUpdate, EntityID: old.ID, CardSlug: old.Title,
		Label: old.Title, Fields: fields, Before: before,
	})
}

func decisionHandle(d decision.Decision) string {
	if n, ok := decision.Number(d.Title); ok {
		return fmt.Sprintf("Verdict-%04d", n)
	}
	return d.ID
}

func transitionHint(from string) string {
	switch decision.Normalize(from) {
	case decision.StateProposed:
		return "a proposal is activated first (status: active)"
	case decision.StateSuperseded:
		return "a superseded decision is final: propose a new one instead"
	default:
		return "legal moves are proposed → active → challenged → active|superseded"
	}
}

func decisionBinding(status string) bool { return decision.Binding(status) }

func decisionState(status string) string { return decision.Normalize(status) }

// EncodeDecisions lists decisions, one line each, optionally only those in
// state. A header counts every state so the whole lifecycle is visible.
func EncodeDecisions(decisions []decision.Decision, state string) string {
	counts := map[string]int{}
	for _, d := range decisions {
		counts[decision.Normalize(d.Status)]++
	}
	var header []string
	for _, s := range decision.States {
		header = append(header, fmt.Sprintf("%s %d", s, counts[s]))
	}
	var b strings.Builder
	b.WriteString("decisions: " + strings.Join(header, " · ") + "\n")
	shown := 0
	for _, d := range decisions {
		s := decision.Normalize(d.Status)
		if state != "" && s != state {
			continue
		}
		shown++
		line := fmt.Sprintf("- %s · %s", d.Title, s)
		if d.ReviewTrigger != "" && decision.Binding(s) {
			line += " · review when: " + d.ReviewTrigger
		}
		if d.SupersededBy != "" {
			if next, ok := decision.Find(decisions, d.SupersededBy); ok {
				line += " · superseded by " + decisionHandle(next)
			}
		}
		b.WriteString(line + "\n")
	}
	if shown == 0 {
		b.WriteString("(none)\n")
	}
	return b.String()
}

// EncodeDecision renders one decision as a Polter block plus its chain and
// the Structure nodes that cite it.
func EncodeDecision(target decision.Decision, all []decision.Decision, nodePaths []string) string {
	node := DecisionNode{Ref: decisionHandle(target), Body: target.Body}
	if _, ok := decision.Number(target.Title); ok {
		node.Title = strings.TrimSpace(titlePrefixRE.ReplaceAllString(target.Title, ""))
	} else {
		node.Title = target.Title
	}
	add := func(key, value string) {
		if value != "" {
			node.Meta = append(node.Meta, MetaEntry{Key: key, Value: value})
		}
	}
	add("status", decision.Normalize(target.Status))
	add("trigger", target.ReviewTrigger)
	add("scope", target.Scope)
	add("reason", target.StatusReason)
	var b strings.Builder
	b.WriteString(Header)
	b.WriteString("\n")
	writeDecision(&b, node)
	var notes []string
	for _, d := range all {
		if d.SupersededBy == target.ID {
			notes = append(notes, "supersedes: "+decisionHandle(d))
		}
	}
	if next, ok := decision.Find(all, target.SupersededBy); ok {
		notes = append(notes, "superseded by: "+decisionHandle(next))
	}
	if len(nodePaths) > 0 {
		notes = append(notes, "governs: "+strings.Join(nodePaths, ", "))
	}
	if len(notes) > 0 {
		b.WriteString("\n" + strings.Join(notes, "\n") + "\n")
	}
	return b.String()
}

var titlePrefixRE = regexp.MustCompile(`(?i)^\s*verdict[\s\-_]*\d+\s*[:.\-–—]?\s*`)

// NodesCiting returns the paths of active Structure nodes whose decisions: cite d.
func NodesCiting(nodes []structure.Node, d decision.Decision) []string {
	var paths []string
	for _, node := range nodes {
		if node.Status == structure.NodeRemoved {
			continue
		}
		for _, ref := range node.Decisions {
			if CitesDecision(ref, d.ID, d.Title) {
				paths = append(paths, node.Path)
				break
			}
		}
	}
	return paths
}

// DecisionInput is one lifecycle change composed by the CLI and the Desktop.
type DecisionInput struct {
	// Ref is `new` or an Verdict number, id, or title.
	Ref        string
	Title      string
	Status     string
	Supersedes string
	Trigger    string
	Reason     string
	Body       string
}

// ComposeDecision renders the Polter text for one decision change with the
// given change summary and rationale. Metadata values are flattened so they
// cannot end their line early.
func ComposeDecision(in DecisionInput, summary, rationale string) string {
	node := DecisionNode{Ref: in.Ref, Title: flatten(in.Title), Body: strings.TrimSpace(in.Body)}
	add := func(key, value string) {
		if value = flatten(value); value != "" {
			node.Meta = append(node.Meta, MetaEntry{Key: key, Value: value})
		}
	}
	add("status", in.Status)
	add("supersedes", in.Supersedes)
	add("trigger", in.Trigger)
	add("reason", in.Reason)
	return Format(Document{Summary: flatten(summary), Rationale: flatten(rationale), Decisions: []DecisionNode{node}})
}

// flatten makes a value safe for a `key: value` metadata line.
func flatten(value string) string {
	value = strings.Join(strings.Fields(value), " ")
	value = strings.ReplaceAll(value, " · ", ", ")
	value = strings.ReplaceAll(value, " • ", ", ")
	return strings.ReplaceAll(value, " - ", " – ")
}
