package wedge

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/polterware/polterware/backend/domains/agentrun"
	"github.com/polterware/polterware/backend/domains/atlas"
	"github.com/polterware/polterware/backend/domains/decision"
	"github.com/polterware/polterware/backend/domains/inbox"
	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/projects"
	"github.com/polterware/polterware/backend/domains/work"
	"github.com/polterware/polterware/backend/platform/ids"
	gitpkg "github.com/polterware/polterware/backend/providers/git"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// ErrPolterInvalid means the text has error diagnostics; nothing was written.
var ErrPolterInvalid = errors.New("polter text has errors")

// ErrNoProject means no project id was given and none contains the directory.
var ErrNoProject = errors.New("no project for this directory: pass --project <id> or run polterware init")

// ResolveProject returns the project with id, or, when id is empty, the
// project whose root contains dir (the deepest root wins).
func ResolveProject(store *storepkg.Store, id, dir string) (projects.Project, error) {
	if id = strings.TrimSpace(id); id != "" {
		project, err := store.GetProject(id)
		if err != nil {
			return projects.Project{}, fmt.Errorf("unknown project %q", id)
		}
		return project, nil
	}
	dir, err := filepath.Abs(dir)
	if err != nil {
		return projects.Project{}, err
	}
	items, err := store.ListProjects(false)
	if err != nil {
		return projects.Project{}, err
	}
	var best projects.Project
	bestLen := -1
	for _, item := range items {
		if item.RootPath == "" {
			continue
		}
		root := filepath.Clean(ExpandRootPath(item.RootPath))
		rel, err := filepath.Rel(root, dir)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		if len(root) > bestLen {
			best, bestLen = item, len(root)
		}
	}
	if bestLen < 0 {
		return projects.Project{}, ErrNoProject
	}
	return best, nil
}

// PolterReferences loads what reference-level lint and hints check against.
func PolterReferences(store *storepkg.Store, projectID string) (*polter.References, error) {
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return nil, err
	}
	return polterReferences(store, snapshot)
}

func polterReferences(store *storepkg.Store, snapshot work.Snapshot) (*polter.References, error) {
	verdicts, err := store.ListKnowledge(snapshot.ProjectID, "verdict")
	if err != nil {
		return nil, err
	}
	refs := &polter.References{Cards: snapshot.Cards, Nodes: snapshot.Nodes, Repos: snapshot.Repos, Environments: snapshot.Environments}
	for _, verdict := range verdicts {
		refs.Verdicts = append(refs.Verdicts, polter.VerdictRef{ID: verdict.ID, Title: verdict.Title, Status: verdict.Status})
	}
	view := ProjectGit(store, snapshot.ProjectID)
	refs.Git = &view
	return refs, nil
}

// ProjectGit reads the project's repository from its root. A missing
// repository returns an empty view; callers still answer.
func ProjectGit(store *storepkg.Store, projectID string) polter.GitView {
	project, err := store.GetProject(projectID)
	if err != nil {
		return polter.GitView{}
	}
	obs := gitpkg.Observe(context.Background(), ExpandRootPath(project.RootPath))
	return polter.GitView{Available: obs.Available, Branch: obs.Branch, Files: obs.Files, Delivered: obs.Delivered}
}

// ApplyInput is one `polterware apply` / polter.apply call.
type ApplyInput struct {
	ProjectID string
	Text      string
	DryRun    bool
	// Summary and Rationale override the text's frontmatter.
	Summary    string
	Rationale  string
	AgentRunID string
	// AutoStartLabel opens a run for this write when AgentRunID is empty.
	AutoStartLabel string
	// ActorKind and Tool default to an agent write through "polter.apply";
	// the Desktop passes a human actor and its own tool name.
	ActorKind string
	Tool      string
	// Agent is the session agent label that claim, done, and release lines
	// act for. Empty rejects those lines.
	Agent string
}

