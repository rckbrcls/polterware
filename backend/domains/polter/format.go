package polter

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/polterware/polterware/backend/domains/decision"
)

// SpecCore is the part of the Polter format every agent needs: Work cards,
// tasks, questions, invariants, handoffs, claims, the binding Rules, and
// where to read first.
// `polterware format`, the plugin skill, and polter.format print it; the
// rest is in SpecTopics, read on demand.
const SpecCore = "Polter format v1: markdown that writes Work cards. One apply is one audited change.\n" +
	"\n" +
	"---\n" +
	"polter: 1\n" +
	"summary: One line saying what changes\n" +
	"rationale: Why it changes\n" +
	"---\n" +
	"\n" +
	"## git-import: Git metadata import\n" +
	"stage: build · under: core/import · milestone: beta · decisions: Decision-0007\n" +
	"\n" +
	"Intent: what we want and why.\n" +
	"\n" +
	"- [ ] T1 Read commits per checkout `backend/import/*`\n" +
	"- [x] T2 Stamp revision on facts\n" +
	"? Include merge commits? [blocking] (yes | no)\n" +
	"! No network calls during import\n" +
	"\n" +
	"handoff:\n" +
	"branch: feat/git-import\n" +
	"next: wire into import\n" +
	"\n" +
	"Rules:\n" +
	"- `## slug: Title` is a card; the lowercase-kebab slug is its identity. Stages: shape, plan, build, verify, delivered. under: is a Structure component path; milestone: is a milestone slug (empty is the Backlog).\n" +
	"- Tasks: [ ] open, [x] done, [-] dropped; T<n> and a trailing `scope` glob are optional. `?` is a question (`? Question -> answer` answers it), `!` an invariant.\n" +
	"- handoff: needs branch:; it also takes goal, done, in_progress, next, touched, agent.\n" +
	"- Claim a task before editing it: `claim: T2`; `done: T2` finishes it, `release: T2` lets go.\n" +
	"- A text changes only what it mentions. Remove with status: removed, [-], or a trailing [removed].\n" +
	"- Read `polterware brief <slug|path|file>` before you edit; its Rules: bind you; raise a Conflict when a request breaks one. Find with `polterware search <terms>`. Start with `polterware status`; end with a handoff.\n" +
	"- More: `polterware format structure|rules|decisions|facts|feature|conflicts`. Check with `polterware lint <file>`; write with `polterware apply <file|-> [--dry-run]`.\n"

// SpecCoreTokens is the size polter.format declares for SpecCore; a test
// keeps it within 10% of the measured text.
const SpecCoreTokens = 360

