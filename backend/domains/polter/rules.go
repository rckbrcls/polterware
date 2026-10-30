package polter

import (
	"regexp"
	"slices"
	"strings"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
)

// RuleNode is a `#### rule slug: Statement` block. A Rule is a constraint
// agents read before they work; scope: names the Structure nodes it holds
// for, and none is the whole project.
type RuleNode struct {
	Line      int
	Ref       string
	Statement string
	Meta      []MetaEntry
}

// RuleMetaKeys are the keys a Rule block takes.
var RuleMetaKeys = []string{"scope", "status"}

// ruleID matches a stored Rule id, the handle of a Rule with no slug.
var ruleID = regexp.MustCompile(`^[0-9A-Z]{26}$`)

// ruleHeadingPrefix starts a Rule heading inside `#### `.
const ruleHeadingPrefix = "rule "

func (n RuleNode) MetaValue(key string) (string, bool) {
	value, found := "", false
	for _, entry := range n.Meta {
		if entry.Key == key {
			value, found = entry.Value, true
		}
	}
	return value, found
}

func (n RuleNode) metaLine(key string) int {
	line := n.Line
	for _, entry := range n.Meta {
		if entry.Key == key {
			line = entry.Line
		}
	}
	return line
}

func (d *decoder) ruleHeading(n int, body string) {
	d.closeCard()
	d.closeNode()
	d.closeDecision()
	d.closeFact()
	d.closeRule()
	ref, statement, _ := strings.Cut(body, ":")
	ref, statement = strings.TrimSpace(ref), strings.TrimSpace(statement)
	if !work.ValidSlug(ref) && !ruleID.MatchString(ref) {
		d.errorf(n, "invalid rule reference %q: use a lowercase-kebab slug or an existing rule id", ref)
	}
	if prev, dup := d.ruleRefs[ref]; dup {
		d.errorf(n, "duplicate rule %q (also line %d): merge the two blocks", ref, prev)
	}
	d.ruleRefs[ref] = n
	d.rule = &RuleNode{Line: n, Ref: ref, Statement: statement}
	d.inMeta = true
}

func (d *decoder) ruleLine(n int, line string) {
	if line == "" {
		return
	}
	for _, part := range metaSplitter.Split(line, -1) {
		m := metaKey.FindStringSubmatch(strings.TrimSpace(part))
		if m == nil {
			d.errorf(n, "Rules use a heading statement and scope: or status: metadata")
			continue
		}
		key, value := m[1], strings.TrimSpace(m[2])
		switch key {
		case "scope":
		case "status":
			value = strings.ToLower(value)
			if value != work.RuleActive && value != work.RuleRemoved {
				d.errorf(n, "unknown rule status %q: use active or removed", value)
				continue
			}
		default:
			d.errorf(n, "unknown rule key %q: use scope or status", key)
			continue
		}
		d.rule.Meta = append(d.rule.Meta, MetaEntry{Key: key, Value: value, Line: n})
	}
}

func (d *decoder) closeRule() {
	if d.rule == nil {
		return
	}
	d.doc.Rules = append(d.doc.Rules, *d.rule)
	d.rule = nil
	d.intent = nil
	d.inMeta = false
}

