package polter

import (
	"fmt"
	"strings"

	"github.com/polterware/polterware/backend/domains/work"
)

// Header is the canonical frontmatter every encoded document starts with.
const Header = "---\npolter: 1\n---\n"

// Format renders a Document in canonical form. Format(Decode(Format(Decode(x))))
// equals Format(Decode(x)): the codec's round-trip property.
func Format(doc Document) string {
	var b strings.Builder
	b.WriteString("---\npolter: 1\n")
	if doc.Summary != "" {
		fmt.Fprintf(&b, "summary: %s\n", doc.Summary)
	}
	if doc.Rationale != "" {
		fmt.Fprintf(&b, "rationale: %s\n", doc.Rationale)
	}
	b.WriteString("---\n")
	for _, node := range doc.Nodes {
		b.WriteString("\n")
		writeStructureNode(&b, node)
	}
	for _, card := range doc.Cards {
		b.WriteString("\n")
		writeCard(&b, card)
	}
	for _, dec := range doc.Decisions {
		b.WriteString("\n")
		writeDecision(&b, dec)
	}
	for _, fact := range doc.Facts {
		fmt.Fprintf(&b, "\n#### %s", fact.Ref)
		if fact.Statement != "" {
			fmt.Fprintf(&b, ": %s", fact.Statement)
		}
		b.WriteString("\n")
		for _, key := range FactMetaKeys {
			if value, ok := fact.MetaValue(key); ok {
				fmt.Fprintf(&b, "%s: %s\n", key, value)
			}
		}
	}
	return b.String()
}

// EncodeCard renders one stored card as a full Polter document.
func EncodeCard(card work.Card) string {
	var b strings.Builder
	b.WriteString(Header)
	b.WriteString("\n")
	writeCard(&b, NodeFromCard(card))
	return b.String()
}

// NodeFromCard converts a stored card to its AST. Removed questions and
// invariants are left out; dropped tasks stay so their numbers remain visible.
func NodeFromCard(card work.Card) CardNode {
	node := CardNode{Slug: card.Slug, Title: card.Title, Intent: card.Intent, IntentSet: card.Intent != ""}
	node.Meta = append(node.Meta, MetaEntry{Key: "stage", Value: card.Stage})
	if card.Owner != "" {
		node.Meta = append(node.Meta, MetaEntry{Key: "owner", Value: card.Owner})
	}
	if card.Under != "" {
		node.Meta = append(node.Meta, MetaEntry{Key: "under", Value: card.Under})
	}
	if card.Kind == work.KindArchitecture {
		node.Meta = append(node.Meta, MetaEntry{Key: "kind", Value: card.Kind})
	}
	if len(card.Decisions) > 0 {
		node.Meta = append(node.Meta, MetaEntry{Key: "decisions", Value: strings.Join(card.Decisions, ", ")})
	}
	if card.Status == work.CardRemoved {
		node.Meta = append(node.Meta, MetaEntry{Key: "status", Value: work.CardRemoved})
	}
	for _, task := range card.Tasks {
		node.Tasks = append(node.Tasks, TaskNode{Number: task.Number, Title: task.Title, State: task.State, Repo: task.Repo, Scope: task.Scope})
	}
	for _, q := range card.Questions {
		switch q.State {
		case work.QuestionOpen:
			node.Questions = append(node.Questions, QuestionNode{Text: q.Text, Blocking: q.Blocking, Options: q.Options})
		case work.QuestionAnswered:
			node.Questions = append(node.Questions, QuestionNode{Text: q.Text, Blocking: q.Blocking, Options: q.Options, Answer: q.Answer})
		}
	}
	for _, inv := range card.Invariants {
		if inv.State != work.InvariantActive {
			continue
		}
		node.Invariants = append(node.Invariants, InvariantNode{Text: inv.Text})
	}
	if handoff, ok := card.LatestHandoffAny(); ok {
		node.Handoff = HandoffNodeFrom(handoff)
	}
	return node
}

// HandoffNodeFrom converts a stored handoff to its AST block.
func HandoffNodeFrom(handoff work.Handoff) *HandoffNode {
	return &HandoffNode{
		Branch: handoff.Branch, Agent: handoff.Agent, Goal: handoff.Goal, Done: handoff.Done,
		InProgress: handoff.InProgress, Next: handoff.Next, Touched: append([]string(nil), handoff.Touched...),
	}
}

func writeStructureNode(b *strings.Builder, node StructureNode) {
	path := node.Path
	if path == "" {
		path = node.Slug
	}
	fmt.Fprintf(b, "# %s: %s\n", path, node.Title)
	var meta []string
	for _, key := range NodeMetaKeys {
		value, ok := node.MetaValue(key)
		if ok && value != "" {
			meta = append(meta, key+": "+value)
		}
	}
	if len(meta) > 0 {
		b.WriteString(strings.Join(meta, " · "))
		b.WriteString("\n")
	}
	if node.Intent != "" {
		b.WriteString("\n")
		b.WriteString(node.Intent)
		b.WriteString("\n")
	}
	if len(node.Invariants) > 0 && (node.Intent != "" || len(meta) > 0) {
		b.WriteString("\n")
	}
	for _, inv := range node.Invariants {
		b.WriteString("! ")
		b.WriteString(inv.Text)
		if inv.Removed {
			b.WriteString(" [removed]")
		}
		b.WriteString("\n")
	}
}