// SpecTopics are the rest of the format, one block per topic.
var SpecTopics = map[string]string{
	"structure": "Polter Structure nodes.\n" +
		"\n" +
		"# core/import: Import\n" +
		"level: component · under: core · kind: service · tech: Go · repo: api · path: src/import\n" +
		"\n" +
		"Intent paragraph.\n" +
		"\n" +
		"! No network calls during import\n" +
		"\n" +
		"- `# path: Title` is a Structure node. level: domain or component. A domain sits under the project (no under:); a component sits under a domain (under: names its path) or loose under the project. A different under: on an existing component moves it and rewrites its path.\n" +
		"- kind: says what a component is (frontend, service, api, worker, database, cache, queue, storage, auth, llm, and the other canvas component kinds; only components have one, empty clears); tech: names its technology in free text (Go, Postgres; empty clears).\n" +
		"- How nodes relate is drawn on a canvas, not declared here. deploys: lists env=provider:resource links (comma separated; a present line replaces them, empty clears).\n" +
		"- dir: <folder> links a local clone: it creates the repository (or reuses the one cloned there, or with the same GitHub remote) and becomes repo: <name>. repo: names a repository (`polterware repo list`); with one repository, none is needed. path: is a folder inside it, not the node path. A brief of a file finds the node with the longest repo + path prefix. A repository no node uses is removed.\n" +
		"- migrating: old design -> new design marks a node in transition (empty clears it). A card with `kind: architecture` is an Architecture Change: its under: names the node it changes; clear migrating: when the card is delivered.\n" +
		"- A `!` line under a node is a Rule for that node and every node below it (see `polterware format rules`); `[removed]` retires it.\n" +
		"- A card under: names a component path once any component exists.\n",
	"rules": "Polter Rules: the law agents follow.\n" +
		"\n" +
		"#### rule local-only: Never call the network from the core.\n" +
		"scope: core, core/import\n" +
		"\n" +
		"- `#### rule slug: Statement` creates a Rule or updates it by its lowercase-kebab slug (or id). A Rule is one short imperative constraint.\n" +
		"- `scope:` lists the Structure node paths it holds for, comma separated; a node's Rules also hold for every node below it. None (or empty) is the whole project. `status: removed` retires it.\n" +
		"- `polterware brief` opens with every Rule that holds for its target, never cut by the budget, and the generated AGENTS.md block lists them. Follow them; change one only with a rationale saying why.\n",
	"conflicts": "Polter Conflicts: when a request goes against a Rule or a Decision.\n" +
		"\n" +
		"#### conflict cache-in-core: Add a Redis cache to the core\n" +
		"rule: local-only\n" +
		"card: git-import\n" +
		"options: Keep it local | Allow Redis for this card\n" +
		"\n" +
		"- Do not act against a Rule or Decision: raise a Conflict with `#### conflict slug: <the request>` and `rule:` (slug or id) and/or `decision:` (Decision-0003). card: and options: (a | b) are optional. One key per line.\n" +
		"- A person decides it in the Inbox. Go on with work it does not block; `polterware conflict wait <slug>` blocks until the answer, and `polterware query \"conflict <slug>\"`, status, and the card's brief show it.\n" +
		"- `status: withdrawn` drops one you no longer need. `polterware conflict raise|decide|list` are shortcuts.\n",
	"decisions": "Polter Decisions.\n" +
		"\n" +
		"### new: Local SQLite authority\n" +
		"status: active · trigger: multi-user sync · supersedes: Decision-0003 · reason: why\n" +
		"\n" +
		"Decision body: context, decision, consequences.\n" +
		"\n" +
		"- `### ref: Title` is a Decision lifecycle block. `new` proposes one (a number is assigned); a ref such as `Decision-0003` or an id changes an existing one.\n" +
		"- States: proposed → active → challenged → active or superseded. `status: challenged` needs a reason:. `supersedes: Decision-0003` on the newer decision marks the older one superseded. Decisions are never removed.\n" +
		"- `scope:` lists the Structure node paths it applies to, comma separated (empty clears). A decision with none is a principle: it applies to the whole project and every brief names it. `level: principle` clears scope:. `trigger:` is the review condition.\n" +
		"- The body is plain text: no # lines. A card cites decisions with `decisions: Decision-0007`.\n",
	"facts": "Polter Facts.\n" +
		"\n" +
		"#### local-authority: One local core owns SQLite.\n" +
		"kind: declared · scope: core\n" +
		"\n" +
		"- `#### slug: Statement` creates a canon Fact or updates it by its lowercase-kebab slug; an existing Fact id can replace the slug. Omit the heading statement on updates to keep it.\n" +
		"- A Fact states what is true; a Rule (`polterware format rules`) states what must stay true.\n" +
		"- `kind:` is declared (default on create), inferred, or verified. `scope:` lists the Structure node paths it is about, comma separated (empty clears; none is the whole project). Omitted fields stay unchanged. Plan output uses the Fact id. Facts have no body text.\n",
	"feature": "Polter feature flow, tasks, and claims.\n" +
		"\n" +
		"- New feature: `polterware feature new \"<intent>\"`, then `feature shape|contract|plan <slug>` (`--accept` / `--approve` pass the gate); check with `polterware verify <slug>`.\n" +
		"- A card also takes owner: and decisions: (comma-separated refs). Tasks take `[repo: api]`; a scope may carry its checkout: `api:src/auth/*`.\n" +
		"- Claims: `claim: T2` in a card or `polterware task claim slug#T2`. The holder is the session agent; a task or overlapping scope held by another agent is refused. Scopes in different checkouts never overlap.\n" +
		"- handoff: records one session on branch: with goal, done, in_progress, next, touched (comma separated), and agent. End a session with `polterware handoff --card <slug> --note \"...\"`.\n" +
		"- Milestones are created in the Desktop; `polterware query milestones` lists them and `query roadmap` the active ones with their goal and cards.\n",
}

