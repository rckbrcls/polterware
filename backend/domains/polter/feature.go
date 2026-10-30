package polter

import (
	"fmt"
	"slices"
	"sort"
	"strings"
	"unicode"

	"github.com/polterware/polterware/backend/domains/structure"
	"github.com/polterware/polterware/backend/domains/work"
)

// Feature flow steps: Intent creates the card, Shape shows its impact,
// Contract (shape → plan) and Plan (plan → build) are gates.
const (
	FeatureStepShape    = "shape"
	FeatureStepContract = "contract"
	FeatureStepPlan     = "plan"
)

// Question routes: where an open question waits.
const (
	RouteInbox     = "inbox"
	RouteDeferred  = "deferred"
	RouteDelegated = "delegated"
	RouteAnswered  = "answered"
)

const (
	maxSuggestions    = 3
	maxFeatureTitle   = 60
	maxCardSlugLength = 48
)

// FeatureReview is what a card touches and inherits, and what stops it from
// moving on. Checks carry the step they belong to.
type FeatureReview struct {
	Card work.Card
	// Under is the node named by the card's under:, or nil.
	Under *structure.Node
	// Suggested lists component paths for a card without under:.
	Suggested []string
	// Touches is the under: chain (top-down) plus components whose words
	// overlap the card title and intent.
	Touches    []structure.Node
	Decisions  []ReviewDecision
	Inherited  []ReviewInvariant
	Questions  []ReviewQuestion
	Checks     []FeatureCheck
	components bool
}

// ReviewDecision is one decision that applies to the card. From is "card"
// or the node path that cites it. Status is empty when no Decision matches.
type ReviewDecision struct {
	Ref    string
	ID     string
	Title  string
	Status string
	From   string
}

// ReviewInvariant is one active invariant inherited from a node.
type ReviewInvariant struct {
	Text string
	From string
}

// ReviewQuestion is one open or answered question on the card.
type ReviewQuestion struct {
	ID       string
	Text     string
	Blocking bool
	Options  []string
	Route    string
	Answer   string
}

// FeatureCheck is one finding for a flow step. Severity is error (the gate
// refuses) or hint.
type FeatureCheck struct {
	Step     string
	Severity string
	Message  string
}

// ValidFeatureStep reports whether step names a flow step.
func ValidFeatureStep(step string) bool {
	return step == FeatureStepShape || step == FeatureStepContract || step == FeatureStepPlan
}

// ReviewFeature computes the Shape impact and the checks of every step for
// one active card. routes maps a question id to its Inbox route; a missing
// id is RouteInbox.
func ReviewFeature(snapshot work.Snapshot, slug string, decisions []DecisionRef, routes map[string]string) (FeatureReview, error) {
	card, ok := snapshot.Card(slug)
	if !ok || card.Status != work.CardActive {
		return FeatureReview{}, fmt.Errorf("unknown card %q: list cards with polterware query cards", slug)
	}
	review := FeatureReview{Card: card}
	nodes := snapshot.Nodes
	for _, node := range nodes {
		if node.Status != structure.NodeRemoved && node.Level == structure.LevelComponent {
			review.components = true
			break
		}
	}

	var chain []structure.Node
	if card.Under != "" {
		for i := range nodes {
			if nodes[i].Status != structure.NodeRemoved && nodes[i].Path == card.Under {
				under := nodes[i]
				review.Under = &under
				break
			}
		}
	}
	if review.Under != nil {
		ancestors := ancestorChain(nodes, review.Under)
		for i := len(ancestors) - 1; i >= 0; i-- {
			chain = append(chain, ancestors[i])
		}
		chain = append(chain, *review.Under)
	}

	text := card.Title + " " + card.Intent
	related := SuggestComponents(nodes, snapshot.Cards, text, card.Slug)
	if card.Under == "" {
		review.Suggested = related
		if len(review.Suggested) > maxSuggestions {
			review.Suggested = review.Suggested[:maxSuggestions]
		}
	}
	review.Touches = append(review.Touches, chain...)
	for _, path := range related {
		if containsNodePath(review.Touches, path) {
			continue
		}
		if node, ok := snapshot.NodeByPath(path); ok {
			review.Touches = append(review.Touches, node)
		}
	}

	review.Decisions = reviewDecisions(card, chain, decisions)
	for _, node := range chain {
		for _, rule := range snapshot.Rules {
			if slices.Contains(rule.Scopes, node.Path) {
				review.Inherited = append(review.Inherited, ReviewInvariant{Text: rule.Statement, From: node.Path})
			}
		}
	}
	for _, q := range card.Questions {
		item := ReviewQuestion{ID: q.ID, Text: q.Text, Blocking: q.Blocking, Options: q.Options}
		switch q.State {
		case work.QuestionAnswered:
			item.Route, item.Answer = RouteAnswered, q.Answer
		case work.QuestionOpen:
			item.Route = routes[q.ID]
			if item.Route == "" {
				item.Route = RouteInbox
			}
		default:
			continue
		}
		review.Questions = append(review.Questions, item)
	}
	review.Checks = featureChecks(review)
	return review, nil
}

