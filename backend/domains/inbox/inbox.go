// Package inbox derives the items that need a person from data the project
// already has: open Conflicts (a request against a Rule or Decision), open
// questions (Decision), and deploy links whose provider CLI is not connected
// (Setup). Items are never stored; only a person's disposition
// is, keyed by the item's stable key.
package inbox

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"slices"
	"sort"
	"strings"
	"time"
)

const (
	KindConflict = "conflict"
	KindDecision = "decision"
	KindSetup    = "setup"

	StateOpen     = "open"
	StateDeferred = "deferred"

	ActionDecide   = "decide"
	ActionDelegate = "delegate"
	ActionDefer    = "defer"
	ActionIgnore   = "ignore"
)

// kindOrder sorts items of equal blocking by kind.
var kindOrder = map[string]int{KindConflict: 0, KindDecision: 1, KindSetup: 2}

// KindActions lists the actions each kind accepts, primary first.
var KindActions = map[string][]string{
	KindConflict: {ActionDecide, ActionDefer},
	KindDecision: {ActionDecide, ActionDelegate, ActionDefer},
	KindSetup:    {ActionDefer, ActionIgnore},
}

// ValidAction reports whether the item accepts action.
func ValidAction(item Item, action string) bool {
	return slices.Contains(item.Actions, action)
}

// Recorded reports whether action is stored as a disposition. Decide writes
// the answer on the question instead.
func Recorded(action string) bool {
	return action != ActionDecide
}

// Routed reports whether a disposition hands the item to agents through
// `polterware status` instead of leaving it for a person.
func Routed(action string) bool {
	return action == ActionDelegate
}

// Question is an open question on an active card.
type Question struct {
	ID       string
	CardSlug string
	Text     string
	Blocking bool
	Options  []string
}

// Conflict is an open request that goes against a Rule or a Decision.
// Against names it ("Rule: …" or "Decision: …"); Details carry the parts.
type Conflict struct {
	Slug     string
	Request  string
	Against  string
	CardSlug string
	Options  []string
	Details  map[string]string
}

// DeployLink is one node deployment. A Setup item is derived when its
// provider CLI is not connected.
type DeployLink struct {
	NodeID        string
	NodePath      string
	EnvironmentID string
	Environment   string
	Provider      string
	Resource      string
}

// ProviderConnection is one stored CLI connection. Status "connected" matches
// a successful probe. An empty EnvironmentID covers every environment.
type ProviderConnection struct {
	ProviderID    string
	EnvironmentID string
	Status        string
}

// ProviderStatusConnected is the probe status stored when a provider CLI
// reports an authenticated session.
const ProviderStatusConnected = "connected"

// Disposition is the latest thing a person did with one item.
type Disposition struct {
	Key       string
	Action    string
	Actor     string
	Note      string
	CreatedAt time.Time
}

// Item is one thing that needs a person.
type Item struct {
	ID       string
	Key      string
	Kind     string
	Blocking bool
	Title    string
	Detail   string
	Options  []string
	Where    string
	Source   string
	State    string
	Actions  []string
	// CardSlug and QuestionText let Decide write a question's answer, and
	// ConflictSlug a Conflict's.
	CardSlug     string
	QuestionText string
	ConflictSlug string
	// Details are the item's facts, such as a setup item's provider.
	Details map[string]string
}

// RoutedItem is an item a person handed to agents, with the action taken.
type RoutedItem struct {
	Item   Item
	Action string
}

// Result is the Inbox of one project: open items first (blocking first), then
// deferred ones, plus the items routed to agents.
type Result struct {
	Items  []Item
	Routed []RoutedItem
}

// Open counts items still waiting for a person (deferred excluded).
func (r Result) Open() int {
	n := 0
	for _, item := range r.Items {
		if item.State == StateOpen {
			n++
		}
	}
	return n
}

// Blocking counts open items that block.
func (r Result) Blocking() int {
	n := 0
	for _, item := range r.Items {
		if item.State == StateOpen && item.Blocking {
			n++
		}
	}
	return n
}

// Find returns the item or routed item whose short id or key is ref.
func (r Result) Find(ref string) (Item, bool) {
	ref = strings.TrimSpace(ref)
	for _, item := range r.Items {
		if item.ID == ref || item.Key == ref {
			return item, true
		}
	}
	for _, routed := range r.Routed {
		if routed.Item.ID == ref || routed.Item.Key == ref {
			return routed.Item, true
		}
	}
	return Item{}, false
}