type ApplyResult struct {
	ProjectID   string
	Ops         []work.Op
	Diagnostics []polter.Diagnostic
	Applied     bool
	AgentRunID  string
	BatchID     string
	// Summary and Rationale are the resolved change envelope (flags over
	// frontmatter), filled even on a dry run.
	Summary   string
	Rationale string
}

// ApplyPolter decodes, lints, plans, and (unless DryRun) applies Polter text as
// one audited write. On ErrPolterInvalid the result carries the diagnostics.
func ApplyPolter(store *storepkg.Store, in ApplyInput) (ApplyResult, error) {
	result := ApplyResult{ProjectID: in.ProjectID}
	snapshot, err := store.LoadWorkSnapshot(in.ProjectID)
	if err != nil {
		return result, err
	}
	refs, err := polterReferences(store, snapshot)
	if err != nil {
		return result, err
	}
	doc, diags := polter.Lint(in.Text, refs)
	ops, planDiags := polter.PlanAs(doc, snapshot, in.Agent)
	result.Diagnostics = mergeDiagnostics(diags, planDiags)
	if polter.HasErrors(result.Diagnostics) {
		return result, ErrPolterInvalid
	}
	result.Ops = ops
	result.Summary = firstNonEmpty(in.Summary, doc.Summary)
	result.Rationale = firstNonEmpty(in.Rationale, doc.Rationale)
	if in.DryRun || len(ops) == 0 {
		return result, nil
	}

	summary, rationale := result.Summary, result.Rationale
	if err := agentrun.ValidateChange(summary, rationale); err != nil {
		return result, fmt.Errorf("%w: add them to the frontmatter or pass --summary and --rationale", agentrun.ErrChangeIncomplete)
	}
	actorKind := firstNonEmpty(in.ActorKind, agentrun.ActorKindAgent)
	tool := firstNonEmpty(in.Tool, "polter.apply")
	result.BatchID = ids.NewULID()
	written, err := ExecuteAuditedWrite(
		store,
		ChangeEnvelope{
			Summary:        summary,
			Rationale:      rationale,
			AgentRunID:     in.AgentRunID,
			ProjectID:      in.ProjectID,
			AutoStartLabel: in.AutoStartLabel,
			BatchID:        result.BatchID,
		},
		actorKind,
		tool,
		func(run agentrun.Run) ([]string, any, error) {
			cardIDs, err := store.ApplyWorkOps(in.ProjectID, run.ID, result.BatchID, ops)
			return cardIDs, nil, err
		},
	)
	if err != nil {
		return result, err
	}
	result.Applied = true
	result.AgentRunID = written.AgentRunID
	return result, nil
}

// QueryPolter answers a v1 query ("cards", "card <slug>", "status", "inbox",
// "handoff <slug>", "oracle", "atlas", "decisions [state]", "decision <verdict>",
// "feature <slug>", "verify <target>") in text.
func QueryPolter(store *storepkg.Store, projectID, text string) (string, error) {
	return QueryPolterScoped(store, projectID, text, atlas.MultiScope{})
}