// SpecTopicNames lists the topics in the order the help prints them.
var SpecTopicNames = []string{"structure", "rules", "decisions", "facts", "feature", "conflicts"}

// FormatSpec returns SpecCore for an empty topic, or one topic's block.
func FormatSpec(topic string) (string, error) {
	topic = strings.TrimSpace(topic)
	if topic == "" {
		return SpecCore, nil
	}
	if text, ok := SpecTopics[topic]; ok {
		return text, nil
	}
	return "", fmt.Errorf("unknown format topic %q: use %s", topic, strings.Join(SpecTopicNames, ", "))
}

// Query is a parsed read request.
type Query struct {
	Kind string
	// Slug is the card, node, or decision the query names; for brief and
	// search it is the target or the terms.
	Slug   string
	Budget int
	// Step is the feature flow step for "feature" queries.
	Step string
	// At is the point in time for "structure ... at <point>" queries.
	At string
	// History asks for the list of change batches ("structure history").
	History bool
}

const (
	QueryCards     = "cards"
	QueryCard      = "card"
	QueryStatus    = "status"
	QueryInbox     = "inbox"
	QueryHandoff   = "handoff"
	QueryBrief     = "brief"
	QuerySearch    = "search"
	QueryShow      = "show"
	QueryCommits   = "commits"
	QueryConflicts = "conflicts"
	QueryConflict  = "conflict"
	QueryStructure = "structure"
	QueryFeature   = "feature"
	QueryVerify    = "verify"

	QueryDecisions  = "decisions"
	QueryDecision   = "decision"
	QueryCanvas     = "canvas"
	QueryMilestones = "milestones"
	QueryRoadmap    = "roadmap"
)

const queryUsage = `use "cards", "card <slug>", "status", "inbox", "handoff <slug>", "brief <slug|path|file>", "search <terms>", "show <id>", "commits <slug>", "conflicts", "conflict <slug>", "structure [<path>] [at <point>]", "structure history", "decisions [proposed|active|challenged|superseded]", "decision <decision>", "feature <slug> [shape|contract|plan]", "verify <slug|slug#T2>", "canvas", "canvas <name|id>", "milestones", or "roadmap"`