func writeCard(b *strings.Builder, card CardNode) {
	if card.Title != "" {
		fmt.Fprintf(b, "## %s: %s\n", card.Slug, card.Title)
	} else {
		fmt.Fprintf(b, "## %s\n", card.Slug)
	}
	if meta := canonicalMeta(card); len(meta) > 0 {
		parts := make([]string, 0, len(meta))
		for _, entry := range meta {
			parts = append(parts, entry.Key+": "+entry.Value)
		}
		b.WriteString(strings.Join(parts, " · "))
		b.WriteString("\n")
	}
	if card.Handoff != nil {
		b.WriteString("\n")
		writeHandoff(b, card.Handoff)
	}
	if card.IntentSet {
		b.WriteString("\n")
		b.WriteString(card.Intent)
		b.WriteString("\n")
	}
	if len(card.Tasks)+len(card.Questions)+len(card.Invariants) > 0 {
		b.WriteString("\n")
	}
	for _, task := range card.Tasks {
		box := " "
		switch task.State {
		case work.TaskDone:
			box = "x"
		case work.TaskDropped:
			box = "-"
		}
		fmt.Fprintf(b, "- [%s] ", box)
		if task.Number > 0 {
			fmt.Fprintf(b, "T%d ", task.Number)
		}
		b.WriteString(task.Title)
		if task.Repo != "" {
			fmt.Fprintf(b, " [repo: %s]", task.Repo)
		}
		if task.Scope != "" {
			fmt.Fprintf(b, " `%s`", task.Scope)
		}
		b.WriteString("\n")
	}
	for _, q := range card.Questions {
		b.WriteString("? ")
		b.WriteString(q.Text)
		if q.Blocking {
			b.WriteString(" [blocking]")
		}
		if q.Removed {
			b.WriteString(" [removed]")
		}
		if len(q.Options) > 0 {
			fmt.Fprintf(b, " (%s)", strings.Join(q.Options, " | "))
		}
		if q.Answer != "" {
			fmt.Fprintf(b, " -> %s", q.Answer)
		}
		b.WriteString("\n")
	}
	for _, inv := range card.Invariants {
		b.WriteString("! ")
		b.WriteString(inv.Text)
		if inv.Removed {
			b.WriteString(" [removed]")
		}
		b.WriteString("\n")
	}
}

// canonicalMeta keeps the last value per key, in MetaKeys order.
func writeHandoff(b *strings.Builder, handoff *HandoffNode) {
	b.WriteString("handoff:\n")
	fmt.Fprintf(b, "branch: %s\n", handoff.Branch)
	writeHandoffField(b, "agent", handoff.Agent)
	writeHandoffField(b, "goal", handoff.Goal)
	writeHandoffField(b, "done", handoff.Done)
	writeHandoffField(b, "in_progress", handoff.InProgress)
	writeHandoffField(b, "next", handoff.Next)
	if len(handoff.Touched) > 0 {
		fmt.Fprintf(b, "touched: %s\n", strings.Join(handoff.Touched, ", "))
	}
}

func writeHandoffField(b *strings.Builder, key, value string) {
	if value == "" {
		return
	}
	fmt.Fprintf(b, "%s: %s\n", key, value)
}

func canonicalMeta(card CardNode) []MetaEntry {
	var out []MetaEntry
	for _, key := range MetaKeys {
		if value, ok := card.MetaValue(key); ok {
			out = append(out, MetaEntry{Key: key, Value: value})
		}
	}
	return out
}

// EncodeList renders active cards one per line:
// slug  stage  2/5 tasks  1 open?  "Title"
func EncodeList(snapshot work.Snapshot) string {
	type row struct{ slug, stage, tasks, questions, title string }
	var rows []row
	widths := [4]int{}
	for _, card := range snapshot.Cards {
		if card.Status != work.CardActive {
			continue
		}
		done, total := TaskProgress(card)
		r := row{slug: card.Slug, stage: card.Stage, tasks: fmt.Sprintf("%d/%d tasks", done, total), title: card.Title}
		if open := OpenQuestions(card); open > 0 {
			r.questions = fmt.Sprintf("%d open?", open)
		}
		for i, value := range []string{r.slug, r.stage, r.tasks, r.questions} {
			widths[i] = max(widths[i], len(value))
		}
		rows = append(rows, r)
	}
	if len(rows) == 0 {
		return "no cards\n"
	}
	var b strings.Builder
	for _, r := range rows {
		fmt.Fprintf(&b, "%-*s  %-*s  %-*s  ", widths[0], r.slug, widths[1], r.stage, widths[2], r.tasks)
		if widths[3] > 0 {
			fmt.Fprintf(&b, "%-*s  ", widths[3], r.questions)
		}
		fmt.Fprintf(&b, "%q\n", r.title)
	}
	return b.String()
}

// TaskProgress counts done tasks against non-dropped tasks.
func TaskProgress(card work.Card) (done, total int) {
	for _, task := range card.Tasks {
		switch task.State {
		case work.TaskDone:
			done++
			total++
		case work.TaskOpen:
			total++
		}
	}
	return done, total
}

// OpenQuestions counts questions still waiting for a decision.
func OpenQuestions(card work.Card) int {
	n := 0
	for _, q := range card.Questions {
		if q.State == work.QuestionOpen {
			n++
		}
	}
	return n
}

func writeDecision(b *strings.Builder, dec DecisionNode) {
	if dec.Title != "" {
		fmt.Fprintf(b, "### %s: %s\n", dec.Ref, dec.Title)
	} else {
		fmt.Fprintf(b, "### %s\n", dec.Ref)
	}
	var meta []string
	for _, key := range DecisionMetaKeys {
		if value, ok := dec.MetaValue(key); ok && value != "" {
			meta = append(meta, key+": "+value)
		}
	}
	if len(meta) > 0 {
		b.WriteString(strings.Join(meta, " · "))
		b.WriteString("\n")
	}
	if dec.Body != "" {
		b.WriteString("\n")
		b.WriteString(dec.Body)
		b.WriteString("\n")
	}
}
