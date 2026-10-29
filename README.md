# Polterware

Polterware is a local-first project context and change-intelligence tool for AI coding. It keeps one evidence-backed model of a software project (what it is, what was decided, what is in progress, what was delivered) so every coding agent and person starts from the same state, and it flags when changes drift from declared intent.

## Current product

A local SQLite-backed Desktop (Electron + Solid) over a single Go binary, `polterware`. Project navigation:

- **Inbox** — items that need a person: open card questions, drift findings, and facts with no evidence
- **Work** — Board (cards by stage: Shape, Plan, Build, Verify, Delivered) and Specs (the same cards as a table)
- **Structure** — Map and Components of the system, domain, and component graph
- **Truth** — Decisions (Verdicts with a state filter, principles pinned), Facts, and Evidence (sources, docs, runbooks), all with provenance
- **Activity** — the Unified Change History of every justified change, by person or agent
- **Agents** — Access (MCP setup), Sessions, History, and Context (what an agent sees at a zoom and token budget)
- **Integrations** — Connected and Catalog (GitHub, GitLab, AWS, Google Cloud, Azure, Vercel, Supabase, Terraform, Docker); evidence and provider login only
- **Settings** — General, Environments, Shortcuts, Advanced

Agents talk to Polterware in the Polter format (markdown that writes Work cards, Structure nodes, and decisions) through the CLI or MCP (`polter.apply`, `polter.query`, `polter.format`, plus context, drift, and AgentRun tools). Every write carries a summary and rationale and lands in one change history.

One local core process (`polterware serve`) per database is the only process that opens SQLite. Electron Main, the CLI, the TUI, and the MCP bridge attach to it or start it. The renderer reads and writes only through `window.polterware`. Provider credentials stay in the OS or CLI credential store and are never persisted in SQLite.

Only the local deployment mode exists. Cloud, Jev, and other unshipped direction are listed in [docs/future.md](docs/future.md).

## Using it with agents

```bash
polterware status                 # current card, branch, last handoff, open questions
polterware format                 # Polter grammar
polterware query cards            # one line per card
polterware apply plan.pw.md       # write cards (frontmatter needs summary and rationale)
polterware handoff --note "..."   # end a session
polterware setup claude           # install the Claude Code plugin (or: setup codex)
```

Run `polterware` with no arguments in a terminal for the status TUI. Run `polterware --help` for every command.

## Install

The desktop apps ship as alpha builds for macOS on Apple Silicon. Install, or update an installed copy, with:

```bash
curl -fsSL https://raw.githubusercontent.com/polterware/polterware/main/scripts/install-desktop.sh | bash
```

That installs Polterware Vitals; add `APP=polterware` or `APP=notes` before `bash` for the other apps. Run the same command again to update.

## Repository

- `apps/web` — Solid studio portfolio; use `pnpm dev:web`, `pnpm build:web`, and `pnpm preview:web`
- `apps/polterware-desktop` — Electron Main, preload bridge, and Solid renderer
- `packages/features` — product surfaces
- `packages/frontend` — shared design system, canvas, and state
- `backend` — Go runtime (single `polterware` binary: CLI, TUI, `serve`, `mcp`)
- `apps/notes-desktop`, `packages/features/notes-*`, `notes/` — Polterware Notes, the second app (see below)
- `schemas` — Protobuf contracts and generated Go/TypeScript messages
- `DESIGN.md` — visual and interaction contract
- `docs/future.md` — planned work, not implemented

## Development

```bash
pnpm install
pnpm dev            # every app (Turborepo): Polterware, Polterware Notes, Polterware Vitals, web, gallery
pnpm dev:polterware       # or one app: dev:polterware | dev:notes | dev:vitals | dev:web | dev:gallery
```

Each desktop `dev` builds its local core first and starts it with the app. The same `<task>[:<app>]` pattern applies to `build`, `preview`, `typecheck`, and `test`. Dev ports are fixed: Polterware 5173, Polterware Notes 5174, Polterware Vitals 5175, gallery 5177, web 5178. For standalone core development:

```bash
pnpm dev:core
```

Static checks:

```bash
pnpm typecheck
pnpm design:lint
cd schemas && buf lint
cd ../backend && go vet ./...
git diff --check
```

## Polterware Notes

Polterware Notes is a local-first notes and reminders app that lives in this monorepo next to Polterware. It reuses the Polterware design system and has its own Go core (`notes/backend`: SQLite with FTS5, Connect RPC, an MCP server for agents, and the `pwnotes` CLI), an Electron + Solid desktop (`apps/notes-desktop`), a native macOS reminders module, and feature packages under `packages/features/notes-*`. Contracts live in `notes/schemas`.

```bash
pnpm install
pnpm dev:notes          # desktop + local core
bash tooling/verify-notes.sh
```

## Desktop releases

Polterware, Polterware Notes, and Polterware Vitals release the same way. `bash tooling/release/dist-mac.sh polterware|notes|vitals` (or `pnpm dist:polterware:mac`, `dist:notes:mac`, `dist:vitals:mac`) builds an ad-hoc signed macOS arm64 DMG and ZIP under the app's `release/<version>` with `SHA256SUMS`, a bundle verification, and a build report.

Pushing a tag `<app>-v<version>` (for example `vitals-v0.1.0-alpha.1`) runs that app's release workflow, which attaches the artifacts to a draft GitHub release; a version with a suffix is marked as a pre-release. Nothing is published automatically. Builds are not notarized, so macOS asks for confirmation on first open, and updates are manual: there is no auto-update feed.

## Ecosystem

Polterware is both the umbrella and the main app, with Polterware Notes, Polterware Vitals, and other tools that integrate with each other. What qualifies, and what stays a personal project, is in [docs/ecosystem.md](docs/ecosystem.md).

## Open source and Cloud

This repository is the public product: Desktop, local runtime, contracts, and shared UI. Polterware Cloud is a separate managed service on a private control plane and is not implemented here. The public website and future Web App live in `polterware-web`.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [TRADEMARKS.md](TRADEMARKS.md), and [SECURITY.md](SECURITY.md).
