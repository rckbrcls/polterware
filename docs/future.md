# Polterware — future work

Status: direction only. **Nothing in this file is implemented.** It is the only planning document in the repository. Shipped behavior is defined by the code, `AGENTS.md`, `polterware --help`, and `polterware format`. When an item ships, delete it from here.

Category: **Project Context & Change Intelligence for AI Coding.** Polterware keeps the project state (what it is, what was decided, what is in progress, what was delivered) identical for any agent and any person, checked against the repositories.

## Principles every item must respect

- One project model. No parallel architecture, documentation, or agent models.
- Structured before inferred. Import deterministic facts (manifests, Git, OpenAPI, Terraform, Docker) before asking an LLM. Inferred knowledge stays `inferred` until a recorded human decision promotes it.
- Provenance before confidence. Every claim says where it came from, when, and what supports it.
- Local value without Cloud. Cloud adds continuity and collaboration; it never gates local features.
- People and agents share the same model, contracts, and audit semantics.
- Drift is a finding, never an automatic overwrite.
- Ops, Terminal-as-product, and Nodes stay removed.
- The Polterware store (SQLite, later Cloud) is the source of truth. Repositories give evidence in and receive projections out.
- AI asks, humans decide. Agents decide only what was explicitly delegated, and that is recorded.

## Explicitly not now

- Light themes and theme selection across the ecosystem. All apps currently use dark mode exclusively.

- A rigid state machine for agents (UNDERSTAND → PLAN → …).
- LLM calls or user LLM keys inside the Desktop or the local binary.
- A sidebar for skills, plugins, or hooks as a product pillar (setup lives in Agents › Access).
- AI-memory or "chat over the repo" positioning; codebase-wide RAG as ingest.
- Reintroducing Operations, Terminal, or Nodes.

## Local

1. **Manual Git verification** (never run end to end). Session: `status` prints the branch; outside a work tree it still runs; `delivered` prints only when the stored stage is `delivered` and `HEAD` is an ancestor of local `main`/`master`; `handoff` compares `touched:` and `branch:` with the local diff. Import: a scan writes one `git:HEAD` row plus up to 20 `git:commit` rows, re-scan updates HEAD, a non-work-tree scan still succeeds, and `polterware repo add` adds a separate `git:<name>:HEAD` row.
2. **Two-week continuity measure.** How often context had to be re-explained, whether the agent started from the right point, whether the operator opened `status` unprompted.
3. **Broader deterministic import and scan reconcile.** More source families; prune on re-scan so drift stays honest.
4. **Provider observations (read path).** Connected CLIs/APIs become evidence, not a control plane.
5. **Architecture as Code export.** Versionable YAML/JSON/Markdown projection of the relevant model. No proprietary DSL.
6. **Context profiles and secret filtering.** Intent-shaped packages; strip secrets before MCP or Desktop packages.
7. **Richer Drift UI.** Findings open the entity, decision, or fact in the shared DetailPanel.
8. **Structured SDD.** Requirements, plan, tasks, and evidence as a graph beyond Work cards.
9. **Local Change Gates.** Optional human review before durable truth; a single-user rehearsal for Cloud gates.
10. **Light enforcement.** Claude Code `PreToolUse` advisories ("this file is governed by decision X", "adding a dependency needs a decision"). Advisory first.
11. **Engineering packs** that generate Inbox *questions*, never rules.
12. **Similarity beyond word sets.** Add an FTS5 index when a ranked-search consumer needs it. Add local embeddings (`sqlite-vec`, small local model, opt-in download) only if measured misses are material.
13. **Weak spots to close:** Atlas timeline by commit is weak for rebased history (no per-batch commit stamp); Atlas › Views and some toasts still say "Architecture"; automatic challenge from a decision review trigger; decision status chips on the Atlas canvas; importing projected Verdict files.

## Cloud (needs an Verdict before any code)

Local-first, offline-capable core stays free. Cloud is one Go service (Fly.io, same region as Supabase) over Postgres (`pgx` + `sqlc`), Supabase Auth with GitHub login (Go verifies JWTs), River for jobs, SSE for live claims, RLS as a second layer only. No Edge Functions, no `supabase-js` from the Web App, no Supabase Realtime. Cloud stores the project model, commit metadata, and judgments, never source code. The domain logic and Polter codec are one Go module shared with the local binary. The Web App lives in `polterware-web`; the public Desktop repository never authorizes hosted operations.

