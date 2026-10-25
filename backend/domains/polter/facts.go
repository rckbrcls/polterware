package polter

import (
	"slices"
	"strings"

	"github.com/polterware/polterware/backend/domains/atlas"
	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/work"
)

// FactNode is a `#### slug-or-id: Statement` canon Fact block.
type FactNode struct {
	Line      int
	Ref       string
	Statement string
	Meta      []MetaEntry
}

var FactMetaKeys = []string{"kind", "scope", "evidence"}

func (n FactNode) MetaValue(key string) (string, bool) {
	value, found := "", false
	for _, entry := range n.Meta {
		if entry.Key == key {
			value, found = entry.Value, true
		}
	}
	return value, found
}

func (d *decoder) factHeading(n int, body string) {
	d.closeCard()
	d.closeNode()
	d.closeDecision()
	d.closeFact()
	ref, statement, _ := strings.Cut(body, ":")
	ref, statement = strings.TrimSpace(ref), strings.TrimSpace(statement)
	if !work.ValidSlug(ref) {
		d.errorf(n, "invalid fact reference %q: use a lowercase-kebab slug or an existing fact id", ref)
	}
	if prev, dup := d.factRefs[ref]; dup {
		d.errorf(n, "duplicate fact %q (also line %d): merge the two blocks", ref, prev)
	}
	d.factRefs[ref] = n
	d.fact = &FactNode{Line: n, Ref: ref, Statement: statement}
	d.inMeta = true
}

func (d *decoder) factLine(n int, line string) {
	if line == "" {
		return
	}
	for _, part := range metaSplitter.Split(line, -1) {
		m := metaKey.FindStringSubmatch(strings.TrimSpace(part))
		if m == nil {
			d.errorf(n, "Facts use a heading statement and kind:, scope:, or evidence: metadata")
			continue
		}
		key, value := m[1], strings.TrimSpace(m[2])
		switch key {
		case "kind":
			value = strings.ToLower(value)
			if !canon.ValidFactTruthClass(value) {
				d.errorf(n, "unknown fact kind %q: use declared|observed|inferred|verified", value)
			}
		case "scope", "evidence":
		default:
			d.errorf(n, "unknown fact key %q: use kind, scope, evidence", key)
			continue
		}
		d.fact.Meta = append(d.fact.Meta, MetaEntry{Key: key, Value: value, Line: n})
	}
}

func (d *decoder) closeFact() {
	if d.fact == nil {
		return
	}
	d.doc.Facts = append(d.doc.Facts, *d.fact)
	d.fact = nil
	d.intent = nil
	d.inMeta = false
}

func resolveFactEvidence(value string, evidence []canon.Evidence) ([]string, string) {
	ids := []string{}
	for _, ref := range splitList(value) {
		id := ""
		for _, item := range evidence {
			if item.ID == ref {
				id = item.ID
				break
			}
		}
		if id == "" {
			return nil, ref
		}
		if !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	slices.Sort(ids)
	return ids, ""
}

func checkFactEvidence(doc Document, evidence []canon.Evidence) []Diagnostic {
	var diags []Diagnostic
	for _, node := range doc.Facts {
		for _, entry := range node.Meta {
			if entry.Key != "evidence" {
				continue
			}
			if _, unknown := resolveFactEvidence(entry.Value, evidence); unknown != "" {
				diags = append(diags, Diagnostic{Line: entry.Line, Severity: SeverityError, Message: "unknown evidence " + unknown + ": use an existing evidence id in this project"})
			}
		}
	}
	return diags
}

func (p *planner) planFacts(doc Document) {
	p.diags = append(p.diags, checkFactEvidence(doc, p.snapshot.Evidence)...)
	state := append([]work.Fact(nil), p.snapshot.Facts...)
	for _, node := range doc.Facts {
		failed := p.failed(node.Line)
		for _, entry := range node.Meta {
			failed = failed || p.failed(entry.Line)
		}
		if failed {
			continue
		}
		current := work.Fact{}
		index := -1
		for i, fact := range state {
			if fact.ID == node.Ref || fact.Slug == node.Ref {
				current, index = fact, i
				break
			}
		}
		fields, before := map[string]any{}, map[string]any{}
		set := func(key string, old, value any) { fields[key], before[key] = value, old }
		if index < 0 {
			if node.Statement == "" {
				p.errorf(node.Line, "unknown fact %q: add a statement (#### slug: Statement)", node.Ref)
				continue
			}
			current = work.Fact{Fact: canon.Fact{ID: canon.NewFactID(), Statement: node.Statement, TruthClass: canon.TruthDeclared}, Slug: node.Ref}
			fields = map[string]any{"slug": current.Slug, "statement": current.Statement, "kind": current.TruthClass}
		} else if node.Statement != "" && node.Statement != current.Statement {
			set("statement", current.Statement, node.Statement)
			current.Statement = node.Statement
		}
		if kind, ok := node.MetaValue("kind"); ok {
			if !canon.ValidFactTruthClass(kind) {
				p.errorf(factMetaLine(node, "kind"), "unknown fact kind %q: use declared|observed|inferred|verified", kind)
				continue
			}
			if kind != current.TruthClass {
				set("kind", current.TruthClass, kind)
				current.TruthClass = kind
			}
		}
		if scope, ok := node.MetaValue("scope"); ok {
			if scope != "" {
				target, exists := p.nodes[scope]
				if !exists || target.Status == atlas.NodeRemoved {
					p.errorf(factMetaLine(node, "scope"), "unknown scope %q: use an Atlas node path", scope)
					continue
				}
			}
			if scope != current.Scope {
				set("scope", current.Scope, scope)
				current.Scope = scope
			}
		}
		if value, ok := node.MetaValue("evidence"); ok {
			evidence, unknown := resolveFactEvidence(value, p.snapshot.Evidence)
			if unknown != "" {
				continue
			}
			old := append([]string{}, current.Evidence...)
			slices.Sort(old)
			if !slices.Equal(old, evidence) {
				set("evidence", old, evidence)
				current.Evidence = evidence
			}
		}
		if len(fields) == 0 {
			continue
		}
		kind := work.OpUpdate
		if index < 0 {
			kind = work.OpCreate
			state = append(state, current)
		} else {
			state[index] = current
		}
		p.ops = append(p.ops, work.Op{Entity: work.EntityFact, Kind: kind, EntityID: current.ID, CardSlug: current.ID, Label: current.Statement, Fields: fields, Before: before})
	}
}

func factMetaLine(node FactNode, key string) int {
	line := node.Line
	for _, entry := range node.Meta {
		if entry.Key == key {
			line = entry.Line
		}
	}
	return line
}