// SuggestComponents ranks active components by the words they share with
// text: their path, title, intent, and the cards placed under them. A
// component needs one shared path or title word, or two shared words
// overall. skipSlug leaves that card out of the card words.
func SuggestComponents(nodes []structure.Node, cards []work.Card, text, skipSlug string) []string {
	words := newWordSet(text)
	if len(words) == 0 {
		return nil
	}
	type scored struct {
		path   string
		shared int
		named  int
	}
	var ranked []scored
	for _, node := range nodes {
		if node.Status == structure.NodeRemoved || node.Level != structure.LevelComponent {
			continue
		}
		name := newWordSet(strings.ReplaceAll(node.Path, "/", " ") + " " + node.Title)
		all := newWordSet(node.Intent)
		all.add(name)
		for _, card := range cards {
			if card.Status == work.CardActive && card.Under == node.Path && card.Slug != skipSlug {
				all.add(cardWords(card.Slug, card.Title))
			}
		}
		shared, named := words.shared(all), words.shared(name)
		if named == 0 && shared < 2 {
			continue
		}
		ranked = append(ranked, scored{path: node.Path, shared: shared, named: named})
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		a, b := ranked[i], ranked[j]
		if a.shared != b.shared {
			return a.shared > b.shared
		}
		if a.named != b.named {
			return a.named > b.named
		}
		return a.path < b.path
	})
	out := make([]string, 0, len(ranked))
	for _, item := range ranked {
		out = append(out, item.path)
	}
	return out
}

// CitesDecision reports whether a decisions: entry names the Decision with id and
// title, by id or by Decision number.
func CitesDecision(ref, id, title string) bool {
	ref = strings.TrimSpace(ref)
	if strings.EqualFold(ref, id) {
		return true
	}
	n, ok := parseDecisionNumber(ref)
	if !ok {
		return false
	}
	m, ok := parseDecisionNumber(title)
	return ok && n == m
}

func reviewDecisions(card work.Card, chain []structure.Node, decisions []DecisionRef) []ReviewDecision {
	var out []ReviewDecision
	seen := map[string]bool{}
	add := func(ref, from string) {
		item := ReviewDecision{Ref: ref, From: from}
		for _, decision := range decisions {
			if CitesDecision(ref, decision.ID, decision.Title) {
				item.ID, item.Title, item.Status = decision.ID, decision.Title, decision.Status
				break
			}
		}
		key := strings.ToLower(ref)
		if item.ID != "" {
			key = item.ID
		}
		if seen[key] {
			return
		}
		seen[key] = true
		out = append(out, item)
	}
	for _, ref := range card.Decisions {
		add(ref, "card")
	}
	for _, node := range chain {
		for _, ref := range node.Decisions {
			add(ref, node.Path)
		}
	}
	return out
}

