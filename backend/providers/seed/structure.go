package seed

import "strings"

// structurePolter is Polterware described in its own Structure: one system, its
// domains and components, and the Work cards from its roadmap. "§" stands for a backtick
// (task scopes) and {web}/{cloud} expand to a "repo:" segment only when that
// checkout is registered.
const structurePolter = `---
polter: 1
summary: Describe Polterware as a Structure and Work board
rationale: Polterware is managed with its own build, so its structure and roadmap are the seed
---

# polterware: Polterware
level: system

Project Context and Change Intelligence for AI Coding: one local project model that every agent and person reads and writes.

! Never describe planned capabilities as shipped
! Never persist provider credentials in SQLite

# polterware/desktop: Desktop
level: domain · under: polterware · decisions: Decision-0002 · path: apps/polterware-desktop

Electron Main, a typed preload bridge, and a Solid renderer over the local core.

! The renderer reads and writes only through window.polterware

# polterware/desktop/main: Electron Main
level: component · under: polterware/desktop · path: apps/polterware-desktop/src/main · uses: polterware/core/server, polterware/contracts/generated · kind: desktop · tech: Electron

Thin process: window security, IPC, core supervision, updater.

# polterware/desktop/preload: Preload bridge
level: component · under: polterware/desktop · path: apps/polterware-desktop/src/preload · uses: polterware/desktop/main, polterware/contracts/generated · kind: desktop · tech: Electron

The typed window.polterware surface.

# polterware/desktop/renderer: Solid renderer
level: component · under: polterware/desktop · path: apps/polterware-desktop/src/renderer · uses: polterware/desktop/preload, polterware/frontend/features, polterware/frontend/design-system, polterware/contracts/generated · kind: frontend · tech: Solid

Product surfaces built from the shared design system and feature packages.

! Use shared design-system controls, never hand-rolled chrome

# polterware/frontend: Shared frontend
level: domain · under: polterware · path: packages

Feature packages and the shared frontend infrastructure the Desktop renderer is assembled from.

# polterware/frontend/features: Feature packages
level: component · under: polterware/frontend · path: packages/features · uses: polterware/frontend/design-system, polterware/frontend/state, polterware/frontend/canvas · kind: frontend · tech: Solid

Shell, Structure, Work and Decisions, Reality, Integrations, Settings, and Commander, one package each.

# polterware/frontend/design-system: Design system
level: component · under: polterware/frontend · path: packages/frontend/design-system · uses: polterware/frontend/state · kind: frontend · tech: Solid

Shared controls, overlays, tables, and the design tokens in DESIGN.md.

# polterware/frontend/canvas: Canvas
level: component · under: polterware/frontend · path: packages/frontend/canvas · kind: frontend · tech: TypeScript

The graph canvas the Structure map is drawn on.

# polterware/frontend/state: State and platform
level: component · under: polterware/frontend · path: packages/frontend/state · kind: frontend · tech: TypeScript

Reactive state and the platform adapters the renderer reads through.

# polterware/contracts: Contracts
level: domain · under: polterware · path: schemas

One schema source for the Go server and the TypeScript clients.

# polterware/contracts/generated: Schemas and generated code
level: component · under: polterware/contracts · path: schemas · kind: spec · tech: Protobuf

Protobuf schemas, generated Go in backend/platform/gen and TypeScript in packages/contracts.

# polterware/core: Local core
level: domain · under: polterware · decisions: Decision-0007 · path: backend

The polterware serve process. It owns SQLite and serves Connect RPC and MCP.

! Only the core opens SQLite

# polterware/core/server: Core server
level: component · under: polterware/core · decisions: Decision-0007 · path: backend/compositions/local-core · uses: polterware/core/services, polterware/core/store, polterware/core/mcp, polterware/core/events, polterware/core/integrations, polterware/core/inbox, polterware/core/structure, polterware/agents/runs, polterware/agents/access, polterware/agents/setup, polterware/contracts/generated · kind: service · tech: Go, ConnectRPC

The Connect RPC and MCP HTTP server, the process lock, and the build handshake.

! One core per database

# polterware/core/services: Project services
level: component · under: polterware/core · decisions: Decision-0004 · path: backend/compositions/wedge · uses: polterware/core/work, polterware/core/import, polterware/core/drift, polterware/core/context, polterware/core/decisions, polterware/core/structure, polterware/core/inbox, polterware/core/git, polterware/core/facts, polterware/core/store, polterware/agents/runs · kind: service · tech: Go

Composes the domains into project init, scan, Polter apply, and project model sync.

# polterware/core/store: SQLite store
level: component · under: polterware/core · decisions: Decision-0007 · path: backend/providers/sqlite · kind: database · tech: SQLite

One clean baseline schema and the commit hooks that emit change events.

# polterware/core/work: Work model and Polter codec
level: component · under: polterware/core · decisions: Decision-0006, Decision-0010 · path: backend/domains/polter · uses: polterware/core/structure, polterware/core/decisions, polterware/core/context · kind: service · tech: Go

Work cards, tasks, questions, invariants, decisions, claims, and the Polter grammar.

! Polter text is never stored as a blob

# polterware/core/facts: Facts and evidence
level: component · under: polterware/core · decisions: Decision-0004 · path: backend/domains/canon · kind: service · tech: Go

Project facts, their evidence, and the truth class each one carries.

# polterware/core/import: Deterministic import
level: component · under: polterware/core · decisions: Decision-0004, Decision-0005 · path: backend/providers/importer · uses: polterware/core/facts, polterware/core/git · kind: worker · tech: Go

Reads a fixed set of project files and Git metadata into facts and evidence.

! No network calls during scan

# polterware/core/git: Git evidence
level: component · under: polterware/core · decisions: Decision-0005 · path: backend/providers/git · kind: service · tech: Go

HEAD, branch, and recent commits read from the registered checkouts.

# polterware/core/drift: Drift checker
level: component · under: polterware/core · decisions: Decision-0004 · path: backend/domains/drift · uses: polterware/core/facts · kind: service · tech: Go

Reports where declared intent and observed code disagree.

! A finding always names its evidence

# polterware/core/context: Context compiler and Oracle
level: component · under: polterware/core · decisions: Decision-0004, Decision-0008 · path: backend/domains/context · kind: service · tech: Go

Packs the project graph into a budgeted context for an agent session.

! The compiled context never includes credentials

# polterware/core/structure: Structure model
level: component · under: polterware/core · decisions: Decision-0008, Decision-0009 · path: backend/domains/structure · kind: service · tech: Go

System, domain, and component nodes, their uses edges, derived status, and history.

# polterware/core/decisions: Decision lifecycle
level: component · under: polterware/core · decisions: Decision-0010 · path: backend/domains/decision · kind: service · tech: Go

Decision states and the supersede chain.

! A challenge is never automatic

# polterware/core/inbox: Inbox derivation
level: component · under: polterware/core · path: backend/domains/inbox · uses: polterware/core/drift · kind: service · tech: Go

Decision, Drift, and Verify items derived on every read.

# polterware/core/events: Change events
level: component · under: polterware/core · path: backend/platform/events · kind: stream · tech: Go

The bus that tells every attached client the store changed.

# polterware/core/integrations: Integration probes
level: component · under: polterware/core · path: backend/domains/integrations · kind: service · tech: Go

Detects provider CLIs and probes connection status; credentials stay in the OS or CLI store.

! Never persist provider credentials in SQLite

# polterware/core/mcp: MCP server and bridge
level: component · under: polterware/core · decisions: Decision-0007 · path: backend/providers/mcp · uses: polterware/core/services, polterware/core/store, polterware/core/work, polterware/core/context, polterware/core/drift, polterware/core/facts, polterware/agents/runs, polterware/agents/access · kind: mcp · tech: Go

Audited MCP reads and writes inside the core; polterware mcp is a stdio bridge.

! Every MCP write carries a summary and a rationale

# polterware/cli: CLI and TUI
level: domain · under: polterware · decisions: Decision-0007 · path: backend/runtimes/cli

The single polterware binary: commands, status TUI, serve, and mcp.

# polterware/cli/commands: CLI commands
level: component · under: polterware/cli · path: backend/runtimes/cli · uses: polterware/cli/coreclient, polterware/core/server, polterware/core/mcp, polterware/core/work, polterware/agents/setup · kind: cli · tech: Go

Thin core clients: apply, query, status, handoff, structure, oracle, decision, feature, export.

# polterware/cli/coreclient: Core client
level: component · under: polterware/cli · path: backend/platform/coreclient · uses: polterware/contracts/generated · kind: cli · tech: Go

Finds or starts the local core and attaches to it.

# polterware/agents: Agent integration
level: domain · under: polterware · decisions: Decision-0006 · path: backend/providers/agentsetup

How Claude Code, Codex, and Cursor reach Polterware, and what a session leaves behind.

# polterware/agents/setup: Agent setup
level: component · under: polterware/agents · path: backend/providers/agentsetup · uses: polterware/cli/commands, polterware/core/mcp · kind: agent · tech: Go

Embedded Claude Code plugin, per-hook switches, Codex skill and AGENTS.md line, Cursor MCP entry.

! The core never edits an agent's own files except through its CLI

# polterware/agents/runs: AgentRun audit
level: component · under: polterware/agents · decisions: Decision-0004 · path: backend/domains/agentrun · uses: polterware/core/context, polterware/core/drift · kind: agent · tech: Go

One audited run per session, with steps, tool calls, and change batches.

# polterware/agents/access: Agent access
level: component · under: polterware/agents · path: backend/domains/agentaccess · kind: auth · tech: Go

Which agents may read and write a project.

# polterware/web: Website and Web App
level: domain · under: polterware · decisions: Decision-0003{web}

The public Polterware Website. The authenticated Web App is not built yet.

# polterware/web/site: Website
level: component · under: polterware/web · decisions: Decision-0003{web} · kind: frontend

Next.js site owned by polterware-web.

! Public or shared frontend code never grants hosted authorization

# polterware/cloud: Cloud
level: domain · under: polterware · decisions: Decision-0001, Decision-0005{cloud}

Hosted identity, sync, and enrichment. Design documents only; nothing here ships yet.

! Cloud never unlocks local Desktop features

# polterware/cloud/docs: Cloud design
level: component · under: polterware/cloud · decisions: Decision-0005{cloud} · kind: spec

Architecture drafts for sync, hosted MCP, and the Judge.

## navigation-swap: Navigation swap
stage: delivered · under: polterware/desktop/renderer

Sidebar surfaces Inbox, Structure, Work, Decisions, Reality, Agents, Integrations, with Settings in the footer.

- [x] Sidebar and routes §packages/features/shell/*§
- [x] Legacy routes redirect
- [x] Commander and docs updated

## work-board: Work board
stage: delivered · under: polterware/desktop/renderer · decisions: Decision-0006

Five stage columns (Shape, Plan, Build, Verify, Delivered) read from the Work tables.

- [x] Board reads WorkService.ListWorkCards §packages/features/knowledge/*§
- [x] Stage change, create, and remove go through ApplyPolter
- [x] Specs table over the same cards

## polter-work-model: Polter format and Work model
stage: delivered · under: polterware/core/work · decisions: Decision-0006

Agents create a roadmap with one apply call; the store, not the text, is the truth.

- [x] Work tables and append-only change log §backend/providers/sqlite/*§
- [x] Codec: decode, lint, plan, apply, encode §backend/domains/polter/*§
- [x] CLI apply, lint, format, query §backend/runtimes/cli/*§
! Removal is explicit and rows are never deleted

## agent-channels: Agent channels
stage: delivered · under: polterware/agents/setup · decisions: Decision-0006

The same Polter grammar reaches agents through MCP, the Claude Code plugin, and AGENTS.md.

- [x] MCP polter.format, polter.query, polter.apply §backend/providers/mcp/*§
- [x] Claude Code skill and lint hook
- [x] Session-scoped AgentRun opened on the first real write

## polter-hints: Duplicate and placement hints
stage: delivered · under: polterware/core/work

Non-blocking hints for similar cards, questions, and invariants, by normalization, no embeddings.

- [x] Similarity hints on lint and apply §backend/domains/polter/hints.go§
- [x] Suggest under: for new cards

## single-local-core: Single local core with live sync
stage: delivered · under: polterware/core/store · decisions: Decision-0007

One core owns SQLite; every client attaches to it and sees changes without a reload.

- [x] One core per database, idle exit, build handshake
- [x] Change events from commit hooks
- [x] Desktop, CLI, TUI, and MCP attach to the running core
! Only the core opens SQLite

## continuity-loop: Continuity loop
stage: verify · under: polterware/cli/commands

Switch between Codex and Claude on Polterware's own development without re-explaining context.

- [x] Handoff records and polterware handoff §backend/runtimes/cli/*§
- [x] polterware status with card, branch, and last handoff
- [x] Session hooks for status and the handoff reminder
- [ ] Measure for two weeks whether context had to be re-explained
? Did the next agent start from the right point without help?

## git-metadata-import: Git metadata import
stage: verify · under: polterware/core/import · decisions: Decision-0004, Decision-0005

Import HEAD, branch, and recent commits as evidence for facts.

- [x] Read HEAD, branch, and up to 20 first-parent commits §backend/providers/git/*§
- [x] Stamp the HEAD revision on file facts
- [x] Link commits to tasks by explicit citation
- [x] Drift for done tasks without a commit and commits without a task
- [ ] Run the manual Git checklist from docs/future.md (session and import)
! No network calls during scan

## claims: Task claims
stage: verify · under: polterware/core/work

Two agents never claim overlapping scopes.

- [x] task claim, done, and release §backend/domains/work/*§
- [x] Claim owner shown on the board
! A claimed scope is exclusive per checkout

## inbox: Inbox with real items
stage: verify · under: polterware/core/work

Decision, Drift, and Verify items derived on every read.

- [x] Derived items and blocking flag §backend/domains/inbox/*§
- [x] Decide, delegate, defer, and verify actions
- [x] Sidebar count, status, and polterware inbox
! The Inbox has only Decision, Drift, and Verify items

## structure-hierarchy-oracle: Structure hierarchy and Oracle
stage: verify · under: polterware/core/context · decisions: Decision-0008, Decision-0009

System, domain, and component nodes above Work cards, plus a budgeted Oracle.

- [x] Node model and derived status §backend/domains/structure/*§
- [x] Multi-repository nodes and projections §backend/domains/projection/*§
- [x] polterware structure and oracle
- [x] Structure canvas and Oracle preview
! Oracle uses no model

## new-feature-flow: New-feature flow
stage: verify · under: polterware/core/work

A stepper from Intent through Shape and Contract to Plan, with gates.

- [x] Contract and Plan gates §backend/domains/polter/feature.go§
- [x] polterware feature and verify commands
- [x] Oracle impact shown at Shape

## decision-lifecycle: Decision lifecycle
stage: verify · under: polterware/core/work · decisions: Decision-0010

Proposed, active, challenged, superseded, with history kept.

- [x] Lifecycle states and supersede chain §backend/domains/decision/*§
- [x] Decisions tabs and Decision detail actions
- [x] polterware decision commands
! A challenge is never automatic

## architecture-evolution: Architecture evolution
stage: verify · under: polterware/core/work · decisions: Decision-0008

Architecture Change cards, node migration state, and the Structure timeline.

- [x] kind: architecture cards and migrating: on nodes
- [x] structure --at and structure history §backend/domains/structure/*§

## agent-sessions: Agents sessions
stage: verify · under: polterware/agents/runs

Live sessions, their claims and branch, and recent handoffs.

- [x] WorkService.ListAgentSessions and the Sessions tab
- [x] TUI rows for claims and Inbox

## agent-setup: Agent setup
stage: verify · under: polterware/agents/setup

The operator chooses what Polterware installs into each agent.

- [x] Embedded Claude Code plugin and per-hook switches §backend/providers/agentsetup/*§
- [x] Codex and other agents: skill file and AGENTS.md line
- [x] Setup doctor
- [ ] Register Cursor, Claude Code, and Codex on this machine
! Nothing requires hooks

## local-build-dogfood: Manage Polterware with its own build
stage: build · under: polterware/cli/commands · decisions: Decision-0007

Run Polterware on its own repository from a local build, and judge every seeded item.

- [x] Test sweep green for Go and TypeScript
- [x] Build the CLI and the unsigned macOS app
- [x] Seed the real Polterware project
- [ ] Open the packaged app and confirm it starts and attaches to the core
- [ ] Connect Cursor, Claude Code, and Codex to the built CLI
- [ ] Sign and notarize the macOS build
? Which seeded cards and Decision statuses are wrong?

handoff:
branch: feat/structure-grounded-sdd
agent: claude-code
goal: Manage Polterware with its own build
done: tests green, CLI and macOS app built, real Polterware project seeded
in_progress: reviewing the seeded project in the app
next: open the packaged app and connect the agents
touched: backend/providers/seed/seed.go

## detail-panel-cold-load: Detail panel cold load
stage: build · under: polterware/desktop/renderer

On a cold load the detail panel never reveals when loading turns to ready.

- [ ] Fix the loading to ready transition §packages/frontend/state/*§
- [ ] Turn the it.fails detail-panel test into a passing test

## design-lint-opacity: Design lint opacity violations
stage: plan · under: polterware/desktop/renderer

pnpm design:lint fails with 13 opacity violations that predate the test sweep.

- [ ] Remove alpha from boot-splash.css
- [ ] Remove alpha from template-card.css
- [ ] Remove alpha from markdown-editor.css
- [ ] pnpm design:lint passes
! Structural surfaces and text are opaque

## renderer-persist-load-tests: Renderer persist and load tests
stage: plan · under: polterware/desktop/renderer

Cover request payload shapes and partial failure in the workspace loader and persister.

- [ ] persist.ts payload shapes with a mocked core client §apps/polterware-desktop/src/renderer/workspace/*§
- [ ] load.ts partial-failure behavior
- [ ] Smoke test that the contracts exports the Desktop uses exist §packages/contracts/*§

## structure-views-naming: Structure Views naming
stage: plan · under: polterware/desktop/renderer

Structure Views and some toasts still say Architecture.

- [ ] Rename Architecture strings in Structure Views and toasts §packages/features/architecture/*§

## structure-upper-levels: Creating the upper Structure levels
stage: shape · under: polterware/core/work · decisions: Decision-0008

Decide who creates System and Domain nodes.

? Who creates the upper levels? [blocking] (by hand | imported from code | agent-suggested and approved)

## external-task-sources: External task sources
stage: shape · under: polterware/core/work

Decide whether Polterware owns tasks or reads them from an issue tracker.

? Does Polterware own tasks or read them from GitHub Issues or Linear? (own | read and link | both)

## default-route: Default route
stage: shape · under: polterware/desktop/renderer

The default route is Inbox today; docs/future.md asks whether Work should be the default.

? Should the default route flip from Inbox to Work?

## pretooluse-enforcement: Light enforcement with PreToolUse
stage: shape · under: polterware/agents/setup · decisions: Decision-0010

Tell an agent that a file is governed by a decision, before it edits.

! Advisory first, never blocking

## engineering-packs: Engineering packs
stage: shape · under: polterware/core/work

Packs that generate questions for the Inbox, never rules.

! A pack adds questions, not rules

## retrieval-measurement: Retrieval measurement
stage: shape · under: polterware/core/context · decisions: Decision-0005

Measure duplicate and commit-link misses on real use before adding local embeddings.

- [ ] Count misses of FTS5 and normalization on this repository
! Embeddings are never the source of truth

## cloud-judge: Cloud Judge
stage: shape · under: polterware/cloud/docs · decisions: Decision-0005

Jev as a Cloud-only Judge: decision detector, invariant guard, handoff verification.

! Never in the Desktop or the local binary without a new Decision
? Which first check headlines the Guard plan?

## cloud-sync: Cloud sync
stage: shape · under: polterware/cloud/docs · decisions: Decision-0005

Project sync across machines, managed backup, and hosted MCP on the same project model.

? For a teammate on Cloud, does delivered mean on main or in production?

## web-app: Polterware Web App
stage: shape · under: polterware/web/site · decisions: Decision-0003

The authenticated hosted surface. The Website exists; the Web App does not.

! Do not present the Web App as shipped
`

// structureText fills the checkout placeholders.
func structureText(hasWeb, hasCloud bool) string {
	repo := func(name string, ok bool) string {
		if !ok {
			return ""
		}
		return " · repo: " + name
	}
	return strings.NewReplacer(
		"{web}", repo("web", hasWeb),
		"{cloud}", repo("cloud", hasCloud),
		"§", "`",
	).Replace(structurePolter)
}
