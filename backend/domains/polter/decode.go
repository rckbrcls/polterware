// Package polter is the Polter format codec: the markdown dialect agents use to
// read and write Polterware Work state. It is pure (no store) so CLI, MCP,
// Desktop (through the core), and Cloud share the same code.
package polter

import (
	"fmt"
	"path"
	"regexp"
	"strconv"
	"strings"

	"github.com/polterware/polterware/backend/domains/atlas"
	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/work"
)

// Version is the grammar version this codec reads and writes.
const Version = 1

const (
	SeverityError = "error"
	SeverityHint  = "hint"
)

// Diagnostic is one line-numbered lint result. Message already contains the fix.
type Diagnostic struct {
	Line     int
	Severity string
	Message  string
}

// HasErrors reports whether any diagnostic is an error.
func HasErrors(diags []Diagnostic) bool {
	for _, d := range diags {
		if d.Severity == SeverityError {
			return true
		}
	}
	return false
}

// Document is the decoded AST of one Polter text.
type Document struct {
	Version   int
	Summary   string
	Rationale string
	Nodes     []AtlasNode
	Cards     []CardNode
	Decisions []DecisionNode
}

// DecisionNode is one `### ref: Title` block: an Verdict lifecycle change. Ref is
// `new` for a proposal, otherwise an Verdict id, number, or title. The body after
// the metadata is the Verdict text.
type DecisionNode struct {
	Line    int
	Ref     string
	Title   string
	Meta    []MetaEntry
	Body    string
	BodySet bool
}

// MetaValue returns the last value given for key.
func (n DecisionNode) MetaValue(key string) (string, bool) {
	value, found := "", false
	for _, entry := range n.Meta {
		if entry.Key == key {
			value, found = entry.Value, true
		}
	}
	return value, found
}

// DecisionMetaKeys are the decision metadata keys. supersedes: names the
// older decision the block's decision replaces; trigger: is the review
// trigger; reason: explains a challenge or a supersede.
var DecisionMetaKeys = []string{"status", "supersedes", "trigger", "reason", "scope"}

// DecisionNewRef is the ref that proposes a new decision.
const DecisionNewRef = "new"

// AtlasNode is a system, domain, or component. Path is the heading path
// (`core` or `core/import`); the store materializes it with under:.
type AtlasNode struct {
	Line       int
	Slug       string
	Path       string
	Title      string
	Meta       []MetaEntry
	Intent     string
	IntentSet  bool
	Invariants []InvariantNode
}

// MetaValue returns the last value given for key.
func (n AtlasNode) MetaValue(key string) (string, bool) {
	value, found := "", false
	for _, entry := range n.Meta {
		if entry.Key == key {
			value, found = entry.Value, true
		}
	}
	return value, found
}

type MetaEntry struct {
	Key   string
	Value string
	Line  int
}

type CardNode struct {
	Line       int
	Slug       string
	Title      string
	Meta       []MetaEntry
	Intent     string
	IntentSet  bool
	Tasks      []TaskNode
	Questions  []QuestionNode
	Invariants []InvariantNode
	Handoff    *HandoffNode
	// Coordination holds claim, done, and release lines. They act on stored
	// tasks for the session's agent and are never encoded back.
	Coordination []CoordNode
}

const (
	CoordClaim   = "claim"
	CoordDone    = "done"
	CoordRelease = "release"
)

// CoordNode is one coordination line: `claim: T2`, `done: T2`, `release: T2`.
type CoordNode struct {
	Line   int
	Action string
	Number int
}

// HandoffNode is one handoff block inside a card. Branch is required.
type HandoffNode struct {
	Line       int
	Branch     string
	Agent      string
	Goal       string
	Done       string
	InProgress string
	Next       string
	Touched    []string
}

// MetaValue returns the last value given for key.
func (c CardNode) MetaValue(key string) (string, bool) {
	value, found := "", false
	for _, entry := range c.Meta {
		if entry.Key == key {
			value, found = entry.Value, true
		}
	}
	return value, found
}

