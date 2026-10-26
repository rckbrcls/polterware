---
name: dispatch
description: Delegate a task to another coding agent (Codex, Cursor, Grok, Antigravity) chosen by difficulty tier (easy|normal|hard) instead of by model, and get a compact result back. Use it to save orchestrator tokens or to parallelize work: localized implementation, tests, review, code reading, investigation. Do not use it for trivial tasks you can finish in a few calls.
---

# dispatch

`polterware run` routes a task to an installed agent CLI by **tier** and returns a compact result.
The core picks from the tier table and quota headroom, and falls back when an agent fails.
You are the conductor: delegate, read short summaries, integrate.

## When to delegate

Delegate: localized implementation, tests, review, code reading, independent parallel work.
Do it yourself: a one-line change, work that needs this whole conversation, or a brief that costs more than the task.
Pick the lowest tier that can do the job.

| Tier | For |
|---|---|
| `easy` | clear, localized task; reading; simple tests; mechanical refactor |
| `normal` | feature across a few files; bug with an unknown cause |
| `hard` | architecture; sensitive code (auth, money, permissions, data); hard bugs |

Sensitive code is promoted one tier automatically. `polterware classify "<prompt>" [--tier normal] [--explain]` estimates risk locally, with no LLM or network.

## Recipe

1. **Start the run.** It returns right away with an `id`; the core executes it in the background.

```bash
polterware run --tier normal --card <slug> - <<'BRIEF'
<goal; what it may and may not touch; the exact verify command; final report in <= 10 lines>
BRIEF
```
   The brief carries **paths, never pasted code**.
2. **Wait:** `polterware wait <id> --timeout 9m`. Exit 3 means still running: call `wait` again. Do not end the turn with runs pending.
3. **Read the summary** (compact JSON). The agent text is in `polterware result <id> --section agent`. Check `git -C <worktree> diff --stat` and run the tests. Do not read the whole diff.
4. **Integrate:** `polterware merge <id>` (COMPLETED runs only). `verification_failed` refuses the merge until `--force` and lists the regressions. `unverified` and `error` warn and still merge. A merge conflict is detected with `git merge-tree` before the working tree is touched, and is never bypassed by `--force`. A failed run: `polterware clean <id>`.

## Parallelism

Independent delegations go in the same response, each with its own `id`; then one `wait` per id. Write runs in a git repo get their own worktree and branch, so they do not conflict.

## Result

`run` and `wait` print a summary: `status`, `agent`, `model`, `tier`, `run_ms`, files and +/-, `verification` (status only), `attempts`, `branch`, `worktree`, and pointers in `details`. Read more with `polterware result <id> --section summary|agent|verification|files|attempts|meta`.

- `attempts` > 1 means a **fallback** happened; a rate limit puts the agent on a 1h cooldown.
- `verification`: `verified`, `verification_failed`, `unverified` (not a pass), or `error`.
- Exit codes: 0 ok, 124 timeout, 1 other failures; `wait` returns 3 while the run is still going.

## Manage runs

```bash
polterware runs                  # history
polterware cancel <id>         # cancel a running run
polterware recover <id>        # ORPHANED: commit preserved work, unverified
polterware verify run <id>         # re-run the checks (for example after recover)
polterware verify --init       # create .dispatch/verify.json when missing
polterware clean <id> [--force]  # discard the worktree
```

## Subagents (named profiles)

Profiles in `agents.json` (the dispatch state dir) and `<repo>/.dispatch/agents.json` (project wins) fix role, tier, `readonly`, `timeout`, and instructions:

```bash
polterware subagents                # effective profiles
polterware run --as reviewer --dir <repo> - <<< "review branch X"
```

Explicit flags win over the profile. `prefer` and `avoid` are weights in the ranking, not filters.

## Filters and routing (optional; `--tier` alone is the default)

`run` accepts `--provider`, `--model`, `--effort low|medium|high|xhigh`, `--agent`, `--priority speed|balanced|quality`, `--relax`.
A filter narrows candidates and fallback; with none left the run fails (`--relax` returns to tier routing, with a note).
`polterware route [same filters] [--json]` shows candidates, eliminations, and the winner without running anything.
`polterware config get|set|allow|deny [--project]` keeps the persistent policy (allow/deny of providers, models, agents; deny wins).

## Rules

- **The verbose agent log is for the user** (Desktop Runs, TUI). Do not read it; use the summary.
- **No recursive delegation** from inside a dispatch run.
- **One writer per directory**, and no push, deploy, or secrets in the brief.
- Cursor and Grok have no quota source: their routing only learns after a rate limit. `polterware agents` shows `confidence=empirical`.
- A `DEGRADED` CLI still runs, with a note. A required capability that is missing is refused with a clear error.
- `FAILED` with exhausted candidates means improve the brief or raise a tier; do not resend it unchanged.

## Diagnostics

```bash
polterware agents            # installed CLIs, quota source and confidence
polterware doctor [--json]   # version, flags, capabilities; never calls a model
polterware tiers [--check]   # effective table, validated against installed agents
polterware subagents --check # validate profiles
polterware usage --by model --since 7d
```