// planRules writes the Rule blocks: a new slug creates a Rule (it needs a
// statement), a known slug or id updates it, and status: removed retires it.
func (p *planner) planRules(doc Document) {
	for _, node := range doc.Rules {
		failed := p.failed(node.Line)
		for _, entry := range node.Meta {
			failed = failed || p.failed(entry.Line)
		}
		if failed {
			continue
		}
		index := slices.IndexFunc(p.rules, func(rule work.Rule) bool { return rule.ID == node.Ref || rule.Slug == node.Ref })
		status, hasStatus := node.MetaValue("status")
		var scopes []string
		scopeValue, hasScope := node.MetaValue("scope")
		if hasScope {
			scopes = ParseScopes(scopeValue)
			if !p.checkScopes(node.metaLine("scope"), scopes) {
				continue
			}
			if scopes == nil {
				scopes = []string{}
			}
		}
		if index < 0 {
			if hasStatus && status == work.RuleRemoved {
				p.errorf(node.Line, "cannot remove unknown rule %q: check the slug", node.Ref)
				continue
			}
			if node.Statement == "" {
				p.errorf(node.Line, "unknown rule %q: add a statement (#### rule %s: Statement)", node.Ref, node.Ref)
				continue
			}
			rule := work.Rule{ID: ids.NewULID(), Slug: node.Ref, Statement: node.Statement, Scopes: scopes, Status: work.RuleActive}
			p.rules = append(p.rules, rule)
			fields := map[string]any{"slug": rule.Slug, "statement": rule.Statement}
			if scopes != nil {
				fields["scope"] = scopes
			}
			p.ops = append(p.ops, work.Op{Entity: work.EntityRule, Kind: work.OpCreate, EntityID: rule.ID, CardSlug: rule.Slug, Label: rule.Statement, Fields: fields})
			continue
		}
		current := p.rules[index]
		fields, before := map[string]any{}, map[string]any{}
		if node.Statement != "" && node.Statement != current.Statement {
			fields["statement"], before["statement"] = node.Statement, current.Statement
			current.Statement = node.Statement
		}
		if hasScope && !slices.Equal(scopes, current.Scopes) {
			fields["scope"], before["scope"] = scopes, current.Scopes
			current.Scopes = scopes
		}
		kind := work.OpUpdate
		if hasStatus && status == work.RuleRemoved {
			kind = work.OpRemove
			fields["status"], before["status"] = work.RuleRemoved, current.Status
			current.Status = work.RuleRemoved
		}
		if len(fields) == 0 {
			continue
		}
		p.rules[index] = current
		p.ops = append(p.ops, work.Op{Entity: work.EntityRule, Kind: kind, EntityID: current.ID, CardSlug: current.Handle(), Label: current.Statement, Fields: fields, Before: before})
	}
}

// nodeRules plans a node's `!` lines: each is a Rule whose only context is
// that node, matched by its normalized text. `[removed]` retires it.
func (p *planner) nodeRules(node StructureNode, stored *structure.Node) {
	for _, inv := range node.Invariants {
		key := work.NormalizeText(inv.Text)
		index := slices.IndexFunc(p.rules, func(rule work.Rule) bool {
			return slices.Equal(rule.Scopes, []string{stored.Path}) && work.NormalizeText(rule.Statement) == key
		})
		if index < 0 {
			if inv.Removed {
				continue
			}
			rule := work.Rule{ID: ids.NewULID(), Statement: inv.Text, Scopes: []string{stored.Path}, Status: work.RuleActive}
			p.rules = append(p.rules, rule)
			p.ops = append(p.ops, work.Op{
				Entity: work.EntityRule, Kind: work.OpCreate, EntityID: rule.ID, NodeID: stored.ID,
				CardSlug: stored.Path, Label: inv.Text,
				Fields: map[string]any{"statement": inv.Text, "scope": []string{stored.Path}},
			})
			continue
		}
		current := p.rules[index]
		if inv.Removed {
			p.rules = slices.Delete(p.rules, index, index+1)
			p.ops = append(p.ops, work.Op{
				Entity: work.EntityRule, Kind: work.OpRemove, EntityID: current.ID, NodeID: stored.ID,
				CardSlug: stored.Path, Label: current.Statement,
				Fields: map[string]any{"status": work.RuleRemoved}, Before: map[string]any{"status": current.Status},
			})
			continue
		}
		if inv.Text != current.Statement {
			p.ops = append(p.ops, work.Op{
				Entity: work.EntityRule, Kind: work.OpUpdate, EntityID: current.ID, NodeID: stored.ID,
				CardSlug: stored.Path, Label: inv.Text,
				Fields: map[string]any{"statement": inv.Text}, Before: map[string]any{"statement": current.Statement},
			})
			p.rules[index].Statement = inv.Text
		}
	}
}

// RulesFor returns the active Rules that hold for a node path: its own, its
// ancestors' (nearest first), then the project-wide ones, each once and in
// stored order within a level.
func RulesFor(rules []work.Rule, chain []string) (own [][]work.Rule, project []work.Rule) {
	seen := map[string]bool{}
	own = make([][]work.Rule, len(chain))
	for i, path := range chain {
		for _, rule := range rules {
			if !seen[rule.ID] && slices.Contains(rule.Scopes, path) {
				seen[rule.ID] = true
				own[i] = append(own[i], rule)
			}
		}
	}
	for _, rule := range rules {
		if len(rule.Scopes) == 0 {
			project = append(project, rule)
		}
	}
	return own, project
}