type TaskNode struct {
	Line   int
	Number int
	Title  string
	State  string
	// Repo is the checkout from `[repo: api]` or a `api:` scope prefix.
	Repo string
	// Scope is the glob without its checkout prefix.
	Scope string
}

type QuestionNode struct {
	Line     int
	Text     string
	Blocking bool
	Options  []string
	Removed  bool
	// Answer is the decision written after " -> "; it closes the question.
	Answer string
}

type InvariantNode struct {
	Line    int
	Text    string
	Removed bool
}

// MetaKeys are the card metadata keys grammar v1 accepts.
var MetaKeys = []string{"stage", "owner", "under", "decisions", "status", "kind"}

// NodeMetaKeys are the Atlas node metadata keys. repo: names a registered
// checkout (empty is the project root); path: is a folder inside it.
var NodeMetaKeys = []string{"level", "under", "repo", "path", "decisions", "uses", "status", "migrating"}

var frontmatterKeys = map[string]bool{"polter": true, "summary": true, "rationale": true}

var (
	taskLine      = regexp.MustCompile(`^[-*+]\s+\[([ xX\-])\]\s*(.*)$`)
	badTaskLine   = regexp.MustCompile(`^[-*+]\s+\[[^\]]*\]`)
	taskNumber    = regexp.MustCompile(`^[Tt](\d+)\s+(.*)$`)
	trailingScope = regexp.MustCompile("^(.*?)\\s*`([^`]+)`$")
	metaKey       = regexp.MustCompile(`^([a-z_]+):\s*(.*)$`)
	trailingTag   = regexp.MustCompile(`^(.*?)\s*\[([a-zA-Z]+)\]$`)
	trailingRepo  = regexp.MustCompile(`^(.*?)\s*\[repo:\s*([^\]]*)\]$`)
	trailingOpts  = regexp.MustCompile(`^(.*?)\s*\(([^()]*\|[^()]*)\)$`)
	metaSplitter  = regexp.MustCompile(`\s+[·•]\s+|\s+-\s+`)
	coordLine     = regexp.MustCompile(`^(claim|done|release):\s*(.*)$`)
	coordTask     = regexp.MustCompile(`^[Tt]([1-9]\d*)$`)
)

