# Polterware Agent Instructions

## Communication and editing

- Speak to Erick in Brazilian Portuguese.
- Write code, UI strings, technical documentation, commits, logs, and identifiers in English.
- Preserve unrelated work and make the smallest safe change.
- Do not create branches or commits unless explicitly requested.
- Do not run browsers, previews, distributions, or development servers unless explicitly requested in the current task. Automated tests and builds may run by default.

## Work cards

- Codex and other agents: run `polterware format` once for the Polter grammar, read with `polterware query cards`, and write Work cards with `polterware apply <file|->` (frontmatter `summary` and `rationale`). Claude Code gets the same through the `plugins/polterware` plugin (a symlink to `backend/providers/agentsetup/plugin`, which the binary embeds); `polterware setup claude|codex` installs it, and `polterware hooks enable|disable <name>` switches its hooks.
- Codex and other agents: start a session with `polterware status` and end it with `polterware handoff`.

## Product positioning

Polterware's category is **Project Context & Change Intelligence for AI Coding**: every agent and person reads the same evidence-backed project state, and drift from declared intent is flagged. The shipped wedge is Canon facts/evidence, deterministic import, Context Compiler, stable MCP reads, Drift, AgentRun, audited MCP writes, CLI, Unified Change History, the Polter format with Work cards, Structure, Canvas, the Inbox, and the decision lifecycle. Integrations remain as evidence/Connect UI only.

[`docs/future.md`](docs/future.md) is the only planning document and lists what is **not** implemented (Cloud, Jev, enrichment backlog, research). It is direction, not shipped behavior; never present its items as shipped. The code, this file, `polterware --help`, and `polterware format` describe what exists.

## Current product boundary

Polterware is both the umbrella and the main local-first app (`apps/polterware-desktop`), alongside Polterware Notes and Polterware Vitals. Polterware's first version is a local SQLite-backed Desktop with project surfaces Inbox, Work, Structure, Canvas, Truth, Dispatch, and Activity. Project switching happens on the Projects screen, reached through the Home button in the title bar, before entering a project. Project settings is fixed in the sidebar footer; App settings is the gear next to Commander in the title bar. Inbox is the default route.

The umbrella is an ecosystem, not a list: apps and tools live under Polterware only when they can integrate with the others. See [`docs/ecosystem.md`](docs/ecosystem.md) for the admission criteria and the current roster.

The Desktop supports multiple local projects and environments. It has no hosted or shared workspace model. One local core process (`polterware serve`) per database is the only process that opens SQLite (it is a detached daemon guarded by a lock, with a build handshake); Electron Main, the CLI, the TUI, and the MCP bridge attach to it or start it. The renderer reads and writes through `window.polterware` only.

- Integrations: detect CLI binaries, start provider authentication commands in a core-owned PTY, optionally open provider documentation through Main `openExternal`, and probe connection status. Credentials stay in the OS/CLI credential store. **KEEP** as evidence/Connect path (not a provider console).

Platform CLIs live in Project settings (Platforms: Connected and Catalog), because connections belong to a project and its environments. The coding agent tooling (MCP, setup, hooks, the skill, the CLI reference) and the local core live in App settings. Never persist provider credentials in SQLite or add app-owned provider-token fields. Raw PTY output is not guaranteed to be sanitized; do not describe it as redacted.

## Polterware Notes (second app)

The monorepo also hosts Polterware Notes, a separate local-first app with its own core (`notes/backend`), contracts (`notes/schemas`), desktop (`apps/notes-desktop`) and feature packages (`packages/features/notes-*`). Polterware Notes shares `packages/frontend` and the UI law above but not Polterware's product surfaces, store or core: do not mix their data models, and keep the Polterware product boundary above unchanged. Polterware Notes checks run through `bash tooling/verify-notes.sh`; its renderer talks only through `window.pwnotes`.

## Architecture boundaries

