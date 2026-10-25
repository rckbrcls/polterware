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

Polterware is both the umbrella and the main local-first app (`apps/polterware-desktop`), alongside Polterware Notes and Polterware Vitals. Polterware's first version is a local SQLite-backed Desktop with project surfaces Inbox, Work, Structure, Canvas, Truth, Dispatch, Integrations, and Activity. A Projects screen (home button in the title bar) comes before entering a project. Settings is fixed in the sidebar footer and holds Project, Agents, and App preferences. Inbox is the default route.

The umbrella is an ecosystem, not a list: apps and tools live under Polterware only when they can integrate with the others. See [`docs/ecosystem.md`](docs/ecosystem.md) for the admission criteria and the current roster.

The Desktop supports multiple local projects and environments. It has no hosted or shared workspace model. One local core process (`polterware serve`) per database is the only process that opens SQLite (it is a detached daemon guarded by a lock, with a build handshake); Electron Main, the CLI, the TUI, and the MCP bridge attach to it or start it. The renderer reads and writes through `window.polterware` only.

- Integrations: detect CLI binaries, start provider authentication commands in a core-owned PTY, optionally open provider documentation through Main `openExternal`, and probe connection status. Credentials stay in the OS/CLI credential store. **KEEP** as evidence/Connect path (not a provider console).

The integration catalog contains exactly GitHub, GitLab, AWS, Google Cloud, Azure, Vercel, Supabase, Terraform, and Docker. Do not add placeholders or app-owned provider-token fields, and never persist provider credentials in SQLite. Raw PTY output is not guaranteed to be sanitized; do not describe it as redacted.

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
- Structure: registry of the project tree (nodes: system, domain, component; a feature is a Work card shown in the node detail). Tree and Cards views with the global DetailPanel; a component lists and edits its deploy targets per environment (provider from the integration catalog plus a resource name, `deploys:` in Polter). A provider whose CLI is not connected raises an Inbox Verify item. `atlas` stays as a route alias.
- Canvas: many canvases per project, each with a type (architecture, roadmap, flow, brainstorm, ideas, free). Typed canvases validate shapes and edges; free has no rules; notes and text are allowed everywhere. A canvas is a typed graph with layout stored separately; agents read it (`polterware canvas ls|show`, MCP `polter.query` kind `canvas`) only when it is marked agent-visible, and unreferenced content is labeled unverified. Free items can be promoted to Work cards, Decisions, and Facts.
- Truth: Decisions, Facts, Evidence
  - Decisions is one list of Verdicts with a lifecycle state filter (Active, Challenged, Proposed, Superseded; all states shown by default). A Decision has a scope: a Principle applies to the whole project and stays pinned on top (`extra_json.scope = "principle"`).
  - Facts are statements about the project (declared, observed, inferred, or verified); each lists the evidence that backs it.
  - Evidence is one list of `source`, `doc`, and `runbook` items with a kind filter. Sources are registered project-relative paths (`kind = source`); Import from project root runs `ImportProjectSources` for the MVP file set. Generic filesystem indexing beyond that set is not shipped.
  - Resources are Structure components; there is no separate Inventory surface.
- Dispatch: sidebar section with three routes. Runs holds Runs and Agents. Routing holds Tiers and Learning. Usage holds Stats. Agents show quota and pace per agent. Worktree info lives on the run card. A dispatch run is a core-executed delegation in `backend/domains/dispatch`. It may reference an AgentRun id and a Work card slug, and it is not itself an AgentRun. CLI (`polterware dispatch`) and the TUI read it through the core. There is no Dispatch MCP tool. Live output stays on Runs. Quota comes only from the CLIs' official protocols; unknown usage stays unknown.
- Integrations: one sidebar route after Dispatch, with Connected and Catalog tabs (**KEEP** — evidence + Connect UI).
- Activity: flat page with the Unified Change History of justified changes across every surface, plus dispatch history entries (started, verified, merged, failed), filterable by person, agent, and tier. It has no data of its own. Opening a dispatch entry shows a summary, not the live log.
- Settings (dialog with a grouped rail):
  - Project: General, Repositories, Environments, Danger zone (archive project)
  - Agents: MCP server, Agent setup, Hooks, AI skill, Oracle, Compile context, Drift check
  - App: Shortcuts, Appearance, Local core, Privacy, Danger zone (reset local store)

Scope is a global filter, not a surface: the title bar scope filter takes repeatable tokens (`system:`, `domain:`, `component:`, and `env:` on Structure, Truth Evidence, and Activity). Node tokens are one union sent as `scope_nodes` (a parent includes its children; ancestors stay included because the read is non-exact). It narrows Work cards (through their component), Decisions, Facts, Evidence, Inbox/Drift, Activity, the Context Compiler, `polterware query|status|inbox|oracle --scope <node> [--exact]`, and the MCP `scope` argument. An entity has one optional scope (`scope_node_id`); no scope means the whole project and stays visible under any filter. Decisions take `scope:` in Polter; derived Inbox/Drift items are scoped with `polterware scope item <key> <node>`. The filter is hidden on the Projects home screen.

Keep project and environment switchers, Commander, history controls, and Settings. Do not introduce additional product surfaces without an approved decision.

## UI law

`DESIGN.md` and `@polterware/frontend-design-system` are the visual source of truth. Product features must use shared `Input`, `Textarea`, `Select`, `Field`, `Button`, `Card`, `Surface`, Ark-backed overlays, `PageToolbar`, `FilterChip`, `DataTable`, `IconTile`, `StatusChip`, and the global `DetailPanel` where applicable.

Do not hand-roll shared control chrome, menus, dialogs, operational tables, or entity panels. Use only radius and color tokens. Structural surfaces and text are opaque; alpha is limited to shared border, shadow, scrim, and transition tokens. Exception: on macOS the main window title bar and sidebar may use Electron vibrancy with `--color-shell-glass` washes; Commander and other product chrome stay opaque. Hugeicons Free Stroke Rounded is the only product icon set.

## Verification

After relevant changes, run the static checks (typecheck, `pnpm design:lint`, `buf lint`, `go vet ./...`, `git diff --check`) and the tests that cover the change. Maintain risk-proportional tests.

Do not add Markdown design or planning documents. Record decisions and work in the Polterware store (`polterware apply`); put unshipped direction in `docs/future.md` and delete items from it when they ship.