// Decode parses Polter text into a Document. Syntax problems are returned as
// diagnostics; decoding always continues so every error is reported at once.
func Decode(text string) (Document, []Diagnostic) {
	d := decoder{lines: strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")}
	d.run()
	return d.doc, d.diags
}

type decoder struct {
	lines []string
	doc   Document
	diags []Diagnostic

	card       *CardNode
	node       *AtlasNode
	decision   *DecisionNode
	decRefs    map[string]int
	inMeta     bool
	inHandoff  bool
	inFence    bool
	intent     []string
	slugLines  map[string]int
	pathLines  map[string]int
	sawVersion bool
}

func (d *decoder) errorf(line int, format string, args ...any) {
	d.diags = append(d.diags, Diagnostic{Line: line, Severity: SeverityError, Message: fmt.Sprintf(format, args...)})
}

func (d *decoder) run() {
	d.slugLines = map[string]int{}
	d.pathLines = map[string]int{}
	d.decRefs = map[string]int{}
	start := d.frontmatter()
	if !d.sawVersion {
		d.errorf(1, `missing version header: start with "---", "polter: 1", "---"`)
	}
	for i := start; i < len(d.lines); i++ {
		d.line(i+1, d.lines[i])
	}
	d.closeCard()
	d.closeNode()
	d.closeDecision()
}

// frontmatter consumes the leading --- block and returns the next line index.
func (d *decoder) frontmatter() int {
	first := 0
	for first < len(d.lines) && strings.TrimSpace(d.lines[first]) == "" {
		first++
	}
	if first >= len(d.lines) || strings.TrimSpace(d.lines[first]) != "---" {
		return 0
	}
	for i := first + 1; i < len(d.lines); i++ {
		raw := strings.TrimSpace(d.lines[i])
		if raw == "---" {
			return i + 1
		}
		if raw == "" || strings.HasPrefix(raw, "#") {
			continue
		}
		m := metaKey.FindStringSubmatch(raw)
		if m == nil || !frontmatterKeys[m[1]] {
			d.errorf(i+1, "unknown frontmatter line %q: use polter, summary, or rationale", raw)
			continue
		}
		value := strings.TrimSpace(m[2])
		switch m[1] {
		case "polter":
			version, err := strconv.Atoi(value)
			if err != nil || version != Version {
				d.errorf(i+1, "unsupported version %q: use polter: 1", value)
			}
			d.doc.Version = version
			d.sawVersion = true
		case "summary":
			d.doc.Summary = value
		case "rationale":
			d.doc.Rationale = value
		}
	}
	d.errorf(first+1, `unclosed frontmatter: end it with "---"`)
	return len(d.lines)
}

func (d *decoder) line(n int, raw string) {
	trimmed := strings.TrimSpace(raw)

	if d.inFence {
		d.intent = append(d.intent, raw)
		if strings.HasPrefix(trimmed, "```") {
			d.inFence = false
		}
		return
	}

	switch {
	case strings.HasPrefix(trimmed, "### "):
		d.endHandoff()
		d.decisionHeading(n, strings.TrimSpace(trimmed[4:]))
		return
	case strings.HasPrefix(trimmed, "## "):
		d.endHandoff()
		d.heading(n, strings.TrimSpace(trimmed[3:]))
		return
	case strings.HasPrefix(trimmed, "# "):
		d.endHandoff()
		body := strings.TrimSpace(trimmed[2:])
		if slug, headingPath, title, ok, invalid := splitNodeHeading(body); ok {
			d.nodeHeading(n, slug, headingPath, title)
			return
		} else if invalid {
			d.errorf(n, "invalid node path %q: use lowercase-kebab segments like core/import", headingPath)
			return
		}
		// A document title without a colon carries no state.
		d.inMeta = false
		return
	case strings.HasPrefix(trimmed, "#"):
		d.endHandoff()
		d.errorf(n, `unsupported heading: cards use "## slug: title", decisions "### Verdict-0007: title"`)
		return
	}

	if d.decision != nil {
		d.decisionLine(n, raw, trimmed)
		return
	}

	if d.inHandoff && d.card != nil {
		if d.handoffLine(n, trimmed) {
			return
		}
	}

	if d.card == nil {
		if d.node != nil {
			d.nodeLine(n, raw, trimmed)
			return
		}
		switch {
		case taskLine.MatchString(trimmed) || badTaskLine.MatchString(trimmed):
			d.errorf(n, `task outside a card: move under a "## slug: title"`)
		case strings.HasPrefix(trimmed, "? "):
			d.errorf(n, `question outside a card: move under a "## slug: title"`)
		case strings.HasPrefix(trimmed, "! "):
			d.errorf(n, `invariant outside a card: move under a "## slug: title"`)
		case trimmed == "handoff:" || strings.HasPrefix(trimmed, "handoff:"):
			d.errorf(n, `handoff outside a card: move under a "## slug: title"`)
		case coordLine.MatchString(trimmed):
			d.errorf(n, `claim outside a card: move under a "## slug: title"`)
		}
		return
	}

	if trimmed == "" {
		d.inMeta = false
		d.intent = append(d.intent, "")
		return
	}

	if d.inMeta {
		if m := metaKey.FindStringSubmatch(trimmed); m != nil {
			d.meta(n, trimmed)
			return
		}
		d.inMeta = false
	}

	switch {
	case trimmed == "handoff:" || strings.HasPrefix(trimmed, "handoff:"):
		d.startHandoff(n, trimmed)
	case coordLine.MatchString(trimmed):
		m := coordLine.FindStringSubmatch(trimmed)
		d.coord(n, m[1], strings.TrimSpace(m[2]))
	case taskLine.MatchString(trimmed):
		d.task(n, trimmed)
	case badTaskLine.MatchString(trimmed):
		d.errorf(n, "malformed checkbox: use - [ ] open, - [x] done, or - [-] dropped")
	case strings.HasPrefix(trimmed, "? "):
		d.question(n, strings.TrimSpace(trimmed[2:]))
	case strings.HasPrefix(trimmed, "! "):
		d.invariant(n, strings.TrimSpace(trimmed[2:]))
	default:
		if strings.HasPrefix(trimmed, "```") {
			d.inFence = true
		}
		d.intent = append(d.intent, raw)
	}
}

func (d *decoder) heading(n int, body string) {
	d.closeCard()
	d.closeNode()
	d.closeDecision()
	slug, title := body, ""
	if idx := strings.Index(body, ":"); idx >= 0 {
		slug = strings.TrimSpace(body[:idx])
		title = strings.TrimSpace(body[idx+1:])
	}
	if !work.ValidSlug(slug) {
		d.errorf(n, "invalid slug %q: use lowercase-kebab like git-import", slug)
	}
	if prev, dup := d.slugLines[slug]; dup {
		d.errorf(n, "duplicate slug %q (also line %d): merge the two cards", slug, prev)
	} else {
		d.slugLines[slug] = n
	}
	d.card = &CardNode{Line: n, Slug: slug, Title: title}
	d.inMeta = true
	d.intent = nil
}

func (d *decoder) meta(n int, line string) {
	for _, part := range metaSplitter.Split(line, -1) {
		m := metaKey.FindStringSubmatch(strings.TrimSpace(part))
		if m == nil {
			d.errorf(n, "malformed metadata %q: use key: value", part)
			continue
		}
		key, value := m[1], strings.TrimSpace(m[2])
		if key == CoordClaim || key == CoordDone || key == CoordRelease {
			d.coord(n, key, value)
			continue
		}
		if key == "handoff" {
			d.startHandoff(n, "handoff:")
			if value != "" {
				d.errorf(n, `handoff block starts with "handoff:" on its own line`)
			}
			continue
		}
		switch key {
		case "stage":
			value = strings.ToLower(value)
			if !work.ValidStage(value) {
				d.errorf(n, "unknown stage %q: use %s", value, strings.Join(work.Stages, "|"))
			}
		case "status":
			value = strings.ToLower(value)
			if !work.ValidCardStatus(value) {
				d.errorf(n, "unknown status %q: use active|removed", value)
			}
		case "kind":
			value = strings.ToLower(value)
			if !work.ValidKind(value) {
				d.errorf(n, "unknown kind %q: use %s|%s", value, work.KindFeature, work.KindArchitecture)
			}
		case "owner", "under", "decisions":
		default:
			d.errorf(n, "unknown key %q: use %s", key, strings.Join(MetaKeys, ", "))
			continue
		}
		d.card.Meta = append(d.card.Meta, MetaEntry{Key: key, Value: value, Line: n})
	}
}

// coord records a coordination line; value lists task numbers (T2, T3).
func (d *decoder) coord(n int, action, value string) {
	d.inMeta = false
	tasks := splitList(value)
	if len(tasks) == 0 {
		d.errorf(n, "%s needs a task: write %s: T2", action, action)
		return
	}
	for _, task := range tasks {
		m := coordTask.FindStringSubmatch(task)
		if m == nil {
			d.errorf(n, "invalid task %q in %s: use T<n> like T2", task, action)
			continue
		}
		number, _ := strconv.Atoi(m[1])
		d.card.Coordination = append(d.card.Coordination, CoordNode{Line: n, Action: action, Number: number})
	}
}

func (d *decoder) startHandoff(n int, trimmed string) {
	d.inMeta = false
	value := ""
	if strings.HasPrefix(trimmed, "handoff:") {
		value = strings.TrimSpace(strings.TrimPrefix(trimmed, "handoff:"))
	}
	if d.card.Handoff != nil {
		d.errorf(n, "duplicate handoff in %q: one handoff block per card", d.card.Slug)
		d.inHandoff = true
		return
	}
	if value != "" {
		d.errorf(n, `handoff block starts with "handoff:" on its own line`)
	}
	d.card.Handoff = &HandoffNode{Line: n}
	d.inHandoff = true
}

// handoffLine consumes a line inside a handoff block. It reports false when
// the line ends the block and the caller should parse it as a normal line.
func (d *decoder) handoffLine(n int, trimmed string) bool {
	if trimmed == "" || taskLine.MatchString(trimmed) || badTaskLine.MatchString(trimmed) ||
		strings.HasPrefix(trimmed, "? ") || strings.HasPrefix(trimmed, "! ") || strings.HasPrefix(trimmed, "```") {
		d.endHandoff()
		return false
	}
	m := metaKey.FindStringSubmatch(trimmed)
	if m == nil {
		d.endHandoff()
		return false
	}
	key, value := m[1], strings.TrimSpace(m[2])
	switch key {
	case "branch":
		d.card.Handoff.Branch = value
	case "agent":
		d.card.Handoff.Agent = value
	case "goal":
		d.card.Handoff.Goal = value
	case "done":
		d.card.Handoff.Done = value
	case "in_progress":
		d.card.Handoff.InProgress = value
	case "next":
		d.card.Handoff.Next = value
	case "touched":
		d.card.Handoff.Touched = splitList(value)
	default:
		d.errorf(n, "unknown handoff key %q: use branch, agent, goal, done, in_progress, next, touched", key)
	}
	return true
}

func (d *decoder) endHandoff() {
	if !d.inHandoff {
		return
	}
	d.inHandoff = false
	if d.card == nil || d.card.Handoff == nil {
		return
	}
	if strings.TrimSpace(d.card.Handoff.Branch) == "" {
		d.errorf(d.card.Handoff.Line, `handoff needs branch: add "branch: <name>"`)
	}
}

func (d *decoder) task(n int, line string) {
	m := taskLine.FindStringSubmatch(line)
	state := work.TaskOpen
	switch m[1] {
	case "x", "X":
		state = work.TaskDone
	case "-":
		state = work.TaskDropped
	}
	body := strings.TrimSpace(m[2])
	node := TaskNode{Line: n, State: state}
	if nm := taskNumber.FindStringSubmatch(body); nm != nil {
		node.Number, _ = strconv.Atoi(nm[1])
		body = strings.TrimSpace(nm[2])
		for _, existing := range d.card.Tasks {
			if existing.Number == node.Number {
				d.errorf(n, "duplicate task T%d (also line %d): renumber or merge", node.Number, existing.Line)
			}
		}
	}
	// `[repo: api]` may come before or after the trailing `scope`.
	body = d.taskRepo(n, body, &node)
	if sm := trailingScope.FindStringSubmatch(body); sm != nil {
		body = strings.TrimSpace(sm[1])
		repo, glob := work.SplitScope(sm[2])
		node.Scope = glob
		if _, err := path.Match(node.Scope, ""); err != nil || node.Scope == "" {
			d.errorf(n, "invalid scope %q: use a path glob like src/auth/* or api:src/auth/*", strings.TrimSpace(sm[2]))
		}
		if repo != "" {
			if node.Repo != "" && node.Repo != repo {
				d.errorf(n, "task repo %q and scope repo %q differ: keep one", node.Repo, repo)
			}
			node.Repo = repo
		}
	}
	body = d.taskRepo(n, body, &node)
	if body == "" {
		d.errorf(n, "task without a title: write it after the checkbox")
	}
	node.Title = body
	d.card.Tasks = append(d.card.Tasks, node)
}

// taskRepo strips a trailing `[repo: name]` from a task body.
func (d *decoder) taskRepo(n int, body string, node *TaskNode) string {
	m := trailingRepo.FindStringSubmatch(body)
	if m == nil {
		return body
	}
	repo := strings.TrimSpace(m[2])
	switch {
	case !work.ValidSlug(repo):
		d.errorf(n, "invalid repo %q: use a registered checkout name like api", repo)
	case node.Repo != "" && node.Repo != repo:
		d.errorf(n, "task repo %q and scope repo %q differ: keep one", repo, node.Repo)
	default:
		node.Repo = repo
	}
	return strings.TrimSpace(m[1])
}

func (d *decoder) question(n int, body string) {
	node := QuestionNode{Line: n}
	// The answer comes last: `? Text [blocking] (a | b) -> a`.
	if i := strings.LastIndex(body, " -> "); i >= 0 {
		node.Answer = strings.TrimSpace(body[i+len(" -> "):])
		body = strings.TrimSpace(body[:i])
		if node.Answer == "" {
			d.errorf(n, "question answer is empty: write it after ->")
		}
	} else if strings.HasSuffix(body, " ->") {
		d.errorf(n, "question answer is empty: write it after ->")
		body = strings.TrimSpace(strings.TrimSuffix(body, " ->"))
	}
	accept := func(tag string) bool {
		switch tag {
		case "blocking":
			node.Blocking = true
		case "removed":
			node.Removed = true
		default:
			return false
		}
		return true
	}
	// Tags may follow the options too: `? Text (a | b) [removed]`.
	body = d.tags(n, body, accept, "blocking or removed")
	if om := trailingOpts.FindStringSubmatch(body); om != nil {
		body = strings.TrimSpace(om[1])
		for _, option := range strings.Split(om[2], "|") {
			if option = strings.TrimSpace(option); option != "" {
				node.Options = append(node.Options, option)
			}
		}
	}
	body = d.tags(n, body, accept, "blocking or removed")
	if body == "" {
		d.errorf(n, "question without text: write it after ?")
	}
	if node.Removed && node.Answer != "" {
		d.errorf(n, "question is both answered and removed: keep one")
	}
	node.Text = body
	d.card.Questions = append(d.card.Questions, node)
}

func (d *decoder) invariant(n int, body string) {
	node := InvariantNode{Line: n}
	body = d.tags(n, body, func(tag string) bool {
		if tag == "removed" {
			node.Removed = true
			return true
		}
		return false
	}, "removed")
	if body == "" {
		d.errorf(n, "invariant without text: write it after !")
	}
	node.Text = body
	d.card.Invariants = append(d.card.Invariants, node)
}

// tags strips trailing [tag] markers, reporting unknown ones.
func (d *decoder) tags(n int, body string, accept func(string) bool, allowed string) string {
	for {
		m := trailingTag.FindStringSubmatch(body)
		if m == nil {
			return body
		}
		tag := strings.ToLower(m[2])
		if !accept(tag) {
			d.errorf(n, "unknown tag [%s]: use %s", m[2], allowed)
		}
		body = strings.TrimSpace(m[1])
	}
}

func (d *decoder) closeCard() {
	if d.card == nil {
		return
	}
	d.endHandoff()
	if d.inFence {
		d.errorf(d.card.Line, "unclosed code fence in card %q: close it with ```", d.card.Slug)
		d.inFence = false
	}
	intent := strings.TrimSpace(strings.Join(d.intent, "\n"))
	if intent != "" {
		d.card.Intent = collapseBlankLines(intent)
		d.card.IntentSet = true
	}
	d.doc.Cards = append(d.doc.Cards, *d.card)
	d.card = nil
	d.intent = nil
	d.inMeta = false
}

// splitNodeHeading parses `# path: Title`. ok is a node heading. invalid is a
// colon whose path is not kebab segments. A line with no colon is a title.
func splitNodeHeading(body string) (slug, headingPath, title string, ok, invalid bool) {
	idx := strings.Index(body, ":")
	if idx < 0 {
		return "", "", "", false, false
	}
	headingPath = strings.TrimSpace(body[:idx])
	title = strings.TrimSpace(body[idx+1:])
	parts := strings.Split(headingPath, "/")
	if headingPath == "" || len(parts) == 0 {
		return "", headingPath, title, false, true
	}
	for _, part := range parts {
		if !work.ValidSlug(part) {
			return "", headingPath, title, false, true
		}
	}
	return parts[len(parts)-1], headingPath, title, true, false
}

func (d *decoder) nodeHeading(n int, slug, headingPath, title string) {
	d.closeCard()
	d.closeNode()
	d.closeDecision()
	if prev, dup := d.pathLines[headingPath]; dup {
		d.errorf(n, "duplicate path %q (also line %d): merge the two nodes", headingPath, prev)
	} else {
		d.pathLines[headingPath] = n
	}
	d.node = &AtlasNode{Line: n, Slug: slug, Path: headingPath, Title: title}
	d.inMeta = true
	d.intent = nil
}

func (d *decoder) nodeLine(n int, raw, trimmed string) {
	if trimmed == "" {
		d.inMeta = false
		d.intent = append(d.intent, "")
		return
	}
	if d.inMeta {
		if m := metaKey.FindStringSubmatch(trimmed); m != nil {
			d.nodeMeta(n, trimmed)
			return
		}
		d.inMeta = false
	}
	switch {
	case taskLine.MatchString(trimmed) || badTaskLine.MatchString(trimmed):
		d.errorf(n, `task outside a card: move under a "## slug: title"`)
	case strings.HasPrefix(trimmed, "? "):
		d.errorf(n, `question outside a card: move under a "## slug: title"`)
	case trimmed == "handoff:" || strings.HasPrefix(trimmed, "handoff:"):
		d.errorf(n, `handoff outside a card: move under a "## slug: title"`)
	case coordLine.MatchString(trimmed):
		d.errorf(n, `claim outside a card: move under a "## slug: title"`)
	case strings.HasPrefix(trimmed, "! "):
		d.nodeInvariant(n, strings.TrimSpace(trimmed[2:]))
	default:
		if strings.HasPrefix(trimmed, "```") {
			d.inFence = true
		}
		d.intent = append(d.intent, raw)
	}
}

func (d *decoder) nodeMeta(n int, line string) {
	for _, part := range metaSplitter.Split(line, -1) {
		m := metaKey.FindStringSubmatch(strings.TrimSpace(part))
		if m == nil {
			d.errorf(n, "malformed metadata %q: use key: value", part)
			continue
		}
		key, value := m[1], strings.TrimSpace(m[2])
		switch key {
		case "level":
			value = strings.ToLower(value)
			if !atlas.ValidLevel(value) {
				d.errorf(n, "unknown level %q: use %s", value, strings.Join(atlas.Levels, "|"))
			}
		case "status":
			value = strings.ToLower(value)
			if !work.ValidCardStatus(value) {
				d.errorf(n, "unknown status %q: use active|removed", value)
			}
		case "repo":
			if value != "" && !work.ValidSlug(value) {
				d.errorf(n, "invalid repo %q: use a registered checkout name like api", value)
			}
		case "path":
			folder, ok := CleanFolder(value)
			if !ok {
				d.errorf(n, "invalid path %q: use a folder inside the checkout like src/auth", value)
			}
			value = folder
		case "migrating":
			from, to, ok := ParseMigration(value)
			if !ok {
				d.errorf(n, "invalid migrating %q: write migrating: old design -> new design, or leave it empty to clear", value)
			}
			if from != "" {
				value = from + " -> " + to
			}
		case "under", "decisions", "uses":
		default:
			d.errorf(n, "unknown key %q: use %s", key, strings.Join(NodeMetaKeys, ", "))
			continue
		}
		d.node.Meta = append(d.node.Meta, MetaEntry{Key: key, Value: value, Line: n})
	}
}

// CleanFolder normalizes a node path: value, a folder relative to its
// checkout. Empty is the checkout root. Absolute paths and ".." are refused.
func CleanFolder(value string) (string, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", true
	}
	if strings.HasPrefix(value, "/") || strings.Contains(value, "\\") || strings.ContainsAny(value, "*?[") {
		return value, false
	}
	cleaned := path.Clean(value)
	if cleaned == "." {
		return "", true
	}
	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return value, false
	}
	return cleaned, true
}

