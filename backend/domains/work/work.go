// Package work is the relational Work model: cards (features) with tasks,
// open questions, and contract invariants. Agents write it through the Polter
// codec; every mutation is an Op recorded in the change operation log.
package work

import (
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/structure"
	"golang.org/x/text/unicode/norm"
)

const (
	StageShape     = "shape"
	StagePlan      = "plan"
	StageBuild     = "build"
	StageVerify    = "verify"
	StageDelivered = "delivered"

	KindFeature      = "feature"
	KindArchitecture = "architecture"

	CardActive  = "active"
	CardRemoved = "removed"

	TaskOpen    = "open"
	TaskDone    = "done"
	TaskDropped = "dropped"

	QuestionOpen     = "open"
	QuestionAnswered = "answered"
	QuestionRemoved  = "removed"

	InvariantActive  = "active"
	InvariantRemoved = "removed"
)

// Stages lists card stages in board order.
var Stages = []string{StageShape, StagePlan, StageBuild, StageVerify, StageDelivered}

func ValidStage(stage string) bool {
	for _, s := range Stages {
		if s == stage {
			return true
		}
	}
	return false
}

func ValidCardStatus(status string) bool {
	return status == CardActive || status == CardRemoved
}

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// ValidSlug reports whether slug is a lowercase kebab-case handle.
func ValidSlug(slug string) bool {
	return len(slug) <= 80 && slugPattern.MatchString(slug)
}

// NormalizeText folds case, accents, punctuation, and whitespace so that two
// spellings of the same task or question compare equal.
func NormalizeText(value string) string {
	decomposed := norm.NFD.String(value)
	var b strings.Builder
	space := false
	for _, r := range decomposed {
		switch {
		case unicode.Is(unicode.Mn, r):
			continue
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			if space && b.Len() > 0 {
				b.WriteByte(' ')
			}
			space = false
			b.WriteRune(unicode.ToLower(r))
		default:
			space = true
		}
	}
	return b.String()
}

// ValidKind reports whether kind is a card kind.
func ValidKind(kind string) bool {
	return kind == KindFeature || kind == KindArchitecture
}

type Card struct {
	ID        string
	ProjectID string
	Slug      string
	Title     string
	Intent    string
	Stage     string
	Status    string
	Owner     string
	// Kind is feature or architecture (a structural Structure change).
	Kind      string
	Under     string
	Decisions []string
	// MilestoneID is the milestone the card ships in; empty is the Backlog.
	// Milestone is that milestone's slug, as a milestone: line writes it.
	MilestoneID string
	Milestone   string
	Position    int
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Tasks       []Task
	Questions   []Question
	Invariants  []Invariant
	// Handoffs is ordered oldest first. The last row for a branch is current.
	Handoffs []Handoff
}

// LatestHandoff returns the newest handoff recorded for branch.
func (c Card) LatestHandoff(branch string) (Handoff, bool) {
	var found Handoff
	ok := false
	for _, handoff := range c.Handoffs {
		if handoff.Branch == branch {
			found, ok = handoff, true
		}
	}
	return found, ok
}

// LatestHandoffAny returns the newest handoff on the card, any branch.
func (c Card) LatestHandoffAny() (Handoff, bool) {
	if len(c.Handoffs) == 0 {
		return Handoff{}, false
	}
	return c.Handoffs[len(c.Handoffs)-1], true
}

type Task struct {
	ID     string
	CardID string
	Number int
	Title  string
	State  string
	// Repo is a project_repos name; empty is the project root checkout.
	Repo     string
	Scope    string
	Position int
	// Claim is the task's active claim, or nil when the task is free.
	Claim *Claim
}

// CommitLink joins one commit of a checkout (Repo empty is the project root)
// to one task. Stored links are the ones a person made from the Inbox.
type CommitLink struct {
	ID        string
	ProjectID string
	Repo      string
	SHA       string
	TaskID    string
	CreatedAt time.Time
}

