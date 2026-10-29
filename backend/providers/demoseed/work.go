package demoseed

import (
	"github.com/polterware/polterware/backend/compositions/wedge"
	storepkg "github.com/polterware/polterware/backend/providers/sqlite"
)

// roadmapPolter spreads demo Work cards across every stage, with tasks,
// invariants, open questions (one blocking, so Inbox has a decision), and a
// handoff on a card in Build.
const roadmapPolter = `---
polter: 1
summary: Seed the demo roadmap
rationale: Show every Work stage with tasks, questions, invariants, and a handoff
---

## billing-webhooks: Billing webhooks
stage: shape · under: services/payments · owner: Platform

Receive payment provider webhooks and record each event exactly once.

? Which provider signs the payload? [blocking] (stripe | adyen | both)
? Retry failed events from a queue or inline?
! Never charge a customer twice for the same event

## session-cache-health: Session cache health
stage: shape · under: data/redis

Explain why the session cache reports degraded health in development.

- [ ] Collect cache latency samples
? Is the degraded status a real regression or a stale probe?

## auth-token-rotation: Auth token rotation
stage: plan · under: services/auth · decisions: Decision-0001 · owner: Platform

Rotate signing keys without logging users out.

- [ ] Key rotation schedule in auth service  ` + "`services/auth/*`" + `
- [ ] Dual-key validation window
- [ ] Rotation runbook
! Old keys stay valid for one full session lifetime

## git-metadata-import: Git metadata import
stage: build · under: core/import · decisions: Decision-0001, Decision-0002 · owner: Platform

Import HEAD, branch, and recent commits as evidence for facts.

- [x] T1 Read HEAD and branch from the local checkout  ` + "`backend/providers/git/*`" + `
- [x] T2 Stamp revision on observed facts
- [ ] T3 Commit evidence upsert in core  ` + "`backend/domains/canon/*`" + `
- [ ] T4 Show commit evidence on fact detail  ` + "`packages/features/knowledge/*`" + `
- [-] T5 Import tags as releases
? Include merge commits? [blocking] (yes | no | first-parent)
! No network calls during scan

handoff:
branch: feat/git-metadata-import
agent: claude-code
goal: Commit evidence reaches facts on import
done: HEAD and branch are read; facts carry the revision
in_progress: Upserting commit evidence in the core
next: Wire commit evidence into the fact detail panel
touched: backend/providers/git/git.go, backend/compositions/wedge/git_import.go

## drift-panel: Drift panel
stage: build · under: reality/drift · decisions: Decision-0002

List drift findings where declared intent and observed code disagree.

- [x] Drift check over declared facts
- [ ] Group findings by card
- [ ] Empty state when nothing drifted
! A finding always names its evidence

## context-compiler: Context compiler
stage: verify · under: agents/context · decisions: Decision-0003 · owner: Agents

Compile a bounded project context for an agent session.

- [x] Token budget per section
- [x] Include active invariants
- [ ] Verify output against a large project
! The compiled context never includes credentials

## local-sqlite-core: Local SQLite core
stage: delivered · under: core · decisions: Decision-0001 · owner: Platform

One local core process owns the SQLite database; every client attaches to it.

- [x] Single core per database
- [x] Live change events
- [x] CLI and Desktop attach to the running core
! Only the core opens SQLite
`

// claimPolter is a second session (another agent) claiming an open task, so
// the board shows a claim and Agents History shows two runs.
const claimPolter = `---
polter: 1
summary: Claim the fact detail task
rationale: Pick up the commit evidence UI while the core work continues
---

## git-metadata-import: Git metadata import

claim: T4
`

func seedWork(store *storepkg.Store) error {
	applies := []wedge.ApplyInput{
		{ProjectID: ProjectID, Text: roadmapPolter, AutoStartLabel: "claude-code", Agent: "claude-code"},
		{ProjectID: ProjectID, Text: claimPolter, AutoStartLabel: "codex", Agent: "codex"},
	}
	for _, in := range applies {
		if _, err := wedge.ApplyPolter(store, in); err != nil {
			return err
		}
	}
	return nil
}
