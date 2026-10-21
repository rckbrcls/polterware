package wedge

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/polterware/polterware/backend/domains/drift"
	"github.com/polterware/polterware/backend/domains/inbox"
	"github.com/polterware/polterware/backend/domains/polter"
	"github.com/polterware/polterware/backend/domains/work"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// ReviewFeature is the Shape impact and flow checks of one card.
func ReviewFeature(store *storepkg.Store, projectID, slug string) (polter.FeatureReview, error) {
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return polter.FeatureReview{}, err
	}
	return reviewFeature(store, snapshot, slug)
}

func reviewFeature(store *storepkg.Store, snapshot work.Snapshot, slug string) (polter.FeatureReview, error) {
	refs, err := polterReferences(store, snapshot)
	if err != nil {
		return polter.FeatureReview{}, err
	}
	return polter.ReviewFeature(snapshot, slug, refs.Verdicts, questionRoutes(store, snapshot))
}

// questionRoutes maps open question ids to where they wait: the Inbox,
// deferred, or delegated to agents. A failed Inbox read leaves every
// question in the Inbox.
func questionRoutes(store *storepkg.Store, snapshot work.Snapshot) map[string]string {
	routes := map[string]string{}
	result, err := listInbox(store, snapshot)
	if err != nil {
		return routes
	}
	const prefix = "decision:"
	for _, item := range result.Items {
		if id, ok := strings.CutPrefix(item.Key, prefix); ok && item.State == inbox.StateDeferred {
			routes[id] = polter.RouteDeferred
		}
	}
	for _, routed := range result.Routed {
		if id, ok := strings.CutPrefix(routed.Item.Key, prefix); ok && routed.Action == inbox.ActionDelegate {
			routes[id] = polter.RouteDelegated
		}
	}
	return routes
}

// CreateFeatureInput is one `polterware feature new` call.
type CreateFeatureInput struct {
	ProjectID string
	Intent    string
	Title     string
	// Under is written only when the caller picked it; suggestions are not.
	Under string
	// Kind is feature (default) or architecture.
	Kind string
}

// ComposeFeature builds the ApplyInput that creates a card in shape, with a
// generated change envelope. The caller sets the actor and may override the
// summary and rationale.
func ComposeFeature(store *storepkg.Store, in CreateFeatureInput) (string, ApplyInput, error) {
	snapshot, err := store.LoadWorkSnapshot(in.ProjectID)
	if err != nil {
		return "", ApplyInput{}, err
	}
	slug, text, err := polter.CreateFeatureText(snapshot, in.Intent, in.Title, in.Under, in.Kind)
	if err != nil {
		return "", ApplyInput{}, err
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = polter.FeatureTitle(in.Intent)
	}
	summary, rationale := polter.CreateEnvelope(title)
	return slug, ApplyInput{ProjectID: in.ProjectID, Text: text, Summary: summary, Rationale: rationale}, nil
}

// ComposeAdvance builds the ApplyInput that moves a card through the
// contract or plan gate. When the gate refuses, it returns the diagnostics
// and an empty input.
func ComposeAdvance(store *storepkg.Store, projectID, slug, step string) (ApplyInput, polter.FeatureReview, []polter.Diagnostic, error) {
	review, err := ReviewFeature(store, projectID, slug)
	if err != nil {
		return ApplyInput{}, review, nil, err
	}
	text, diags := polter.AdvanceText(review, step)
	if len(diags) > 0 {
		return ApplyInput{}, review, diags, nil
	}
	summary, rationale := polter.AdvanceEnvelope(slug, step)
	return ApplyInput{ProjectID: projectID, Text: text, Summary: summary, Rationale: rationale}, review, nil, nil
}

// VerifyFeature reads whether a card or one task (`slug#T2`) is finished.
// It never writes and never moves the stored stage.
func VerifyFeature(store *storepkg.Store, projectID, target string) (polter.VerifyResult, error) {
	slug, number := strings.TrimSpace(target), 0
	if strings.Contains(slug, "#") || strings.Contains(slug, " ") {
		ref, err := polter.ParseTaskRef(slug)
		if err != nil {
			return polter.VerifyResult{}, err
		}
		slug, number = ref.Slug, ref.Number
	}
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return polter.VerifyResult{}, err
	}
	review, err := reviewFeature(store, snapshot, slug)
	if err != nil {
		return polter.VerifyResult{}, err
	}
	input, err := assembleDriftInput(store, projectID, "")
	if err != nil {
		return polter.VerifyResult{}, err
	}
	unmatched := map[int]bool{}
	for _, finding := range drift.Check(input).Findings {
		if finding.Type != drift.TypeTaskDoneUnmatched || finding.Details["slug"] != slug {
			continue
		}
		if n, err := strconv.Atoi(strings.TrimPrefix(finding.Details["task"], "T")); err == nil {
			unmatched[n] = true
		}
	}
	var contract []polter.ReviewInvariant
	for _, inv := range review.Card.Invariants {
		if inv.State == work.InvariantActive {
			contract = append(contract, polter.ReviewInvariant{Text: inv.Text, From: "card"})
		}
	}
	contract = append(contract, review.Inherited...)
	return polter.VerifyFeature(polter.VerifyInput{
		Card:      review.Card,
		Task:      number,
		Unmatched: unmatched,
		GitReady:  input.GitDeliveryReady,
		Delivered: ProjectGit(store, projectID).Delivered,
		Contract:  contract,
	})
}

// queryFeature answers "feature <slug> [step]" and "verify <target>".
func queryFeature(store *storepkg.Store, snapshot work.Snapshot, query polter.Query) (string, error) {
	if query.Kind == polter.QueryVerify {
		result, err := VerifyFeature(store, snapshot.ProjectID, query.Slug)
		if err != nil {
			return "", err
		}
		return polter.EncodeVerify(result), nil
	}
	review, err := reviewFeature(store, snapshot, query.Slug)
	if err != nil {
		return "", err
	}
	step := query.Step
	if step == "" {
		step = polter.FeatureStepShape
	}
	if !polter.ValidFeatureStep(step) {
		return "", fmt.Errorf("unknown step %q: use shape, contract, or plan", step)
	}
	return polter.EncodeFeatureReview(review, step), nil
}
