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
13. **Weak spots to close:** Atlas timeline by commit is weak for rebased history (no per-batch commit stamp); Atlas › Views and some toasts still say "Architecture"; automatic challenge from a decision review trigger; decision status chips on the Atlas canvas; importing projected ADR files.

## Cloud (needs an ADR before any code)

Local-first, offline-capable core stays free. Cloud is one Go service (Fly.io, same region as Supabase) over Postgres (`pgx` + `sqlc`), Supabase Auth with GitHub login (Go verifies JWTs), River for jobs, SSE for live claims, RLS as a second layer only. No Edge Functions, no `supabase-js` from the Web App, no Supabase Realtime. Cloud stores the project model, commit metadata, and judgments, never source code. The domain logic and Polter codec are one Go module shared with the local binary. The Web App lives in `polterware-web`; the public Desktop repository never authorizes hosted operations.

Replication is an operation log: local `change_ops` upload and merge, no silent magical merge. Remote MCP exposes the same `polter.apply` / `polter.query` / `polter.format` for agents that cannot run a local binary (Codex cloud, Claude web, ChatGPT); prefer local when a core exists.

Build order:

- **C0 — Read-only continuity.** `polterware login` (device flow), one-way log upload, GitHub App ingest, Web App delivery feed.
- **C1 — Coordination.** Two-way sync, claims with leases, sessions, handoffs, remote MCP.
- **C2 — Decisions.** Inbox with owners (`CODEOWNERS`), projection PRs (ADRs, `AGENTS.md` blocks).
- **C3 — Judge.** Decision detector and handoff verification as GitHub Checks.
- **C4 — Gates and billing.** Required checks, calibration, plans.

Cloud must not: ship an AI-memory product or a parallel vector store, provision VPS/AWS nodes or remote execution, gate local wedge features behind a subscription, or host customer applications. Pricing is undecided; the draft is Local (free), Team (shared board, claims across people, owners, delivery feed, remote MCP), Guard (Jev checks per PR, required check).

Open: sync operation granularity, long-offline replicas, log compaction, GitLab adapter boundary at ingest, webhook replay/backfill, whether "delivered" means merged or in production for a teammate, whether Cloud owns tasks or reads them from GitHub Issues/Linear.

## Jev as Cloud Judge (never in Desktop or the local binary without a new ADR)

TypeSafe Jev returns typed judgments with probabilities (Choice, Noul, Score), cheap enough to run on every push, PR, handoff, and apply. Code finds candidates, Jev selects, a threshold decides between acting, suggesting, and sending to the Inbox. Output stays `inferred` until a person or gate confirms. Keys live only in the Cloud service. Sending diffs to a third party needs per-repository opt-in and a retention policy.

Candidate checks, strongest first: decision detector and invariant guard (one request per diff); handoff verification (does the diff support what the agent said?); commit ↔ task linking without an explicit reference; duplicate or contradictory decision/question; automatic challenge when a fact meets a decision's review trigger; Inbox routing (owner, blocking, priority); Oracle packing under a token budget.

Optional later: bring-your-own LLM key enrichment (`inferred`, promoted by a human), only if an ADR allows keys in the product.

## Research and validation (hypotheses, no experiment run)

- H1: coding agents vary meaningfully across repeated runs of the same task.
- H2: typed actions, contracts, and external verification reduce unwanted variance.
- H3: explicit decisions and evidence reduce changes incompatible with architecture and requirements.
- H4: selected context capsules reduce tokens or time without material loss of success.
- H5: engineering packs reduce relevant defects in complex scenarios.

Independent hypotheses; a win on H2 does not validate H3–H5, and more restriction may lower success (report the trade-off). Minimal design: four conditions (no Polterware, structured output, typed actions, typed actions plus contracts/states/verification), fixed snapshot, task, budget, and model per block, randomized order, repeated runs. Behavioral reproducibility `BR = 1 − D`, where `D` is the mean pairwise distance between normalized action traces; define the normalization and distance before observing results and validate against independent human judges. Report separately: task success, blocked proposals versus *executed* violations, files touched, dependencies added, external calls, tokens, latency, cost. Validate the product (interviews, real use) before widening the architecture.

## Larger ideas not yet decided

- **Behavioral runtime.** Project and task contracts, typed actions, and an execution state machine that mediates effects where an integration can. Enforcement is only possible where the agent host lets Polterware mediate; elsewhere it stays advisory.
- **Engineering knowledge library.** Versioned sources, principles, applicability conditions, and checks. No paper becomes policy automatically. Context capsules select facts, ADR excerpts, gaps, and source paths under a token budget.
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