// ShortID is the id people type: "i" and eight hex digits of the key hash.
func ShortID(key string) string {
	sum := sha256.Sum256([]byte(key))
	return "i" + hex.EncodeToString(sum[:4])
}

// DeployKey is the stable key of a Setup item for one node in one environment.
// It does not include the provider or resource, so a relink stays the same item.
func DeployKey(nodeID, environmentID string) string {
	return "setup:deploy:" + nodeID + ":" + environmentID
}

// UnconnectedDeploys keeps links whose provider CLI is not connected for that
// environment. A connection with an empty environment covers every environment.
func UnconnectedDeploys(links []DeployLink, connections []ProviderConnection) []DeployLink {
	var out []DeployLink
	for _, link := range links {
		if !providerConnected(link.Provider, link.EnvironmentID, connections) {
			out = append(out, link)
		}
	}
	return out
}

func providerConnected(provider, environmentID string, connections []ProviderConnection) bool {
	for _, connection := range connections {
		if connection.ProviderID != provider || connection.Status != ProviderStatusConnected {
			continue
		}
		if connection.EnvironmentID == "" || connection.EnvironmentID == environmentID {
			return true
		}
	}
	return false
}

// Derive builds the Inbox from its sources and the latest disposition per key.
// deploys are the links whose provider CLI is not connected.
func Derive(conflicts []Conflict, questions []Question, deploys []DeployLink, dispositions []Disposition) Result {
	latest := map[string]Disposition{}
	for _, d := range dispositions {
		if current, ok := latest[d.Key]; !ok || !d.CreatedAt.Before(current.CreatedAt) {
			latest[d.Key] = d
		}
	}

	var items []Item
	for _, c := range conflicts {
		key := "conflict:" + c.Slug
		items = append(items, Item{
			ID: ShortID(key), Key: key, Kind: KindConflict, Blocking: true,
			Title: c.Request, Detail: c.Against, Options: c.Options, Where: c.CardSlug,
			CardSlug: c.CardSlug, ConflictSlug: c.Slug, Details: c.Details,
		})
	}
	for _, q := range questions {
		key := "decision:" + q.ID
		items = append(items, Item{
			ID: ShortID(key), Key: key, Kind: KindDecision, Blocking: q.Blocking,
			Title: q.Text, Options: q.Options, Where: q.CardSlug,
			CardSlug: q.CardSlug, QuestionText: q.Text,
		})
	}
	for _, link := range deploys {
		key := DeployKey(link.NodeID, link.EnvironmentID)
		env := link.Environment
		if env == "" {
			env = link.EnvironmentID
		}
		where := link.NodePath
		if where == "" {
			where = link.NodeID
		}
		items = append(items, Item{
			ID: ShortID(key), Key: key, Kind: KindSetup,
			Title:  fmt.Sprintf("Connect %s for %s in %s", link.Provider, where, env),
			Detail: link.Provider, Where: where, Source: env,
		})
	}

	var result Result
	for _, item := range items {
		item.State = StateOpen
		if item.Actions == nil {
			item.Actions = KindActions[item.Kind]
		}
		if d, ok := latest[item.Key]; ok {
			switch {
			case d.Action == ActionDefer:
				item.State = StateDeferred
			case Routed(d.Action):
				result.Routed = append(result.Routed, RoutedItem{Item: item, Action: d.Action})
				continue
			case d.Action == ActionIgnore:
				continue
			}
		}
		result.Items = append(result.Items, item)
	}
	sort.SliceStable(result.Items, func(i, j int) bool {
		a, b := result.Items[i], result.Items[j]
		if (a.State == StateOpen) != (b.State == StateOpen) {
			return a.State == StateOpen
		}
		if a.Blocking != b.Blocking {
			return a.Blocking
		}
		return kindOrder[a.Kind] < kindOrder[b.Kind]
	})
	return result
}

// ActionLabel is the CLI spelling of an action ("update_intent" → "update-intent").
func ActionLabel(action string) string {
	return strings.ReplaceAll(action, "_", "-")
}

// ParseAction reads a CLI action spelling.
func ParseAction(text string) (string, error) {
	action := strings.ReplaceAll(strings.ToLower(strings.TrimSpace(text)), "-", "_")
	for _, actions := range KindActions {
		if slices.Contains(actions, action) {
			return action, nil
		}
	}
	return "", fmt.Errorf("unknown action %q: use decide, delegate, defer, or ignore", strings.TrimSpace(text))
}