- Go local authority: the single `polterware` binary (`backend/runtimes/cli`: TUI, commands, `serve`, `mcp`) and retained domains only.
- Desktop: Polterware, `apps/polterware-desktop`, with thin Electron Main, typed preload bridge, and Solid renderer.
- Features: `packages/features/<feature>`.
- Shared frontend: `packages/frontend`.
- Contracts: `schemas` to generated Go code in `backend/platform/gen` and TypeScript in `packages/contracts`.
- Renderer access: `window.polterware` only; no raw Electron or Node.js.
- The core uses a technical bearer session token without an account directory.
- There is one clean SQLite baseline and no compatibility requirement for earlier databases.

## Product navigation

- Inbox: flat page of derived items — Decision (open card questions), Drift (warning/conflict findings), Verify (facts with no evidence); count in the sidebar, also in `polterware status` and `polterware inbox`
- Work: Board, Specs
  - Several boards: a board is a saved view (`work_boards`) over the same cards, grouped by stage by default; the card stage lifecycle stays canonical.
  - The Polterware store, not Polter text, is the source of truth; `.pw.md` files are input only.
  - Board groups Work cards (`work_cards`) by stage (Shape, Plan, Build, Verify, Delivered). The Desktop reads through `WorkService.ListWorkCards` and writes Polter text through `WorkService.ApplyPolter`; agents use `polterware apply`.
  - Specs is a table of the same cards. The five-document Spec / Plan / Tasks / Clarify / Checklist model and the Constitution document are removed; project-wide principles are pinned Decisions.
- Structure: registry of the project tree (nodes: system, domain, component; a feature is a Work card linked to a node). A single tree view whose cards carry each node's details (description, repository, owner, dependencies, record counts, deploys) and a row actions menu, with no side panel; a component lists and edits its deploy targets per environment (provider from the integration catalog plus a resource name, `deploys:` in Polter). A provider whose CLI is not connected raises an Inbox Verify item. Structure is the only name for the project tree (the CLI command, the Polter query kind, the store tables, and the route).
- Canvas: many canvases per project, all of one generalist type (`canvas`). It mixes drawing shapes (general and flowchart shapes, frames, notes, text) that carry no meaning with semantic components (a kind such as web app, service, database, cache, queue, AI model, or team, plus a free-text technology and an optional Structure link); system, domain, and component nodes must reference a Structure node. The editor has a shape library on the left and a fixed inspector on the right. A canvas is a graph with layout stored separately; agents read it (`polterware canvas ls|show`, MCP `polter.query` kind `canvas`) only when it is marked agent-visible, the agent export keeps technology but drops style, and unreferenced content is labeled unverified. Free items can be promoted to Work cards, Decisions, and Facts.
- Truth: Decisions, Facts, Docs
  - Decisions is one list with a lifecycle state filter (Active, Challenged, Proposed, Superseded; all states shown by default). A Decision has a level: a Principle applies to the whole project and stays pinned on top (`level: principle` in Polter, `extra_json.level` in the store). Decisions are referenced as `Decision-NNNN`; input also reads the legacy `ADR-` and `Verdict-` prefixes.
  - Facts are statements about the project with a kind (declared, observed, inferred, or verified), a subject (the canon entity), a scope, and an origin; each lists the evidence that backs it. A Fact opens as a page whose rail holds those properties.
  - Docs is one list of docs (knowledge `kind = doc`) whose `doc_type` is `doc`, `runbook`, or `source`, with a type filter; tags are free labels. Sources are registered project-relative paths (`doc_type = source`); Import from project root runs `ImportProjectSources` for the MVP file set. Generic filesystem indexing beyond that set is not shipped.
  - Resources are Structure components; there is no separate Inventory surface.