func featureChecks(review FeatureReview) []FeatureCheck {
	card := review.Card
	var checks []FeatureCheck
	add := func(step, severity, format string, args ...any) {
		checks = append(checks, FeatureCheck{Step: step, Severity: severity, Message: fmt.Sprintf(format, args...)})
	}

	// Shape.
	if strings.TrimSpace(card.Intent) == "" {
		add(FeatureStepShape, SeverityHint, "no intent: write what we want and why as the card paragraph")
	}
	if card.Under == "" && review.components {
		if len(review.Suggested) > 0 {
			add(FeatureStepShape, SeverityHint, "no under: suggested %s: add under: %s", strings.Join(review.Suggested, ", "), review.Suggested[0])
		} else {
			add(FeatureStepShape, SeverityHint, "no under: pick a component from polterware structure")
		}
	}

	// Contract and Plan share the blocking-question gate.
	for _, q := range review.Questions {
		if q.Route == RouteAnswered || !q.Blocking {
			continue
		}
		for _, step := range []string{FeatureStepContract, FeatureStepPlan} {
			add(step, SeverityError, "blocking question open: %q: answer it with `? %s -> <answer>`", q.Text, q.Text)
		}
	}

	// Contract.
	own := 0
	for _, inv := range card.Invariants {
		if inv.State != work.InvariantActive {
			continue
		}
		own++
		words := newWordSet(inv.Text)
		for _, inherited := range review.Inherited {
			if _, ok := words.similar(newWordSet(inherited.Text)); ok {
				add(FeatureStepContract, SeverityHint, "invariant %q repeats %q from %s: drop it, the card already inherits it", inv.Text, inherited.Text, inherited.From)
				break
			}
		}
	}
	if own == 0 && len(review.Inherited) == 0 {
		add(FeatureStepContract, SeverityHint, "no contract: add `! invariant` lines the feature must keep")
	}
	for _, decision := range review.Decisions {
		switch {
		case decision.ID == "":
			add(FeatureStepContract, SeverityHint, "decision %s matches no Decision in this project", decision.Ref)
		case decision.Status != "" && !decisionBinding(decision.Status):
			add(FeatureStepContract, SeverityHint, "decision %s is %s, not active", decision.Title, decisionState(decision.Status))
		}
	}

	// Plan.
	open := 0
	for _, task := range card.Tasks {
		if task.State != work.TaskOpen {
			continue
		}
		open++
		if task.Scope == "" {
			add(FeatureStepPlan, SeverityHint, "T%d has no scope: add a backticked glob so a claim reserves its files", task.Number)
		}
	}
	if open == 0 {
		add(FeatureStepPlan, SeverityError, "no open tasks: add `- [ ] Task` lines before approving the plan")
	}
	return checks
}

// StepChecks returns the checks of one step, in order.
func (r FeatureReview) StepChecks(step string) []FeatureCheck {
	var out []FeatureCheck
	for _, check := range r.Checks {
		if check.Step == step {
			out = append(out, check)
		}
	}
	return out
}

// AdvanceText is the Polter text that moves a card through a gate: contract
// (shape → plan) or plan (plan → build). It returns error diagnostics
// instead when the card is at another stage or a gate check fails.
func AdvanceText(review FeatureReview, step string) (string, []Diagnostic) {
	card := review.Card
	var from, to string
	switch step {
	case FeatureStepContract:
		from, to = work.StageShape, work.StagePlan
	case FeatureStepPlan:
		from, to = work.StagePlan, work.StageBuild
	default:
		return "", []Diagnostic{{Severity: SeverityError, Message: fmt.Sprintf("unknown step %q: use contract or plan", step)}}
	}
	var diags []Diagnostic
	if card.Stage != from {
		diags = append(diags, Diagnostic{Severity: SeverityError,
			Message: fmt.Sprintf("card %s is in %s: the %s gate moves a card from %s", card.Slug, card.Stage, step, from)})
	}
	for _, check := range review.StepChecks(step) {
		if check.Severity == SeverityError {
			diags = append(diags, Diagnostic{Severity: SeverityError, Message: check.Message})
		}
	}
	if len(diags) > 0 {
		return "", diags
	}
	return fmt.Sprintf("%s\n## %s\nstage: %s\n", Header, card.Slug, to), nil
}

// AdvanceEnvelope is the generated summary and rationale for a gate.
func AdvanceEnvelope(slug, step string) (summary, rationale string) {
	if step == FeatureStepPlan {
		return "Approve plan for " + slug, "The tasks are ready to build; agents can claim them"
	}
	return "Accept contract for " + slug, "Shape is settled: no blocking question is open and the contract is recorded"
}