// ParseQuery parses the v1 query language.
func ParseQuery(text string) (Query, error) {
	fields := strings.Fields(text)
	if len(fields) == 0 {
		return Query{}, fmt.Errorf("unknown query %q: %s", strings.TrimSpace(text), queryUsage)
	}
	switch fields[0] {
	case QueryBrief, QuerySearch:
		return parseBudgetQuery(fields[0], fields[1:])
	case QueryShow:
		if len(fields) < 2 {
			return Query{}, fmt.Errorf(`show needs an id: use "show <card slug|Decision ref|fact|rule|doc|entity|run id>"`)
		}
		return Query{Kind: QueryShow, Slug: strings.Join(fields[1:], " ")}, nil
	case QueryFeature:
		switch {
		case len(fields) == 2:
			return Query{Kind: QueryFeature, Slug: fields[1], Step: FeatureStepShape}, nil
		case len(fields) == 3 && ValidFeatureStep(fields[2]):
			return Query{Kind: QueryFeature, Slug: fields[1], Step: fields[2]}, nil
		default:
			return Query{}, fmt.Errorf(`unknown query %q: use "feature <slug> [shape|contract|plan]"`, strings.TrimSpace(text))
		}
	case QueryDecisions:
		switch {
		case len(fields) == 1:
			return Query{Kind: QueryDecisions}, nil
		case len(fields) == 2 && decision.ValidState(fields[1]):
			return Query{Kind: QueryDecisions, Slug: fields[1]}, nil
		default:
			return Query{}, fmt.Errorf(`unknown query %q: use "decisions [proposed|active|challenged|superseded]"`, strings.TrimSpace(text))
		}
	case QueryDecision:
		if len(fields) < 2 {
			return Query{}, fmt.Errorf(`unknown query %q: use "decision <decision>"`, strings.TrimSpace(text))
		}
		return Query{Kind: QueryDecision, Slug: strings.Join(fields[1:], " ")}, nil
	case QueryVerify:
		if len(fields) != 2 {
			return Query{}, fmt.Errorf(`unknown query %q: use "verify <slug>" or "verify <slug>#T2"`, strings.TrimSpace(text))
		}
		return Query{Kind: QueryVerify, Slug: fields[1]}, nil
	case QueryCanvas:
		if len(fields) == 1 {
			return Query{Kind: QueryCanvas}, nil
		}
		return Query{Kind: QueryCanvas, Slug: strings.Join(fields[1:], " ")}, nil
	case QueryStructure:
		args := fields[1:]
		query := Query{Kind: QueryStructure}
		if n := len(args); n >= 2 && args[n-2] == "at" {
			query.At = args[n-1]
			args = args[:n-2]
		}
		switch {
		case len(args) == 0:
			return query, nil
		case len(args) == 1 && args[0] == "history" && query.At == "":
			query.History = true
			return query, nil
		case len(args) == 1:
			query.Slug = args[0]
			return query, nil
		default:
			return Query{}, fmt.Errorf(`unknown query %q: use "structure [<path>] [at <point>]" or "structure history"`, strings.TrimSpace(text))
		}
	}
	switch {
	case len(fields) == 1 && fields[0] == QueryCards:
		return Query{Kind: QueryCards}, nil
	case len(fields) == 1 && fields[0] == QueryStatus:
		return Query{Kind: QueryStatus}, nil
	case len(fields) == 1 && fields[0] == QueryInbox:
		return Query{Kind: QueryInbox}, nil
	case len(fields) == 1 && fields[0] == QueryMilestones:
		return Query{Kind: QueryMilestones}, nil
	case len(fields) == 1 && fields[0] == QueryRoadmap:
		return Query{Kind: QueryRoadmap}, nil
	case len(fields) == 2 && fields[0] == QueryCommits:
		return Query{Kind: QueryCommits, Slug: fields[1]}, nil
	case len(fields) == 1 && fields[0] == QueryConflicts:
		return Query{Kind: QueryConflicts}, nil
	case len(fields) == 2 && fields[0] == QueryConflict:
		return Query{Kind: QueryConflict, Slug: fields[1]}, nil
	case len(fields) == 2 && fields[0] == QueryCard:
		return Query{Kind: QueryCard, Slug: fields[1]}, nil
	case len(fields) == 2 && fields[0] == QueryHandoff:
		return Query{Kind: QueryHandoff, Slug: fields[1]}, nil
	default:
		return Query{}, fmt.Errorf("unknown query %q: %s", strings.TrimSpace(text), queryUsage)
	}
}

// parseBudgetQuery reads "<kind> <words...> [budget:N]": the words are the
// target or the search terms.
func parseBudgetQuery(kind string, fields []string) (Query, error) {
	budget := 0
	var words []string
	for _, field := range fields {
		if !strings.HasPrefix(field, "budget:") {
			words = append(words, field)
			continue
		}
		n, err := strconv.Atoi(strings.TrimPrefix(field, "budget:"))
		if err != nil || n < 1 {
			return Query{}, fmt.Errorf("invalid budget %q: use a positive number", field)
		}
		budget = n
	}
	if len(words) == 0 {
		if kind == QuerySearch {
			return Query{}, fmt.Errorf(`search needs terms: use "search <terms> [budget:N]"`)
		}
		return Query{}, fmt.Errorf(`brief needs a target: use "brief <card slug|Structure path|file path> [budget:N]"`)
	}
	return Query{Kind: kind, Slug: strings.Join(words, " "), Budget: budget}, nil
}