func (d *decoder) nodeInvariant(n int, body string) {
	node := InvariantNode{Line: n}
	body = d.tags(n, body, func(tag string) bool {
		if tag == "removed" {
			node.Removed = true
			return true
		}
		return false
	}, "removed")
	if body == "" {
		d.errorf(n, "invariant without text: write it after !")
	}
	node.Text = body
	d.node.Invariants = append(d.node.Invariants, node)
}

func (d *decoder) closeNode() {
	if d.node == nil {
		return
	}
	if d.inFence {
		d.errorf(d.node.Line, "unclosed code fence in node %q: close it with ```", d.node.Path)
		d.inFence = false
	}
	intent := strings.TrimSpace(strings.Join(d.intent, "\n"))
	if intent != "" {
		d.node.Intent = collapseBlankLines(intent)
		d.node.IntentSet = true
	}
	d.doc.Nodes = append(d.doc.Nodes, *d.node)
	d.node = nil
	d.intent = nil
	d.inMeta = false
}

func collapseBlankLines(text string) string {
	lines := strings.Split(text, "\n")
	out := lines[:0]
	blank := false
	for _, line := range lines {
		line = strings.TrimRight(line, " \t")
		if line == "" {
			if blank {
				continue
			}
			blank = true
		} else {
			blank = false
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n")
}

func (d *decoder) decisionHeading(n int, body string) {
	d.closeCard()
	d.closeNode()
	d.closeDecision()
	ref, title := body, ""
	if idx := strings.Index(body, ":"); idx >= 0 {
		ref = strings.TrimSpace(body[:idx])
		title = strings.TrimSpace(body[idx+1:])
	}
	if ref == "" {
		d.errorf(n, `decision needs a reference: write "### Verdict-0007: title" or "### new: title"`)
	}
	key := strings.ToLower(ref)
	if prev, dup := d.decRefs[key]; dup && key != DecisionNewRef {
		d.errorf(n, "duplicate decision %q (also line %d): merge the two blocks", ref, prev)
	} else {
		d.decRefs[key] = n
	}
	d.decision = &DecisionNode{Line: n, Ref: ref, Title: title}
	d.inMeta = true
	d.intent = nil
}

func (d *decoder) decisionLine(n int, raw, trimmed string) {
	if trimmed == "" {
		d.inMeta = false
		d.intent = append(d.intent, "")
		return
	}
	if d.inMeta {
		if metaKey.MatchString(trimmed) {
			d.decisionMeta(n, trimmed)
			return
		}
		d.inMeta = false
	}
	if strings.HasPrefix(trimmed, "```") {
		d.inFence = true
	}
	d.intent = append(d.intent, raw)
}

func (d *decoder) decisionMeta(n int, line string) {
	for _, part := range metaSplitter.Split(line, -1) {
		m := metaKey.FindStringSubmatch(strings.TrimSpace(part))
		if m == nil {
			d.errorf(n, "malformed metadata %q: use key: value", part)
			continue
		}
		key, value := m[1], strings.TrimSpace(m[2])
		switch key {
		case "status":
			value = strings.ToLower(value)
			if !decision.ValidState(value) {
				d.errorf(n, "unknown decision status %q: use %s", value, strings.Join(decision.States, "|"))
			}
		case "supersedes", "trigger", "reason", "scope":
		default:
			d.errorf(n, "unknown key %q: use %s", key, strings.Join(DecisionMetaKeys, ", "))
			continue
		}
		d.decision.Meta = append(d.decision.Meta, MetaEntry{Key: key, Value: value, Line: n})
	}
}

func (d *decoder) closeDecision() {
	if d.decision == nil {
		return
	}
	if d.inFence {
		d.errorf(d.decision.Line, "unclosed code fence in decision %q: close it with ```", d.decision.Ref)
		d.inFence = false
	}
	body := strings.TrimSpace(strings.Join(d.intent, "\n"))
	if body != "" {
		d.decision.Body = collapseBlankLines(body)
		d.decision.BodySet = true
	}
	d.doc.Decisions = append(d.doc.Decisions, *d.decision)
	d.decision = nil
	d.intent = nil
	d.inMeta = false
}

// ParseMigration splits a `migrating:` value ("A -> B" or "A → B") into its
// two sides. An empty value clears the state and returns ok with empty sides.
func ParseMigration(value string) (from, to string, ok bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", "", true
	}
	value = strings.Replace(value, "→", "->", 1)
	left, right, found := strings.Cut(value, "->")
	if !found {
		return "", "", false
	}
	from, to = strings.TrimSpace(left), strings.TrimSpace(right)
	if from == "" || to == "" {
		return "", "", false
	}
	return from, to, true
}