// CreateFeatureText is the Polter text for a new card in shape. The slug is
// unique among every card, removed ones included, so a new feature never
// restores an old card.
func CreateFeatureText(snapshot work.Snapshot, intent, title, under, kind string) (slug, text string, err error) {
	intent = oneLine(intent)
	if intent == "" {
		return "", "", fmt.Errorf("intent is required: say what the feature should do and why")
	}
	title = oneLine(title)
	if title == "" {
		title = FeatureTitle(intent)
	}
	existing := make([]string, 0, len(snapshot.Cards))
	for _, card := range snapshot.Cards {
		existing = append(existing, card.Slug)
	}
	slug = UniqueCardSlug(existing, title)
	meta := "stage: " + work.StageShape
	if under = strings.TrimSpace(under); under != "" {
		meta += " · under: " + under
	}
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind != "" && !work.ValidKind(kind) {
		return "", "", fmt.Errorf("unknown kind %q: use %s|%s", kind, work.KindFeature, work.KindArchitecture)
	}
	if kind == work.KindArchitecture {
		meta += " · kind: " + kind
	}
	text = fmt.Sprintf("%s\n## %s: %s\n%s\n\n%s\n", Header, slug, title, meta, intent)
	return slug, text, nil
}

// CreateEnvelope is the generated summary and rationale for a new feature.
func CreateEnvelope(title string) (summary, rationale string) {
	return "Create feature: " + title, "Record the intent before shaping, so impact and open questions are visible"
}

// FeatureTitle is the intent's first sentence, cut at a word to about 60
// characters.
func FeatureTitle(intent string) string {
	intent = oneLine(intent)
	for i, r := range intent {
		if (r == '.' || r == '?' || r == '!' || r == ';') && (i+1 == len(intent) || intent[i+1] == ' ') {
			intent = intent[:i]
			break
		}
	}
	runes := []rune(intent)
	if len(runes) <= maxFeatureTitle {
		return strings.TrimSpace(intent)
	}
	cut := string(runes[:maxFeatureTitle])
	if i := strings.LastIndex(cut, " "); i > 0 {
		cut = cut[:i]
	}
	return strings.TrimRightFunc(cut, func(r rune) bool { return unicode.IsPunct(r) || unicode.IsSpace(r) })
}

// UniqueCardSlug is the kebab slug of title, suffixed -2, -3, … when taken.
// It mirrors the Desktop's uniqueCardSlug, folding accents first.
func UniqueCardSlug(existing []string, title string) string {
	base := strings.ReplaceAll(work.NormalizeText(title), " ", "-")
	if runes := []rune(base); len(runes) > maxCardSlugLength {
		base = strings.TrimRight(string(runes[:maxCardSlugLength]), "-")
	}
	if !work.ValidSlug(base) {
		base = "card"
	}
	used := map[string]bool{}
	for _, slug := range existing {
		used[slug] = true
	}
	if !used[base] {
		return base
	}
	for n := 2; ; n++ {
		candidate := fmt.Sprintf("%s-%d", base, n)
		if !used[candidate] {
			return candidate
		}
	}
}

