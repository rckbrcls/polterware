package polter

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/polterware/polterware/backend/domains/decision"
)

// Spec is the whole Polter format, small enough to teach an agent in one read.
// `polterware format`, the plugin skill, and polter.format all print this text.
const Spec = "Polter format v1: markdown that writes Work cards, Structure nodes, Decisions, and canon Facts.\n" +
	"\n" +
	"---\n" +
	"polter: 1\n" +
	"summary: One line saying what changes\n" +
	"rationale: Why it changes\n" +
	"---\n" +
	"\n" +
	"## git-import: Git metadata import\n" +
	"stage: plan · owner: erick · under: core/import · decisions: Decision-0007\n" +
	"\n" +
	"Intent paragraph: what we want and why.\n" +
	"\n" +
	"- [ ] T1 Upsert commit evidence `backend/import/*`\n" +
	"- [x] T2 Stamp revision on facts\n" +
	"? Include merge commits? [blocking] (yes | no)\n" +
	"! No network calls during scan\n" +
	"\n" +
	"handoff:\n" +
	"branch: feat/git-import\n" +
	"agent: codex\n" +
	"goal: import HEAD, branch and recent commits as evidence\n" +
	"done: commit evidence upsert in core\n" +
	"in_progress: stamping revision on observed facts\n" +
	"next: wire into ImportProjectSources\n" +
	"touched: backend/import.go, docs/spec.md\n" +
	"\n" +
	"### new: Local SQLite authority\n" +
	"status: active · trigger: multi-user sync · supersedes: Decision-0003 · reason: why\n" +
	"\n" +
	"Decision body: context, decision, consequences.\n" +
	"\n" +
	"#### local-authority: One local core owns SQLite.\n" +
	"kind: declared · scope: core · evidence: ev-existing-id\n" +
	"\n" +
	"Rules:\n" +
	"- `## slug: Title` is a card; the lowercase-kebab slug is its identity.\n" +
	"- `# path: Title` is a Structure node. level: system, domain, or component. under: names the parent path. A component may also sit directly under its system (outside any domain). A different under: on an existing node moves it and rewrites descendant paths. uses: lists the node paths it depends on (comma separated; empty clears); the map draws them as edges. deploys: lists env=provider:resource links (comma separated; a present line replaces them, empty clears). A card under: names a component path once any component exists. repo: names a checkout from `polterware repo add` (empty is the project root); path: is a folder inside it, not the node path. migrating: old design -> new design marks a node in transition (empty clears it).\n" +
	"- `### ref: Title` is a Decision lifecycle block. `new` proposes one (a number is assigned); a ref such as `Decision-0003` or an id changes an existing one. States: proposed → active → challenged → active or superseded. `status: challenged` needs a reason:; `level: principle` pins it for the whole project; `trigger:` is the review condition; `scope:` is the Structure node path the decision applies to (omit for the whole project); `supersedes: Decision-0003` on the newer decision marks the older one superseded. Decisions are never removed. The body is plain text: no # lines.\n" +
	"- `#### slug: Statement` creates a canon Fact or updates it by its lowercase-kebab slug; an existing Fact id can replace the slug. Omit the heading statement on updates to keep it. `kind:` is declared (default on create), observed, inferred, or verified. `scope:` names a Structure node path (empty clears; omit for the whole project on create). `evidence:` lists existing canon evidence ids, comma separated (a present line replaces links, empty clears). Omitted fields stay unchanged. Plan output uses the Fact id. Facts have no body text.\n" +
	"- Stages: shape, plan, build, verify, delivered.\n" +
	"- `kind: architecture` marks a card as an Architecture Change (default feature). Its under: names the node it changes; set `migrating:` on that node while the change is in flight, and clear it when the card is delivered.\n" +
	"- Tasks: [ ] open, [x] done, [-] dropped; T<n>, `[repo: api]`, and a trailing `scope` glob are optional. A scope may carry its checkout: `api:src/auth/*`.\n" +
	"- `?` is an open question, `!` a contract invariant. `? Question -> answer` records the decision and closes its Inbox item.\n" +
	"- `handoff:` records one session on `branch:` (required): goal, done, in_progress, next, touched, agent.\n" +
	"- Claim before editing: `claim: T2` in the card or `polterware task claim slug#T2`; `done: T2` finishes, `release: T2` lets go. The holder is the session agent; a task or overlapping scope held by another agent is refused. Scopes in different checkouts never overlap.\n" +
	"- A text only changes what it mentions. Remove with status: removed, [-], or a trailing [removed].\n" +
	"- New feature: `polterware feature new \"<intent>\"`, then `feature shape|contract|plan <slug>` (`--accept` / `--approve` pass the gate); check with `polterware verify <slug>`.\n" +
	"- Start with `polterware status`. End with `polterware handoff --card <slug> --note \"...\"`.\n" +
	"- Check with `polterware lint file.pw.md`; write with `polterware apply file.pw.md [--dry-run]`.\n"

// Query is a parsed read request.
type Query struct {
	Kind   string
	Slug   string
	Zoom   string
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
	QueryOracle    = "oracle"
	QueryStructure = "structure"
	QueryFeature   = "feature"
	QueryVerify    = "verify"

	QueryDecisions = "decisions"
	QueryDecision  = "decision"
	QueryCanvas    = "canvas"
)

const queryUsage = `use "cards", "card <slug>", "status", "inbox", "handoff <slug>", "oracle <path>", "structure [<path>] [at <point>]", "structure history", "decisions [proposed|active|challenged|superseded]", "decision <decision>", "feature <slug> [shape|contract|plan]", "verify <slug|slug#T2>", "canvas", or "canvas <name|id>"`

// ParseQuery parses the v1 query language.
func ParseQuery(text string) (Query, error) {
	fields := strings.Fields(text)
	if len(fields) == 0 {
		return Query{}, fmt.Errorf("unknown query %q: %s", strings.TrimSpace(text), queryUsage)
	}
	switch fields[0] {
	case QueryOracle:
		return parseOracleQuery(fields[1:])
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
	case len(fields) == 2 && fields[0] == QueryCard:
		return Query{Kind: QueryCard, Slug: fields[1]}, nil
	case len(fields) == 2 && fields[0] == QueryHandoff:
		return Query{Kind: QueryHandoff, Slug: fields[1]}, nil
	default:
		return Query{}, fmt.Errorf("unknown query %q: %s", strings.TrimSpace(text), queryUsage)
	}
}

func parseOracleQuery(fields []string) (Query, error) {
	zoom := "task"
	budget := 0
	var target []string
	for _, field := range fields {
		switch {
		case strings.HasPrefix(field, "zoom:"):
			zoom = strings.TrimPrefix(field, "zoom:")
		case strings.HasPrefix(field, "budget:"):
			n, err := strconv.Atoi(strings.TrimPrefix(field, "budget:"))
			if err != nil || n < 1 {
				return Query{}, fmt.Errorf("invalid budget %q: use a positive number", field)
			}
			budget = n
		default:
			target = append(target, field)
		}
	}
	if len(target) == 0 {
		return Query{}, fmt.Errorf(`oracle needs a path: use "oracle <path> zoom:task budget:800"`)
	}
	switch zoom {
	case "task", "component", "domain", "system":
	default:
		return Query{}, fmt.Errorf("unknown zoom %q: use task|component|domain|system", zoom)
	}
	return Query{Kind: QueryOracle, Slug: strings.Join(target, " "), Zoom: zoom, Budget: budget}, nil
}
