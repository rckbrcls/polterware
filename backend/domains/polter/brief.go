package polter

import (
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/polterware/polterware/backend/domains/canvas"
	contextpkg "github.com/polterware/polterware/backend/domains/context"
	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

// ErrUnknownBriefTarget is returned when a brief target is neither a card
// slug nor a Structure node path or id. The caller may still resolve it as a
// file path and try again with the node it falls under.
var ErrUnknownBriefTarget = errors.New("unknown brief target")

// BriefInput is what a brief draws from. The caller loads it; Brief only reads it.
type BriefInput struct {
	Snapshot work.Snapshot
	// Docs are the project's active docs. A brief lists only those with a
	// context on the target's node or one of its ancestors.
	Docs []Doc
	// Canvases are the agent-visible canvases, with linked nodes already
	// carrying their Structure title (canvas.WithStructure).
	Canvases []canvas.Canvas
}

// Doc is one doc with the Structure nodes it is about. Search reads the body.
type Doc struct {
	ID           string
	Title        string
	DocType      string
	ScopeNodeIDs []string
	Body         string
}

// Brief renders what an agent reads before it works on a card or a Structure
// node, most important first: the target with its kind and technology, the
// Rules that hold for it (its node's, its ancestors', and the project's), open
// tasks and questions with the last handoff, the card's invariants, the
// decisions that govern it, scope facts, the milestone goal, canvas links,
// and doc titles. It is deterministic. A tight budget cuts lines from the
// end, so the lowest-priority blocks go first, and the last line says what
// was cut; the target and the Rules are never cut.
func Brief(in BriefInput, target string, budget int) (string, error) {
	if budget < 1 {
		budget = contextpkg.DefaultTokenBudget
	}
	if budget > contextpkg.MaxTokenBudget {
		budget = contextpkg.MaxTokenBudget
	}
	card, node, ok := resolveBriefTarget(in.Snapshot, target)
	if !ok {
		return "", fmt.Errorf("%w %q: use a card slug, a Structure path, or a file path (polterware search <terms> finds them)", ErrUnknownBriefTarget, strings.TrimSpace(target))
	}
	b := briefBuilder{in: in, card: card, focus: node}
	if card != nil {
		b.focus = activeNode(in.Snapshot.Nodes, card.Under)
	}
	b.chain = ancestorChain(in.Snapshot.Nodes, b.focus)
	return packBrief(b.blocks(), budget, 2), nil
}

// resolveBriefTarget finds a card by slug, then a node by path or id.
func resolveBriefTarget(snapshot work.Snapshot, target string) (*work.Card, *structure.Node, bool) {
	target = strings.TrimSpace(target)
	if target == "" {
		return nil, nil, false
	}
	for i := range snapshot.Cards {
		if snapshot.Cards[i].Status == work.CardActive && snapshot.Cards[i].Slug == target {
			return &snapshot.Cards[i], nil, true
		}
	}
	for i := range snapshot.Nodes {
		node := &snapshot.Nodes[i]
		if node.Status != structure.NodeRemoved && (node.Path == target || node.ID == target) {
			return nil, node, true
		}
	}
	return nil, nil, false
}

type briefBuilder struct {
	in   BriefInput
	card *work.Card
	// focus is the target node, or the node the card sits under.
	focus *structure.Node
	// chain is focus's ancestors, nearest first.
	chain []structure.Node
}

func (b briefBuilder) blocks() [][]string {
	return [][]string{
		b.target(),
		b.rules(),
		b.conflicts(),
		b.openWork(),
		b.invariants(),
		b.decisions(),
		b.facts(),
		b.milestone(),
		b.canvas(),
		b.docs(),
	}
}

func (b briefBuilder) target() []string {
	var lines []string
	if b.card != nil {
		card := b.card
		lines = append(lines, fmt.Sprintf("## %s: %s", card.Slug, card.Title))
		meta := []string{"stage: " + card.Stage}
		if card.Under != "" {
			meta = append(meta, "under: "+card.Under)
		}
		if card.Milestone != "" {
			meta = append(meta, "milestone: "+card.Milestone)
		}
		if claim := openClaim(card); claim != "" {
			meta = append(meta, "claim: "+claim)
		}
		lines = append(lines, strings.Join(meta, " · "))
		if line := nodeMeta(b.focus, false); line != "" {
			lines = append(lines, line)
		}
		if card.Intent != "" {
			lines = append(lines, card.Intent)
		}
		return lines
	}
	node := b.focus
	lines = append(lines, fmt.Sprintf("# %s: %s", node.Path, node.Title), nodeMeta(node, true))
	if node.Intent != "" {
		lines = append(lines, node.Intent)
	}
	return lines
}

// nodeMeta is `level: component · kind: cli · tech: Go · repo: api · path: src`.
// The level is left out for the node a card sits under.
func nodeMeta(node *structure.Node, withLevel bool) string {
	if node == nil {
		return ""
	}
	var parts []string
	if withLevel {
		parts = append(parts, "level: "+node.Level)
	}
	for _, line := range []string{kindTechLine(node), checkoutLine(node)} {
		if line != "" {
			parts = append(parts, line)
		}
	}
	return strings.Join(parts, " · ")
}

func openClaim(card *work.Card) string {
	for _, task := range card.Tasks {
		if task.Claim == nil || task.State != work.TaskOpen {
			continue
		}
		if task.Claim.Scope != "" {
			return task.Claim.Holder + " (" + task.Claim.Scope + ")"
		}
		return task.Claim.Holder
	}
	return ""
}

// conflicts lists the card's Conflicts: open ones wait for a person, and a
// decided one carries the answer to follow.
func (b briefBuilder) conflicts() []string {
	if b.card == nil {
		return nil
	}
	var lines []string
	for _, conflict := range b.in.Snapshot.Conflicts {
		if conflict.CardSlug != b.card.Slug {
			continue
		}
		switch conflict.State {
		case work.ConflictOpen:
			lines = append(lines, fmt.Sprintf("- %s: %s (open: wait for a person)", conflict.Slug, conflict.Request))
		case work.ConflictDecided:
			lines = append(lines, fmt.Sprintf("- %s: %s -> %s", conflict.Slug, conflict.Request, conflict.Answer))
		}
	}
	if lines == nil {
		return nil
	}
	return append([]string{"Conflicts:"}, lines...)
}

func (b briefBuilder) openWork() []string {
	if b.card != nil {
		lines := append(briefTasks(b.card), briefQuestions(b.card, "")...)
		if handoff, ok := b.card.LatestHandoffAny(); ok {
			lines = append(lines, handoffLine(handoff))
		}
		return lines
	}
	var lines, questions []string
	for _, card := range cardsWithin(b.in.Snapshot, b.focus) {
		if card.Stage == work.StageDelivered {
			continue
		}
		line := fmt.Sprintf("- %s  %s  %q", card.Slug, card.Stage, card.Title)
		if open := len(briefQuestions(&card, "")); open > 0 {
			line += fmt.Sprintf("  %d open?", open)
		}
		lines = append(lines, line)
		for _, question := range briefQuestions(&card, card.Slug) {
			if strings.Contains(question, "[blocking]") {
				questions = append(questions, question)
			}
		}
	}
	return append(lines, questions...)
}

func briefTasks(card *work.Card) []string {
	var lines []string
	for _, task := range card.Tasks {
		if task.State != work.TaskOpen {
			continue
		}
		line := "- [ ] "
		if task.Number > 0 {
			line += fmt.Sprintf("T%d ", task.Number)
		}
		line += task.Title
		if task.Repo != "" {
			line += " [repo: " + task.Repo + "]"
		}
		if task.Scope != "" {
			line += " `" + task.Scope + "`"
		}
		lines = append(lines, line)
	}
	return lines
}

// briefQuestions lists open questions, blocking ones first; from names the
// card when the brief is about a node.
func briefQuestions(card *work.Card, from string) []string {
	var blocking, other []string
	for _, question := range card.Questions {
		if question.State != work.QuestionOpen {
			continue
		}
		line := "? " + question.Text
		if question.Blocking {
			line += " [blocking]"
		}
		if len(question.Options) > 0 {
			line += " (" + strings.Join(question.Options, " | ") + ")"
		}
		if from != "" {
			line += " — " + from
		}
		if question.Blocking {
			blocking = append(blocking, line)
		} else {
			other = append(other, line)
		}
	}
	return append(blocking, other...)
}

func handoffLine(handoff work.Handoff) string {
	line := "handoff"
	if handoff.Agent != "" {
		line += " " + handoff.Agent
	}
	if handoff.Branch != "" {
		line += " on " + handoff.Branch
	}
	var parts []string
	for _, part := range []struct{ key, value string }{{"next", handoff.Next}, {"in progress", handoff.InProgress}} {
		if part.value != "" {
			parts = append(parts, part.key+": "+part.value)
		}
	}
	if len(parts) == 0 && handoff.Goal != "" {
		parts = append(parts, "goal: "+handoff.Goal)
	}
	if len(parts) == 0 {
		return line
	}
	return line + ": " + strings.Join(parts, " · ")
}

// rules lists every Rule that holds for the target: the focus node's own,
// its ancestors' (nearest first, marked with the node they come from), then
// the project-wide ones. Agents must follow them.
func (b briefBuilder) rules() []string {
	own, project := RulesFor(b.in.Snapshot.Rules, b.chainPaths())
	var lines []string
	for i, rules := range own {
		for _, rule := range rules {
			if i == 0 && b.card == nil {
				lines = append(lines, "- "+rule.Statement)
			} else {
				lines = append(lines, fmt.Sprintf("- %s (from %s)", rule.Statement, b.chainPaths()[i]))
			}
		}
	}
	for _, rule := range project {
		lines = append(lines, "- "+rule.Statement+" (whole project)")
	}
	if len(lines) == 0 {
		return nil
	}
	return append([]string{"Rules:"}, lines...)
}

// invariants are the card's own constraints.
func (b briefBuilder) invariants() []string {
	if b.card == nil {
		return nil
	}
	var lines []string
	for _, inv := range b.card.Invariants {
		if inv.State != work.InvariantRemoved {
			lines = append(lines, "! "+inv.Text)
		}
	}
	return lines
}

// decisions are the card's own, the ones its node and ancestors cite, and
// the ones scoped to that path, each with its statement. The project
// principles follow as one line of titles: they apply everywhere, so the
// brief only names them. Superseded decisions are left out.
func (b briefBuilder) decisions() []string {
	all := b.in.Snapshot.Decisions
	seen := map[string]bool{}
	var picked []decision.Decision
	add := func(d decision.Decision) {
		if seen[d.ID] || decision.Normalize(d.Status) == decision.StateSuperseded {
			return
		}
		seen[d.ID] = true
		picked = append(picked, d)
	}
	cite := func(refs []string) {
		for _, ref := range refs {
			if d, ok := decision.Find(all, ref); ok {
				add(d)
			}
		}
	}
	if b.card != nil {
		cite(b.card.Decisions)
	}
	paths := b.chainPaths()
	if b.focus != nil {
		cite(b.focus.Decisions)
	}
	for _, node := range b.chain {
		cite(node.Decisions)
	}
	for _, path := range paths {
		for _, d := range all {
			if slices.Contains(d.Scopes, path) {
				add(d)
			}
		}
	}
	var principles []string
	for _, d := range all {
		if d.IsPrinciple() && !seen[d.ID] && decision.Normalize(d.Status) != decision.StateSuperseded {
			principles = append(principles, decision.StripNumber(d.Title))
		}
	}
	var lines []string
	if len(picked) > 0 {
		lines = append(lines, "Decisions:")
	}
	for _, d := range picked {
		line := fmt.Sprintf("- %s [%s] %s", decisionHandle(d), decision.Normalize(d.Status), decision.StripNumber(d.Title))
		if statement := firstSentence(d.Body); statement != "" {
			line += ": " + statement
		}
		if d.StatusReason != "" && decision.Normalize(d.Status) == decision.StateChallenged {
			line += " (challenged: " + d.StatusReason + ")"
		}
		lines = append(lines, line)
	}
	if len(principles) > 0 {
		lines = append(lines, "principles: "+strings.Join(principles, " · "))
	}
	return lines
}

// facts are the ones scoped to the focus or an ancestor, nearest first.
// Project-wide facts are the same in every brief and are left to search.
func (b briefBuilder) facts() []string {
	var lines []string
	seen := map[int]bool{}
	for _, path := range b.chainPaths() {
		for i, fact := range b.in.Snapshot.Facts {
			if !seen[i] && slices.Contains(fact.Scopes, path) {
				seen[i] = true
				lines = append(lines, fmt.Sprintf("- %s: %s", fact.TruthClass, fact.Statement))
			}
		}
	}
	if len(lines) == 0 {
		return nil
	}
	return append([]string{"Facts:"}, lines...)
}

func (b briefBuilder) milestone() []string {
	if b.card == nil || b.card.MilestoneID == "" {
		return nil
	}
	for _, milestone := range b.in.Snapshot.Milestones {
		if milestone.ID != b.card.MilestoneID {
			continue
		}
		line := fmt.Sprintf("milestone %s: %s · %s", milestone.Slug, milestone.Name, milestone.State)
		if milestone.TargetDate != "" {
			line += " · target " + milestone.TargetDate
		}
		lines := []string{line}
		if milestone.Goal != "" {
			lines = append(lines, "goal: "+milestone.Goal)
		}
		if len(milestone.ExitCriteria) > 0 {
			lines = append(lines, "exit: "+strings.Join(milestone.ExitCriteria, "; "))
		}
		return lines
	}
	return nil
}

// canvas lists, per agent-visible canvas, the links of the canvas nodes
// that cite the focus node.
func (b briefBuilder) canvas() []string {
	if b.focus == nil {
		return nil
	}
	var lines []string
	for _, item := range b.in.Canvases {
		labels := map[string]string{}
		linked := map[string]bool{}
		for _, node := range item.Graph.Nodes {
			labels[node.ID] = node.Label
			if node.Ref != nil && node.Ref.Kind == canvas.RefNode && node.Ref.ID == b.focus.ID {
				linked[node.ID] = true
			}
		}
		if len(linked) == 0 {
			continue
		}
		edges := 0
		for _, edge := range item.Graph.Edges {
			if !linked[edge.From] && !linked[edge.To] {
				continue
			}
			edges++
			lines = append(lines, fmt.Sprintf("- %s: %s --%s--> %s", item.Name, labels[edge.From], edge.Kind, labels[edge.To]))
		}
		if edges == 0 {
			lines = append(lines, fmt.Sprintf("- %s: %s (no links)", item.Name, b.focus.Title))
		}
	}
	if len(lines) == 0 {
		return nil
	}
	return append([]string{"Canvas:"}, lines...)
}

func (b briefBuilder) docs() []string {
	if b.focus == nil {
		return nil
	}
	ids := []string{b.focus.ID}
	for _, node := range b.chain {
		ids = append(ids, node.ID)
	}
	var lines []string
	seen := map[int]bool{}
	for _, id := range ids {
		for i, doc := range b.in.Docs {
			if seen[i] || !slices.Contains(doc.ScopeNodeIDs, id) {
				continue
			}
			seen[i] = true
			lines = append(lines, "- "+doc.Title)
		}
	}
	if len(lines) == 0 {
		return nil
	}
	return append([]string{"Docs:"}, lines...)
}

// chainPaths is the focus path and its ancestors' paths, nearest first.
func (b briefBuilder) chainPaths() []string {
	if b.focus == nil {
		return nil
	}
	paths := []string{b.focus.Path}
	for _, node := range b.chain {
		paths = append(paths, node.Path)
	}
	return paths
}

// cardsWithin lists the active cards under node or any node below it.
func cardsWithin(snapshot work.Snapshot, node *structure.Node) []work.Card {
	var out []work.Card
	for _, card := range snapshot.Cards {
		if card.Status == work.CardActive && (card.Under == node.Path || strings.HasPrefix(card.Under, node.Path+"/")) {
			out = append(out, card)
		}
	}
	return out
}

func activeNode(nodes []structure.Node, path string) *structure.Node {
	for i := range nodes {
		if nodes[i].Status != structure.NodeRemoved && nodes[i].Path == path {
			return &nodes[i]
		}
	}
	return nil
}

// firstSentence is the opening sentence of a body, up to 240 runes;
// Markdown heading lines are skipped.
func firstSentence(body string) string {
	var prose []string
	for _, line := range strings.Split(body, "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "#") {
			prose = append(prose, line)
		}
	}
	text := strings.Join(strings.Fields(strings.Join(prose, " ")), " ")
	if i := strings.Index(text, ". "); i >= 0 {
		text = text[:i+1]
	}
	return contextpkg.Excerpt(text, 240)
}