- Dispatch: sidebar section with three routes. Runs is one page of runs. Routing holds Tiers and Learning. Tiers is a board: one column per tier, one row per order position (row 1 is the primary, the rest fallbacks); cards move by pointer drag, and the + opens a movable floating window (`FloatingWindow`) that lists the models the installed agent CLIs report (`DispatchService.ListModels`) to drag in. Every edit replaces the stored table through `DispatchService.ReplaceTiers`, which validates it like `tiers.json`. Usage holds Agents (quota and pace per agent) and Stats. Worktree info lives on the run card; a run that failed, was cancelled, timed out, or was orphaned shows its own end on the worktree chip instead of "active". Activity lists dispatch entries and changes in one feed, newest first. A dispatch run is a core-executed delegation in `backend/domains/dispatch`. Every delegation starts a linked AgentRun (the audited session its agent writes under, shown in Activity) and may reference a Work card slug. The CLI exposes the commands directly (`polterware run|wait|result|cancel|runs|merge|clean|recover|route|classify|tiers|usage|agents|doctor|subagents|config|skill`, `verify run <id>`, `hooks enable dispatch`; `polterware dispatch ...` stays as a legacy alias) and the TUI reads it through the core. There is no Dispatch MCP tool. Live output stays on Runs. Quota comes only from the CLIs' official protocols; unknown usage stays unknown.
- Activity: flat page with the Unified Change History of justified changes across every surface (canvas edits and board views stay audited but are not listed), plus dispatch history entries (started, verified, merged, failed), filterable by person, agent, and tier. It has no data of its own. Opening a dispatch entry shows a summary, not the live log.
- Settings is one dialog with a grouped rail, opened in one of two scopes:
  - Project settings (sidebar footer): Project (General, Repositories, Environments, Danger zone — archive project), Context (Oracle, Compile context, Drift check), and Platforms (Connected, Catalog — platform CLIs, **KEEP** as evidence + Connect UI; the provider sign-in flow opens over the dialog)
  - App settings (title bar, next to Commander): Agents (MCP server, Agent setup, Hooks, AI skill, CLI reference) and App (Shortcuts, Appearance, Local core, Privacy, Danger zone — reset local store)
  - The former Platforms and Core routes (`integrations`, `agents`, `cli`) are gone; `legacySettingsTab` names the Settings page that replaced each.

Removal is soft: docs and canvases are archived (`archived_at`; hidden from lists, search, context, and agent reads, restorable from each surface's Archived view), and Work cards and Structure nodes keep `status = removed`. The core permanently deletes only an archived item and never a Decision; decisions move through their lifecycle instead.

Scope is a global filter, not a surface: each scoped page edits the one shared selection from its PageToolbar filter menu, with repeatable tokens (`system:`, `domain:`, `component:`, and `env:` on Structure, Truth Docs, and Activity). Node tokens are one union sent as `scope_nodes` (a parent includes its children; ancestors stay included because the read is non-exact). It narrows Work cards (through their component), Decisions, Facts, Evidence, Inbox/Drift, Activity, the Context Compiler, `polterware query|status|inbox|oracle --scope <node> [--exact]`, and the MCP `scope` argument. An entity has one optional scope (`scope_node_id`); no scope means the whole project and stays visible under any filter. Decisions take `scope:` in Polter; derived Inbox/Drift items are scoped with `polterware scope item <key> <node>`.

Keep history controls, the Home button, Commander, App settings, and Project settings. Project switching happens on the Projects screen; do not introduce additional product surfaces without an approved decision.

## UI law

`DESIGN.md` and `@polterware/frontend-design-system` are the visual source of truth. Product features must use shared `Input`, `Textarea`, `Select`, `Field`, `Button`, `Card`, `Surface`, Ark-backed overlays, `PageToolbar`, `FilterChip`, `DataTable`, `IconTile`, `StatusChip`, and the global `DetailPanel` where applicable.

Prefer minimalist icon-only buttons with the shared tooltip (the `aria-label`) over text buttons in toolbars and page chrome; see `DESIGN.md`.

Do not hand-roll shared control chrome, menus, dialogs, operational tables, or entity panels. Use only radius and color tokens. Structural surfaces and text are opaque; alpha is limited to shared border, shadow, scrim, and transition tokens. Exception: on macOS the main window title bar and sidebar may use Electron vibrancy with `--color-shell-glass` washes; Commander and other product chrome stay opaque. Hugeicons Free Stroke Rounded is the only product icon set.

## Verification

After relevant changes, run the static checks (typecheck, `pnpm design:lint`, `buf lint`, `go vet ./...`, `git diff --check`) and the tests that cover the change. Maintain risk-proportional tests.

Do not add Markdown design or planning documents. Record decisions and work in the Polterware store (`polterware apply`); put unshipped direction in `docs/future.md` and delete items from it when they ship.
