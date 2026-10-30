package polter

import (
	"fmt"
	"slices"
	"strings"

	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
)

// ConflictNode is a `#### conflict slug: Request` block: a request that goes
// against a Rule or a Decision, raised instead of acting against it. Each
// metadata line is one key, so a request or an answer may hold any text.
type ConflictNode struct {
	Line    int
	Ref     string
	Request string
	Meta    []MetaEntry
}

// ConflictMetaKeys are the keys a Conflict block takes.
var ConflictMetaKeys = []string{"rule", "decision", "card", "options", "answer", "status"}

// conflictHeadingPrefix starts a Conflict heading inside `#### `.
const conflictHeadingPrefix = "conflict "

func (n ConflictNode) MetaValue(key string) (string, bool) {
	value, found := "", false
	for _, entry := range n.Meta {
		if entry.Key == key {
			value, found = entry.Value, true
		}
	}
	return value, found
}

// SplitOptions reads "a | b | c" into its trimmed, non-empty parts.
func SplitOptions(value string) []string {
	var options []string
	for _, part := range strings.Split(value, "|") {
		if part = strings.TrimSpace(part); part != "" {
			options = append(options, part)
		}
	}
	return options
}

func (d *decoder) conflictHeading(n int, body string) {
	d.closeCard()
	d.closeNode()
	d.closeDecision()
	d.closeFact()
	d.closeRule()
	d.closeConflict()
	ref, request, _ := strings.Cut(body, ":")
	ref, request = strings.TrimSpace(ref), strings.TrimSpace(request)
	if !work.ValidSlug(ref) {
		d.errorf(n, "invalid conflict slug %q: use lowercase-kebab", ref)
	}
	d.conflict = &ConflictNode{Line: n, Ref: ref, Request: request}
	d.inMeta = true
}

func (d *decoder) conflictLine(n int, line string) {
	if line == "" {
		return
	}
	m := metaKey.FindStringSubmatch(line)
	if m == nil {
		d.errorf(n, "Conflicts use a heading request and rule:, decision:, card:, options:, answer:, or status: lines")
		return
	}
	key, value := m[1], strings.TrimSpace(m[2])
	if !slices.Contains(ConflictMetaKeys, key) {
		d.errorf(n, "unknown conflict key %q: use %s", key, strings.Join(ConflictMetaKeys, ", "))
		return
	}
	if key == "status" {
		value = strings.ToLower(value)
		if value != work.ConflictOpen && value != work.ConflictWithdrawn {
			d.errorf(n, "unknown conflict status %q: use open or withdrawn (a person decides with answer:)", value)
			return
		}
	}
	d.conflict.Meta = append(d.conflict.Meta, MetaEntry{Key: key, Value: value, Line: n})
}

func (d *decoder) closeConflict() {
	if d.conflict == nil {
		return
	}
	d.doc.Conflicts = append(d.doc.Conflicts, *d.conflict)
	d.conflict = nil
	d.intent = nil
	d.inMeta = false
}

// planConflicts writes the Conflict blocks. A new slug raises one: it needs
// the request and the Rule or Decision it goes against. A known slug updates
// it; answer: decides it and status: withdrawn drops it.
func (p *planner) planConflicts(doc Document) {
	for _, node := range doc.Conflicts {
		failed := p.failed(node.Line)
		for _, entry := range node.Meta {
			failed = failed || p.failed(entry.Line)
		}
		if failed {
			continue
		}
		fields := map[string]any{}
		if ref, ok := node.MetaValue("rule"); ok && ref != "" {
			index := slices.IndexFunc(p.rules, func(rule work.Rule) bool { return rule.ID == ref || rule.Slug == ref })
			if index < 0 {
				p.errorf(node.Line, "unknown rule %q: use a Rule slug or id (polterware query rules)", ref)
				continue
			}
			fields["rule_id"] = p.rules[index].ID
		}
		if ref, ok := node.MetaValue("decision"); ok && ref != "" {
			found, ok := decision.Find(p.snapshot.Decisions, ref)
			if !ok {
				p.errorf(node.Line, "unknown decision %q: use a Decision number or id", ref)
				continue
			}
			fields["decision_id"] = found.ID
		}
		if slug, ok := node.MetaValue("card"); ok && slug != "" {
			if _, ok := p.snapshot.Card(slug); !ok {
				p.errorf(node.Line, "unknown card %q", slug)
				continue
			}
			fields["card"] = slug
		}
		if value, ok := node.MetaValue("options"); ok {
			options := SplitOptions(value)
			if options == nil {
				options = []string{}
			}
			fields["options"] = options
		}
		answer, hasAnswer := node.MetaValue("answer")
		status, hasStatus := node.MetaValue("status")

		current, exists := p.snapshot.Conflict(node.Ref)
		if !exists {
			if node.Request == "" {
				p.errorf(node.Line, "unknown conflict %q: add the request (#### conflict %s: Request)", node.Ref, node.Ref)
				continue
			}
			if fields["rule_id"] == nil && fields["decision_id"] == nil {
				p.errorf(node.Line, "conflict %q needs the rule: or decision: it goes against", node.Ref)
				continue
			}
			if hasAnswer || (hasStatus && status == work.ConflictWithdrawn) {
				p.errorf(node.Line, "unknown conflict %q: raise it before deciding or withdrawing it", node.Ref)
				continue
			}
			fields["slug"], fields["request"] = node.Ref, node.Request
			id := ids.NewULID()
			p.snapshot.Conflicts = append(p.snapshot.Conflicts, work.Conflict{ID: id, Slug: node.Ref, Request: node.Request, State: work.ConflictOpen})
			p.ops = append(p.ops, work.Op{Entity: work.EntityConflict, Kind: work.OpCreate, EntityID: id, CardSlug: node.Ref, Label: node.Request, Fields: fields})
			continue
		}
		before := map[string]any{}
		if node.Request != "" && node.Request != current.Request {
			fields["request"], before["request"] = node.Request, current.Request
		}
		kind := work.OpUpdate
		switch {
		case hasAnswer:
			if answer == "" {
				p.errorf(node.Line, "answer: is empty: write the decision")
				continue
			}
			fields["answer"], before["answer"] = answer, current.Answer
			fields["state"], before["state"] = work.ConflictDecided, current.State
		case hasStatus && status != current.State:
			fields["state"], before["state"] = status, current.State
			if status == work.ConflictWithdrawn {
				kind = work.OpRemove
			} else {
				fields["answer"], before["answer"] = "", current.Answer
			}
		}
		if len(fields) == 0 {
			continue
		}
		p.ops = append(p.ops, work.Op{Entity: work.EntityConflict, Kind: kind, EntityID: current.ID, CardSlug: current.Slug, Label: current.Request, Fields: fields, Before: before})
	}
}