// packBrief joins the blocks with blank lines and, over budget, drops lines
// from the end. The first keep blocks (the target and the Rules) always stay
// whole, and a block header or blank line is never left dangling.
func packBrief(blocks [][]string, budget, keep int) string {
	var lines []string
	floor := 0
	for i, block := range blocks {
		if len(block) == 0 {
			continue
		}
		if len(lines) > 0 {
			lines = append(lines, "")
		}
		lines = append(lines, block...)
		if i < keep {
			floor = len(lines)
		}
	}
	floor = max(floor, min(2, len(lines)))
	text := strings.Join(lines, "\n") + "\n"
	if contextpkg.EstimateTokens(text) <= budget {
		return text
	}
	kept := len(lines)
	for kept > floor {
		kept--
		for kept > floor && (lines[kept-1] == "" || strings.HasSuffix(lines[kept-1], ":") && !strings.Contains(lines[kept-1], " ")) {
			kept--
		}
		cut := 0
		for _, line := range lines[kept:] {
			if line != "" {
				cut++
			}
		}
		note := fmt.Sprintf("(%d more lines cut to fit budget:%d)", cut, budget)
		text = strings.Join(lines[:kept], "\n") + "\n" + note + "\n"
		if contextpkg.EstimateTokens(text) <= budget {
			return text
		}
	}
	return text
}