// EncodeFeatureReview renders the review for one step: the Shape impact,
// the step's own section (contract invariants or tasks), its checks, and
// the next command when nothing blocks.
func EncodeFeatureReview(review FeatureReview, step string) string {
	card := review.Card
	var b strings.Builder
	fmt.Fprintf(&b, "%s  %s  %q\n", card.Slug, card.Stage, card.Title)
	switch {
	case review.Under != nil:
		fmt.Fprintf(&b, "Under: %s %q\n", review.Under.Path, review.Under.Title)
	case card.Under != "":
		fmt.Fprintf(&b, "Under: %s\n", card.Under)
	case len(review.Suggested) > 0:
		fmt.Fprintf(&b, "Under: none (suggested %s)\n", strings.Join(review.Suggested, ", "))
	default:
		b.WriteString("Under: none\n")
	}
	if len(review.Touches) > 0 {
		paths := make([]string, 0, len(review.Touches))
		for _, node := range review.Touches {
			paths = append(paths, node.Path)
		}
		fmt.Fprintf(&b, "Touches: %s\n", strings.Join(paths, ", "))
	}
	for _, decision := range review.Decisions {
		fmt.Fprintf(&b, "Applies: %s\n", decisionLine(decision))
	}
	for _, inv := range review.Inherited {
		fmt.Fprintf(&b, "Inherits: ! %s (from %s)\n", inv.Text, inv.From)
	}
	for _, q := range review.Questions {
		fmt.Fprintf(&b, "Open: %s\n", questionLine(q))
	}
	switch step {
	case FeatureStepContract:
		for _, inv := range card.Invariants {
			if inv.State == work.InvariantActive {
				fmt.Fprintf(&b, "Contract: ! %s\n", inv.Text)
			}
		}
	case FeatureStepPlan:
		for _, task := range card.Tasks {
			if task.State == work.TaskDropped {
				continue
			}
			fmt.Fprintf(&b, "Task: %s\n", reviewTaskLine(task))
		}
	}
	checks := review.StepChecks(step)
	blocked := false
	for _, check := range checks {
		fmt.Fprintf(&b, "%s: %s\n", check.Severity, check.Message)
		blocked = blocked || check.Severity == SeverityError
	}
	if !blocked {
		switch {
		case step == FeatureStepShape && card.Stage == work.StageShape:
			fmt.Fprintf(&b, "next: polterware feature contract %s --accept\n", card.Slug)
		case step == FeatureStepContract && card.Stage == work.StageShape:
			fmt.Fprintf(&b, "next: polterware feature contract %s --accept\n", card.Slug)
		case step == FeatureStepPlan && card.Stage == work.StagePlan:
			fmt.Fprintf(&b, "next: polterware feature plan %s --approve\n", card.Slug)
		}
	}
	return b.String()
}

func decisionLine(decision ReviewDecision) string {
	line := decision.Ref
	if decision.Title != "" {
		line = decision.Title
	}
	if decision.Status != "" {
		line += " (" + decision.Status + ")"
	} else if decision.ID == "" {
		line += " (no Decision)"
	}
	if decision.From != "card" {
		line += " via " + decision.From
	}
	return line
}

func questionLine(q ReviewQuestion) string {
	line := "? " + q.Text
	if q.Blocking {
		line += " [blocking]"
	}
	if len(q.Options) > 0 {
		line += " (" + strings.Join(q.Options, " | ") + ")"
	}
	if q.Route == RouteAnswered {
		return line + " -> " + q.Answer
	}
	return line + " → " + q.Route
}

func reviewTaskLine(task work.Task) string {
	mark := "[ ]"
	if task.State == work.TaskDone {
		mark = "[x]"
	}
	line := fmt.Sprintf("%s T%d %s", mark, task.Number, task.Title)
	if task.Repo != "" {
		line += " [repo: " + task.Repo + "]"
	}
	if task.Scope != "" {
		line += " `" + task.Scope + "`"
	}
	return line
}

// stageHints warns when a card moves past shape while a blocking question is
// still open. The Board and apply stay a manual override, so it never blocks.
func stageHints(doc Document, cards []work.Card) []Diagnostic {
	var diags []Diagnostic
	for _, node := range doc.Cards {
		var entry MetaEntry
		for _, meta := range node.Meta {
			if meta.Key == "stage" {
				entry = meta
			}
		}
		if entry.Key == "" {
			continue
		}
		stored, ok := findCard(cards, node.Slug)
		if !ok || stageIndex(entry.Value) <= stageIndex(stored.Stage) {
			continue
		}
		for _, q := range stored.Questions {
			if q.State != work.QuestionOpen || !q.Blocking || answeredIn(node, q.Text) {
				continue
			}
			diags = append(diags, Diagnostic{Line: entry.Line, Severity: SeverityHint,
				Message: fmt.Sprintf("stage %s with blocking question %q open: answer it with `? %s -> <answer>`", entry.Value, q.Text, q.Text)})
		}
	}
	return diags
}

func stageIndex(stage string) int {
	for i, s := range work.Stages {
		if s == stage {
			return i
		}
	}
	return -1
}

func answeredIn(node CardNode, text string) bool {
	want := work.NormalizeText(text)
	for _, q := range node.Questions {
		if q.Answer != "" && work.NormalizeText(q.Text) == want {
			return true
		}
	}
	return false
}

func containsNodePath(nodes []structure.Node, path string) bool {
	for _, node := range nodes {
		if node.Path == path {
			return true
		}
	}
	return false
}

func oneLine(text string) string {
	return strings.Join(strings.Fields(text), " ")
}