type Question struct {
	ID       string
	CardID   string
	Text     string
	Blocking bool
	Options  []string
	State    string
	Answer   string
	Position int
}

type Invariant struct {
	ID       string
	CardID   string
	Text     string
	State    string
	Position int
}

// Handoff is one session record for a card on a Git branch. Rows are
// append-only; the latest row for a card and branch is the current one.
type Handoff struct {
	ID         string
	ProjectID  string
	CardID     string
	Branch     string
	Goal       string
	Done       string
	InProgress string
	Next       string
	Touched    []string
	Agent      string
	CreatedAt  time.Time
}

// Snapshot is the current Work graph of one project, plus its Structure nodes.
type Snapshot struct {
	ProjectID string
	Cards     []Card
	Nodes     []structure.Node
	// Repos names the project's extra checkouts (project_repos). The
	// project root is the unnamed default and is not listed.
	Repos []string
	// Environments are the project's environments. A deploys: line names one
	// by id or by name.
	Environments []NamedEnvironment
	// Decisions are the project's Decisions with their lifecycle state.
	Decisions []decision.Decision
	Facts     []Fact
	// Rules are the project's active Rules, in position order.
	Rules []Rule
	// Milestones lists every milestone, archived ones included, so a card's
	// stored milestone still resolves.
	Milestones []Milestone
}

// Fact is a canon fact with its Polter identity and context paths.
type Fact struct {
	canon.Fact
	Slug string
	// Scopes are the paths of the Structure nodes the fact is about, sorted; none
	// is the whole project.
	Scopes []string
}

// Rule is a short imperative constraint agents read before they work. Scopes
// are the paths of the Structure nodes it applies to, sorted; none is the
// whole project, and a node's Rules hold for every node below it.
type Rule struct {
	ID        string
	Slug      string
	Statement string
	Scopes    []string
	Status    string
	Position  int
}

// Rule states.
const (
	RuleActive  = "active"
	RuleRemoved = "removed"
)

// Handle is the Polter reference of a Rule: its slug, or its id when it has none.
func (r Rule) Handle() string {
	if r.Slug != "" {
		return r.Slug
	}
	return r.ID
}

// NamedEnvironment is a project environment a deploys: line can name.
type NamedEnvironment struct {
	ID   string
	Name string
}

// HasRepo reports whether name is a registered checkout. Empty is the root.
func (s Snapshot) HasRepo(name string) bool {
	if name == "" {
		return true
	}
	for _, repo := range s.Repos {
		if repo == name {
			return true
		}
	}
	return false
}

// NodeByPath returns the node with path, including removed nodes.
func (s Snapshot) NodeByPath(path string) (structure.Node, bool) {
	for _, node := range s.Nodes {
		if node.Path == path {
			return node, true
		}
	}
	return structure.Node{}, false
}

// Card returns the card with slug, if present.
func (s Snapshot) Card(slug string) (Card, bool) {
	for _, card := range s.Cards {
		if card.Slug == slug {
			return card, true
		}
	}
	return Card{}, false
}

const (
	EntityCard      = "card"
	EntityTask      = "task"
	EntityQuestion  = "question"
	EntityInvariant = "invariant"
	EntityHandoff   = "handoff"
	EntityClaim     = "claim"
	EntityNode      = "node"
	EntityDecision  = "decision"
	EntityFact      = "fact"
	EntityRule      = "rule"
	EntityMilestone = "milestone"

	OpCreate = "create"
	OpUpdate = "update"
	OpRemove = "remove"
)

// Op is one planned mutation. Fields holds only the columns that change
// (column name → new value); for creates it holds every column.
type Op struct {
	Entity   string
	Kind     string
	EntityID string
	CardID   string
	CardSlug string
	// NodeID is the structure node an invariant belongs to. CardID stays empty.
	NodeID string
	// Label is the human handle used in plan output: the task number ("T2"),
	// or the question/invariant text.
	Label  string
	Fields map[string]any
	// Before holds previous values of changed fields, for plan output only.
	Before map[string]any
}