// ConflictText is the Polter text that decides a Conflict with an answer.
func ConflictText(slug, answer, summary, rationale string) string {
	return "---\npolter: 1\nsummary: " + summary + "\nrationale: " + rationale + "\n---\n\n#### " + conflictHeadingPrefix + slug + "\nanswer: " + answer + "\n"
}

// ConflictAgainst names what a Conflict goes against: the Rule's statement
// and the Decision's title, empty when it names none or the record is gone.
func ConflictAgainst(conflict work.Conflict, snapshot work.Snapshot) (rule work.Rule, decisionTitle string) {
	for _, candidate := range snapshot.Rules {
		if candidate.ID == conflict.RuleID {
			rule = candidate
		}
	}
	for _, candidate := range snapshot.Decisions {
		if candidate.ID == conflict.Decision {
			decisionTitle = candidate.Title
		}
	}
	return rule, decisionTitle
}

// EncodeConflict renders one Conflict as a Polter block with its state, what
// it goes against, and the answer once a person decided it.
func EncodeConflict(conflict work.Conflict, snapshot work.Snapshot) string {
	var b strings.Builder
	fmt.Fprintf(&b, "#### %s%s: %s\nstate: %s\n", conflictHeadingPrefix, conflict.Slug, conflict.Request, conflict.State)
	rule, decisionTitle := ConflictAgainst(conflict, snapshot)
	if rule.ID != "" {
		fmt.Fprintf(&b, "rule: %s (%s)\n", rule.Handle(), rule.Statement)
	}
	if decisionTitle != "" {
		fmt.Fprintf(&b, "decision: %s\n", decisionTitle)
	}
	if conflict.CardSlug != "" {
		fmt.Fprintf(&b, "card: %s\n", conflict.CardSlug)
	}
	if len(conflict.Options) > 0 {
		fmt.Fprintf(&b, "options: %s\n", strings.Join(conflict.Options, " | "))
	}
	if conflict.Answer != "" {
		fmt.Fprintf(&b, "answer: %s\n", conflict.Answer)
	}
	return b.String()
}

// EncodeConflicts lists the open Conflicts, then the decided ones, one line each.
func EncodeConflicts(snapshot work.Snapshot) string {
	var open, decided []string
	for _, conflict := range snapshot.Conflicts {
		switch conflict.State {
		case work.ConflictOpen:
			open = append(open, fmt.Sprintf("- %s: %s", conflict.Slug, conflict.Request))
		case work.ConflictDecided:
			decided = append(decided, fmt.Sprintf("- %s: %s -> %s", conflict.Slug, conflict.Request, conflict.Answer))
		}
	}
	if len(open)+len(decided) == 0 {
		return "No conflicts.\n"
	}
	var b strings.Builder
	if len(open) > 0 {
		b.WriteString("Open conflicts:\n" + strings.Join(open, "\n") + "\n")
	}
	if len(decided) > 0 {
		b.WriteString("Decided conflicts:\n" + strings.Join(decided, "\n") + "\n")
	}
	return b.String()
}

// EncodeStatusConflicts lists the Conflicts a person decided since a time, so
// an agent picks up the answers at its next status read.
func EncodeStatusConflicts(snapshot work.Snapshot, since string) string {
	var b strings.Builder
	for _, conflict := range snapshot.Conflicts {
		if conflict.State == work.ConflictDecided && conflict.DecidedAt >= since {
			fmt.Fprintf(&b, "conflict decided: %s: %s -> %s\n", conflict.Slug, conflict.Request, conflict.Answer)
		}
	}
	return b.String()
}
