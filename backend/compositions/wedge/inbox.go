package wedge

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/polterware/polterware/backend/domains/canon"
	"github.com/polterware/polterware/backend/domains/inbox"
	"github.com/polterware/polterware/backend/domains/work"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// ErrUnknownInboxItem means the id matches no current Inbox item.
var ErrUnknownInboxItem = errors.New("unknown inbox item: list them with polterware inbox")

// InboxInputError is a caller mistake: an action the item does not take, or a
// missing or malformed answer.
type InboxInputError struct{ Message string }

func (e *InboxInputError) Error() string { return e.Message }

func inboxInput(format string, args ...any) error {
	return &InboxInputError{Message: fmt.Sprintf(format, args...)}
}

// ListInbox derives the project's Inbox. It only reads: drift runs without the
// project model sync so a read never emits a change event.
func ListInbox(store *storepkg.Store, projectID string) (inbox.Result, error) {
	snapshot, err := store.LoadWorkSnapshot(projectID)
	if err != nil {
		return inbox.Result{}, err
	}
	return listInbox(store, snapshot)
}

func listInbox(store *storepkg.Store, snapshot work.Snapshot) (inbox.Result, error) {
	var questions []inbox.Question
	for _, card := range snapshot.Cards {
		if card.Status != work.CardActive {
			continue
		}
		for _, q := range card.Questions {
			if q.State != work.QuestionOpen {
				continue
			}
			questions = append(questions, inbox.Question{
				ID: q.ID, CardSlug: card.Slug, Text: q.Text, Blocking: q.Blocking, Options: q.Options,
			})
		}
	}
	findings, err := DriftFindings(store, snapshot.ProjectID)
	if err != nil {
		return inbox.Result{}, err
	}
	facts, err := store.ListUnbackedCanonFacts(snapshot.ProjectID)
	if err != nil {
		return inbox.Result{}, err
	}
	links, err := store.ListNodeDeployLinks(snapshot.ProjectID)
	if err != nil {
		return inbox.Result{}, err
	}
	connections, err := store.ListConnections(snapshot.ProjectID)
	if err != nil {
		return inbox.Result{}, err
	}
	probes := make([]inbox.ProviderConnection, 0, len(connections))
	for _, connection := range connections {
		probes = append(probes, inbox.ProviderConnection{
			ProviderID: connection.ProviderID, EnvironmentID: connection.EnvironmentID, Status: connection.Status,
		})
	}
	dispositions, err := store.ListInboxDispositions(snapshot.ProjectID)
	if err != nil {
		return inbox.Result{}, err
	}
	return inbox.Derive(questions, findings, facts, inbox.UnconnectedDeploys(links, probes), dispositions), nil
}

// ResolveInboxInput is one action on one Inbox item.
type ResolveInboxInput struct {
	ProjectID string
	ItemID    string
	Action    string
	// Answer is the decision for decide.
	Answer string
	// Actor is who acted: the session agent label or "desktop".
	Actor string
	// Apply carries the actor kind, tool, and run for the decide write.
	Apply ApplyInput
}

// ResolveInboxResult says what the action wrote.
type ResolveInboxResult struct {
	Item   inbox.Item
	Action string
	// Apply is set for decide, which writes the answer as Polter text.
	Apply *ApplyResult
}

// ResolveInbox applies one action. Decide writes `? text -> answer` through
// ApplyPolter, verify marks the fact verified, and every other action appends
// a disposition.
func ResolveInbox(store *storepkg.Store, in ResolveInboxInput) (ResolveInboxResult, error) {
	current, err := ListInbox(store, in.ProjectID)
	if err != nil {
		return ResolveInboxResult{}, err
	}
	item, ok := current.Find(in.ItemID)
	if !ok {
		return ResolveInboxResult{}, fmt.Errorf("%w (%s)", ErrUnknownInboxItem, strings.TrimSpace(in.ItemID))
	}
	if !inbox.ValidAction(item.Kind, in.Action) {
		labels := make([]string, 0, len(item.Actions))
		for _, action := range inbox.KindActions[item.Kind] {
			labels = append(labels, inbox.ActionLabel(action))
		}
		return ResolveInboxResult{}, inboxInput("cannot %s a %s item: use %s", inbox.ActionLabel(in.Action), item.Kind, strings.Join(labels, ", "))
	}
	result := ResolveInboxResult{Item: item, Action: in.Action}
	actor := strings.TrimSpace(in.Actor)

	switch in.Action {
	case inbox.ActionDecide:
		text, err := DecideText(item, in.Answer)
		if err != nil {
			return result, err
		}
		apply := in.Apply
		apply.ProjectID = in.ProjectID
		apply.Text = text
		applied, err := ApplyPolter(store, apply)
		result.Apply = &applied
		return result, err
	case inbox.ActionVerify:
		if strings.HasPrefix(item.Key, "verify:deploy:") {
			return result, inboxInput("connect the %s CLI to clear this item", item.Detail)
		}
		if actor == "" || actor == "system" {
			return result, canon.ErrVerifiedRequiresActor
		}
		fact, err := store.GetCanonFact(item.FactID)
		if err != nil {
			return result, canon.ErrUnknownFact
		}
		fact.TruthClass = canon.TruthVerified
		fact.Actor = actor
		fact.UpdatedAt = time.Now().UTC()
		if err := canon.ValidateFact(fact); err != nil {
			return result, err
		}
		return result, store.UpsertCanonFact(fact)
	default:
		return result, store.InsertInboxDisposition(in.ProjectID, inbox.Disposition{
			Key: item.Key, Action: in.Action, Actor: actor, CreatedAt: time.Now().UTC(),
		})
	}
}

// DecideText is the Polter text that answers a Decision item's question. It
// repeats [blocking] so the write does not change the flag.
func DecideText(item inbox.Item, answer string) (string, error) {
	answer = strings.TrimSpace(answer)
	switch {
	case item.Kind != inbox.KindDecision:
		return "", inboxInput("only a decision item takes an answer")
	case answer == "":
		return "", inboxInput("decide needs an answer")
	case strings.ContainsAny(answer, "\r\n") || strings.Contains(answer, "->"):
		return "", inboxInput("answer must be one line without ->")
	}
	line := "? " + item.QuestionText
	if item.Blocking {
		line += " [blocking]"
	}
	return fmt.Sprintf("---\npolter: 1\nsummary: Answer an open question on %s: %s\nrationale: A person decided the open question from the Inbox\n---\n\n## %s\n%s -> %s\n",
		item.CardSlug, item.QuestionText, item.CardSlug, line, answer), nil
}