Replication is an operation log: local `change_ops` upload and merge, no silent magical merge. Remote MCP exposes the same `polter.apply` / `polter.query` / `polter.format` for agents that cannot run a local binary (Codex cloud, Claude web, ChatGPT); prefer local when a core exists.

Build order:

- **C0 — Read-only continuity.** `polterware login` (device flow), one-way log upload, GitHub App ingest, Web App delivery feed.
- **C1 — Coordination.** Two-way sync, claims with leases, sessions, handoffs, remote MCP.
- **C2 — Decisions.** Inbox with owners (`CODEOWNERS`), projection PRs (Verdicts, `AGENTS.md` blocks).
- **C3 — Judge.** Decision detector and handoff verification as GitHub Checks.
- **C4 — Gates and billing.** Required checks, calibration, plans.

Cloud must not: ship an AI-memory product or a parallel vector store, provision VPS/AWS nodes or remote execution, gate local wedge features behind a subscription, or host customer applications. Pricing is undecided; the draft is Local (free), Team (shared board, claims across people, owners, delivery feed, remote MCP), Guard (Jev checks per PR, required check).

Open: sync operation granularity, long-offline replicas, log compaction, GitLab adapter boundary at ingest, webhook replay/backfill, whether "delivered" means merged or in production for a teammate, whether Cloud owns tasks or reads them from GitHub Issues/Linear.

## Jev as Cloud Judge (never in Desktop or the local binary without a new Verdict)

TypeSafe Jev returns typed judgments with probabilities (Choice, Noul, Score), cheap enough to run on every push, PR, handoff, and apply. Code finds candidates, Jev selects, a threshold decides between acting, suggesting, and sending to the Inbox. Output stays `inferred` until a person or gate confirms. Keys live only in the Cloud service. Sending diffs to a third party needs per-repository opt-in and a retention policy.

Candidate checks, strongest first: decision detector and invariant guard (one request per diff); handoff verification (does the diff support what the agent said?); commit ↔ task linking without an explicit reference; duplicate or contradictory decision/question; automatic challenge when a fact meets a decision's review trigger; Inbox routing (owner, blocking, priority); Oracle packing under a token budget.

Optional later: bring-your-own LLM key enrichment (`inferred`, promoted by a human), only if an Verdict allows keys in the product.

## Research and validation (hypotheses, no experiment run)

- H1: coding agents vary meaningfully across repeated runs of the same task.
- H2: typed actions, contracts, and external verification reduce unwanted variance.
- H3: explicit decisions and evidence reduce changes incompatible with architecture and requirements.
- H4: selected context capsules reduce tokens or time without material loss of success.
- H5: engineering packs reduce relevant defects in complex scenarios.

Independent hypotheses; a win on H2 does not validate H3–H5, and more restriction may lower success (report the trade-off). Minimal design: four conditions (no Polterware, structured output, typed actions, typed actions plus contracts/states/verification), fixed snapshot, task, budget, and model per block, randomized order, repeated runs. Behavioral reproducibility `BR = 1 − D`, where `D` is the mean pairwise distance between normalized action traces; define the normalization and distance before observing results and validate against independent human judges. Report separately: task success, blocked proposals versus *executed* violations, files touched, dependencies added, external calls, tokens, latency, cost. Validate the product (interviews, real use) before widening the architecture.

## Dispatch and agent orchestration (needs a Decision before any code)

Direction: Polterware becomes the control plane for coding agents, not only the record of their work. Three layers over one store: project truth and context (PPM, Decisions, Facts, Evidence, Context Compiler); change (Activity, Drift, AgentRun, Unified Change History); execution (routing by difficulty, worktrees, verification). Suggested positioning: *the project's source of truth and the place agents are routed from*. Routing alone is a commodity; routing that reads Work cards, Decisions, and run history is not.

Origin: `dispatch` (separate repository, Go, single binary) routes a task to an installed agent CLI (Codex, Cursor, Grok, Antigravity, OpenCode) by tier `easy|normal|hard` instead of model name, ranks candidates by quota pace, falls back when a CLI hits a limit, runs in sandboxed worktrees, and returns a compact result with a verify step. Its run history overlaps Activity and AgentRun. Polterware's earlier "execution is out of scope" rule was removed from `AGENTS.md`, so merging is now allowed.