// QueryPolterScoped answers a query over the cards, Decisions and Inbox items
// inside scope. An inactive scope is the whole project. Several nodes are a union.
func QueryPolterScoped(store *storepkg.Store, projectID, text string, scope atlas.MultiScope) (string, error) {
	query, err := polter.ParseQuery(text)
	if err != nil {
		return "", err
	}
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return "", err
	}
	snapshot, err = scopeSnapshot(store, snapshot, scope)
	if err != nil {
		return "", err
	}
	switch query.Kind {
	case polter.QueryCard:
		card, ok := snapshot.Card(query.Slug)
		if !ok {
			return "", fmt.Errorf("unknown card %q: list cards with polterware query cards", query.Slug)
		}
		return polter.EncodeCard(card), nil
	case polter.QueryHandoff:
		return queryHandoff(store, snapshot, query.Slug)
	case polter.QueryStatus:
		return queryStatus(store, snapshot, scope), nil
	case polter.QueryInbox:
		result, err := inboxScoped(store, snapshot, scope)
		if err != nil {
			return "", err
		}
		return inbox.List(result), nil
	case polter.QueryOracle:
		return polter.Oracle(snapshot.Nodes, snapshot.Cards, query.Slug, query.Zoom, query.Budget)
	case polter.QueryDecisions:
		return polter.EncodeDecisions(snapshot.Decisions, query.Slug), nil
	case polter.QueryDecision:
		target, ok := decision.Find(snapshot.Decisions, query.Slug)
		if !ok {
			return "", fmt.Errorf("unknown decision %q: list decisions with polterware decision list", query.Slug)
		}
		return polter.EncodeDecision(target, snapshot.Decisions, polter.NodesCiting(snapshot.Nodes, target)), nil
	case polter.QueryFeature, polter.QueryVerify:
		return queryFeature(store, snapshot, query)
	case polter.QueryAtlas:
		project, err := store.GetProject(projectID)
		if err != nil {
			return "", err
		}
		if query.History {
			entries, err := AtlasHistory(store, projectID)
			if err != nil {
				return "", err
			}
			return encodeAtlasHistory(entries), nil
		}
		if query.At != "" {
			rows, err := AtlasAt(context.Background(), store, projectID, query.At)
			if err != nil {
				return "", err
			}
			return "Atlas at " + query.At + " (structure only: status, features, and drift are live)\n" +
				polter.EncodeAtlas(project.Name, rows, nil, query.Slug), nil
		}
		return polter.EncodeAtlas(project.Name, atlasRows(store, snapshot), snapshot.Cards, query.Slug), nil
	default:
		return polter.EncodeList(snapshot), nil
	}
}

func queryHandoff(store *storepkg.Store, snapshot work.Snapshot, slug string) (string, error) {
	card, ok := snapshot.Card(slug)
	if !ok {
		return "", fmt.Errorf("unknown card %q: list cards with polterware query cards", slug)
	}
	view := ProjectGit(store, snapshot.ProjectID)
	handoff, ok := card.LatestHandoff(view.Branch)
	if !ok || view.Branch == "" || view.Branch == "HEAD" {
		handoff, ok = card.LatestHandoffAny()
	}
	if !ok {
		return "", fmt.Errorf("no handoff for %q: write one with polterware handoff --card %s", slug, slug)
	}
	return polter.EncodeHandoff(card, handoff), nil
}

func queryStatus(store *storepkg.Store, snapshot work.Snapshot, scope atlas.MultiScope) string {
	// The Inbox is a best-effort addition: a drift read that fails leaves
	// status without its inbox lines rather than failing the session start.
	inboxLines := ""
	if result, err := inboxScoped(store, snapshot, scope); err == nil {
		inboxLines = inbox.StatusLines(result)
	}
	view := ProjectGit(store, snapshot.ProjectID)
	card, slugs, err := SelectWorkCard(snapshot, "", view.Branch)
	if err != nil {
		return polter.EncodeStatusUnresolved(view.Branch, slugs) + polter.EncodeStatusClaims("", snapshot) + inboxLines
	}
	var current *work.Handoff
	if handoff, ok := card.LatestHandoff(view.Branch); ok && view.Branch != "" && view.Branch != "HEAD" {
		current = &handoff
	}
	stage := polter.DisplayStage(card.Stage, view.Delivered)
	return polter.EncodeStatus(card, view.Branch, stage, current) + polter.EncodeStatusClaims(card.Slug, snapshot) + inboxLines
}

// mergeDiagnostics keeps lint output, then plan diagnostics that lint did not
// already report (CheckGraph runs in both).
func mergeDiagnostics(lint, plan []polter.Diagnostic) []polter.Diagnostic {
	seen := map[string]bool{}
	out := make([]polter.Diagnostic, 0, len(lint)+len(plan))
	add := func(diag polter.Diagnostic) {
		key := fmt.Sprintf("%d\x00%s\x00%s", diag.Line, diag.Severity, diag.Message)
		if seen[key] {
			return
		}
		seen[key] = true
		out = append(out, diag)
	}
	for _, diag := range lint {
		add(diag)
	}
	for _, diag := range plan {
		add(diag)
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
