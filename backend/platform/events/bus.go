// Package events is the core's in-memory change bus (Verdict 0007). SQLite commit
// hooks record which tables a transaction wrote; the bus coalesces them into
// numbered change events that clients watch to refresh what they show.
package events

import (
	"sort"
	"sync"
	"time"
)

// Kinds a change event can carry. Clients map them to the slices they reload.
const (
	KindProjects     = "projects"
	KindEnvironments = "environments"
	KindSettings     = "settings"
	KindWork         = "work"
	KindKnowledge    = "knowledge"
	KindCanon        = "canon"
	KindAgentRuns    = "agent_runs"
	KindIntegrations = "integrations"
	KindCanvas       = "canvas"
)

var tableKinds = map[string]string{
	"projects":                  KindProjects,
	"environments":              KindEnvironments,
	"project_settings":          KindSettings,
	"project_repos":             KindSettings,
	"work_cards":                KindWork,
	"work_tasks":                KindWork,
	"work_questions":            KindWork,
	"work_invariants":           KindWork,
	"work_handoffs":             KindWork,
	"work_commit_links":         KindWork,
	"work_claims":               KindWork,
	"work_boards":               KindWork,
	"inbox_dispositions":        KindWork,
	"structure_nodes":               KindWork,
	"structure_invariants":          KindWork,
	"node_deployments":          KindWork,
	"change_ops":                KindWork,
	"knowledge_items":           KindKnowledge,
	"knowledge_entity_links":    KindKnowledge,
	"canon_entities":            KindCanon,
	"canon_relationships":       KindCanon,
	"canon_facts":               KindCanon,
	"canon_evidence":            KindCanon,
	"canon_fact_evidence":       KindCanon,
	"agent_runs":                KindAgentRuns,
	"agent_run_steps":           KindAgentRuns,
	"agent_tool_calls":          KindAgentRuns,
	"integration_connections":   KindIntegrations,
	"integration_resources":     KindIntegrations,
	"integration_sync_runs":     KindIntegrations,
	"canvases":                  KindCanvas,
}

// KindForTable returns the event kind for a table, or "" for tables clients
// do not show (for example store_health).
func KindForTable(table string) string { return tableKinds[table] }

// Change is one coalesced event.
type Change struct {
	Seq        int64
	ProjectIDs []string
	Kinds      []string
	Origins    []string
	Resync     bool
	At         time.Time
}

const (
	defaultWindow = 100 * time.Millisecond
	historySize   = 256
	subscriberBuf = 64
)

// Bus coalesces recorded writes for a short window (which also lets the
// commit become visible) and fans the resulting change out to subscribers.
type Bus struct {
	window time.Duration

	mu       sync.Mutex
	seq      int64
	history  []Change
	subs     map[int]chan Change
	nextSub  int
	kinds    map[string]bool
	projects map[string]bool
	origins  map[string]bool
	timer    *time.Timer
}

func NewBus() *Bus {
	return &Bus{window: defaultWindow, subs: map[int]chan Change{}}
}

// Record adds one committed transaction: the tables it wrote, the project ids
// found in its rows, and the clients whose calls were in flight.
func (b *Bus) Record(tables, projectIDs, origins []string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	added := false
	for _, table := range tables {
		if kind := KindForTable(table); kind != "" {
			if b.kinds == nil {
				b.kinds, b.projects, b.origins = map[string]bool{}, map[string]bool{}, map[string]bool{}
			}
			b.kinds[kind] = true
			added = true
		}
	}
	if !added {
		return
	}
	for _, id := range projectIDs {
		b.projects[id] = true
	}
	for _, origin := range origins {
		b.origins[origin] = true
	}
	if b.timer == nil {
		b.timer = time.AfterFunc(b.window, b.flush)
	}
}

func (b *Bus) flush() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.timer = nil
	if len(b.kinds) == 0 {
		return
	}
	b.seq++
	change := Change{Seq: b.seq, Kinds: sortedKeys(b.kinds), ProjectIDs: sortedKeys(b.projects), Origins: sortedKeys(b.origins), At: time.Now().UTC()}
	b.kinds, b.projects, b.origins = nil, nil, nil
	b.history = append(b.history, change)
	if len(b.history) > historySize {
		b.history = b.history[len(b.history)-historySize:]
	}
	for _, ch := range b.subs {
		select {
		case ch <- change:
		default:
			// A subscriber that cannot keep up is told to reload everything.
			drain(ch)
			ch <- Change{Seq: change.Seq, Resync: true, At: change.At}
		}
	}
}

// Subscribe returns the current seq, the events after afterSeq still in
// history (or resync when they are gone), and a channel of new events.
func (b *Bus) Subscribe(afterSeq int64) (current int64, backlog []Change, resync bool, events <-chan Change, cancel func()) {
	b.mu.Lock()
	defer b.mu.Unlock()
	current = b.seq
	switch {
	case afterSeq > b.seq:
		// The client saw a previous core's sequence.
		resync = true
	case afterSeq > 0 && afterSeq < b.seq:
		if len(b.history) == 0 || b.history[0].Seq > afterSeq+1 {
			resync = true
			break
		}
		for _, change := range b.history {
			if change.Seq > afterSeq {
				backlog = append(backlog, change)
			}
		}
	}
	ch := make(chan Change, subscriberBuf)
	id := b.nextSub
	b.nextSub++
	b.subs[id] = ch
	return current, backlog, resync, ch, func() {
		b.mu.Lock()
		delete(b.subs, id)
		b.mu.Unlock()
	}
}

// Subscribers reports how many clients are watching.
func (b *Bus) Subscribers() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.subs)
}

func drain(ch chan Change) {
	for {
		select {
		case <-ch:
		default:
			return
		}
	}
}

func sortedKeys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for key := range set {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}