Chosen shape (leaning):

- Fold dispatch into the local core (`polterware serve`) as a Go package, not a second process. The core is already the only SQLite opener, so runs, tiers, pace, and verify results live in the same store without an event contract between processes.
- Keep dispatch reusable on its own: its `internal/*` packages are consumed behind a store interface (JSONL standalone, Polterware SQLite embedded) so the `dispatch` repository can keep shipping a light binary.
- CLI and MCP gain delegation (`polterware dispatch ...`); the TUI gains a runs view; the Desktop shows runs through Activity rather than a second history.
- Every delegation is an AgentRun. A run can start from a Work card ("run this card at tier hard") and stays linked to it.
- The `verify` result becomes Evidence on the card, so Verify stage reflects what actually ran.

Git and worktrees as evidence (not a Git client; details in the next section):

- A run in a worktree records branch, base, diff summary, touched files, and commits, linked to the card and the AgentRun.
- Drift compares the real diff with what the card and active Decisions declared; today Drift only sees declarations.
- Active worktrees are visible with card, agent, and status; parallel worktrees touching the same files are flagged before merge.
- Review in one place: card in Verify shows the worktree diff, verify result, and relevant Decisions; approving moves it to Delivered.
- Out: stage/rebase/blame UI, anything that reads as a second GitKraken.

Constraints:

- Principle conflicts to resolve in the Decision: "Ops, Terminal-as-product, and Nodes stay removed" (delegation must not return as a terminal or ops product) and "no LLM calls or user LLM keys in the local binary" (dispatch spawns existing CLIs and holds no model keys; keep it that way).
- Sandbox, process-tree cleanup, one writer per directory, and recursion guards come over with the code; they are not optional.
- Quota and pace come only from the CLIs' official protocols (for example `codex app-server`); never read provider tokens from disk, never persist credentials in SQLite.
- Cloud's "must not provision remote execution" stays: this is local execution only.
- Neutrality is the advantage: Polterware routes across vendors and keeps no preferred one.
- Do not let "orchestrator" widen the scope; prioritize what only Polterware can do (context linked to change linked to execution).

Phases:

1. Extract the dispatch store behind an interface.
2. Import the package into the core; `polterware dispatch` runs and writes AgentRun.
3. Link runs to Work cards; verify results become Evidence.
4. Worktree and Git evidence feeding Drift and Activity.
5. TUI and Desktop surfaces for runs and worktrees (a new surface needs its own approved Decision).
6. Optional: run history informs the Context Compiler and tier suggestions per card.

Open: command name (`dispatch` vs `run`); whether runs get their own Atlas/Work surface or live only in Activity; whether tier learning stays in dispatch or moves to the store; how a delegation maps to a claim once Cloud coordination (C1) exists.

## Git and worktrees as the change ledger (needs a Decision before any code)

Direction: Git is the most reliable evidence of what changed, so Polterware reads it deeply and ties every change to the card, Decision, agent, and run that justified it. It is evidence and lifecycle, never a Git client.

Starting point (shipped, narrow): the scan writes a `git:HEAD` row and up to 20 `git:commit` rows, `repo add` adds `git:<name>:HEAD`, `status` prints the branch, `delivered` checks that `HEAD` is on local `main`/`master`, and `handoff` compares `touched:` and `branch:` with the local diff (see Local item 1; end-to-end verification is still pending). Everything below is not implemented.

Worktree lifecycle (owned by the local core):

- Create one worktree per delegated run or Work card, with a deterministic branch name (card id + short slug) cut from a recorded base commit.
- Track state: base, branch, path, owner (agent or person), run, card, and status (active, verifying, ready, merged, abandoned).
- Clean up: remove merged or abandoned worktrees and branches, prune stale ones on `serve` start, and never delete a worktree with uncommitted changes without a finding in the Inbox.
- One writer per directory, enforced; parallel work always uses separate worktrees.
- Dirty main checkout is a finding, not an error: runs may start from a clean worktree while the user keeps editing.

Change evidence:

- Per run: base, head, diff summary (files, additions, deletions), touched paths, commits, and verify result, stored as Evidence on the card and linked to the AgentRun.
- Commit ↔ card linking: explicit reference first (trailer or branch name), then touched paths against the card's components. Inferred links stay `inferred` until confirmed.
- Delivered means merged: a card moves to Delivered when its branch is an ancestor of the target branch, not when an agent says so. Squash and rebase merges need patch-id or tree comparison, since ancestry is lost.
- Rebased history: stamp commits per batch so the Atlas timeline survives rewrites (closes the weak spot already listed under Local).

Drift with Git:

- Declared vs real: compare the diff against what the card, its components, and active Decisions declared (touched paths outside the card's components, new dependencies without a Decision, changes in governed files).
- Cross-run conflicts: flag worktrees whose touched paths overlap before merge, with both runs and cards named.
- Stale base: warn when a worktree's base is far behind the target branch and its card is in Verify.
- Findings open the commit, diff, or worktree in the shared DetailPanel.

Review and merge in one place:

- A card in Verify shows the worktree diff, verify result, relevant Decisions, and open Inbox items; approving records who approved and moves the card on.
- Merge itself stays a Git operation (fast-forward or merge commit chosen per project); Polterware may run it for a local branch when the user confirms, and never pushes without explicit confirmation.
- Projection back to Git: commit trailers or notes linking commit to card and run, only if the user opts in.

Boundaries:

- No stage/unstage, interactive rebase, blame, or graph UI. If a screen looks like a Git client, it is out of scope.
- No hosting-provider logic in the core (PRs, checks, reviews) beyond reading evidence through the Integrations path; GitHub App ingest belongs to Cloud (C0).
- Source code is read for evidence locally and is never uploaded; Cloud stores commit metadata only.
- Shell out to the `git` binary (as the importer does) instead of embedding a Git library, unless measurements show it is a bottleneck.
- Destructive operations (`reset --hard`, force push, branch deletion with unmerged commits) are never run automatically.

Open: branch naming scheme and whether it is configurable; where worktrees live (inside the repo, a sibling directory, or app data); behavior in repositories with submodules or sparse checkouts; large monorepos and diff cost; whether abandoned runs keep their branch for a retention window; how to treat commits made outside any run.

## Larger ideas not yet decided

- **Behavioral runtime.** Project and task contracts, typed actions, and an execution state machine that mediates effects where an integration can. Enforcement is only possible where the agent host lets Polterware mediate; elsewhere it stays advisory.
- **Engineering knowledge library.** Versioned sources, principles, applicability conditions, and checks. No paper becomes policy automatically. Context capsules select facts, Verdict excerpts, gaps, and source paths under a token budget.
- **Decision ownership.** Authority classes (human-only, delegated, agent-local), a delegation budget, and Decision Inbox routing. Humans choose architecture, method, and test strategy; accepted decisions and invariants bound the agent.
- **Automatic agent context.** Plugin, skill, and session hook that inject bounded context at session start. Fewer tokens through hybrid layout (short context file plus on-demand reads) and compact encodings such as TOON, measured against plain reading. Anti-ideas: dumping the architecture into the prompt, a vector store as truth.
- **Multi-repo answers.** Cross-repository questions resolved from linked entities and evidence across projects, without cloning the other repository; federation only with Cloud.

## Product questions still open

1. Who creates the upper Atlas levels (System, Domain): by hand, imported from code, or agent-suggested and human-approved?
2. Should the default route flip from Inbox to Work?
3. Work state per feature, per branch, or per session? (Leaning: per feature, branches linked.)

## Desktop motion backlog

Small, independent polish items, using the existing `--ease-standard`, `--ease-enter`, `--duration-fast`, and `--duration-control` tokens (see the `polter-fluid-motion` skill). Verify each against current code before starting; file paths from earlier plans may have moved.

1. Shared presence motion (`MotionPresence`, Ark-backed) and an animated `DataTable.SelectionToolbar` that stops mounting and unmounting instantly. Everything below depends on it.
2. Canvas toolbar menus moved onto the shared anchored dropdown instead of eight native `<details>` panels.
3. Notification "Mark all as read" animates into the empty state instead of applying synchronously.
4. Integration setup wizard bridges the credential-method swap (Assume Role ↔ Access Key fields).
5. Inline validation errors (Configure Component dialog) get restrained presence instead of an instant mount.
