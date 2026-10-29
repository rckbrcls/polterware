---
name: polter
description: Create or update Polterware Work cards (roadmap items, tasks, open questions, invariants), Decisions, and canon Facts in Polter format with polterware apply, and read a card, Structure node, or file's brief before working on it. Use when planning work, recording tasks or decisions-in-progress, or moving a card between stages in a project tracked by Polterware.
---

# Polter format

Write Work cards as Polter text and apply them with the `polterware` CLI. The Polterware store is the source of truth; a `.pw.md` file is only input. Structure nodes, Decisions, Facts, and the feature flow are topics: `polterware format structure|decisions|facts|feature`.

```markdown
Polter format v1: markdown that writes Work cards. One apply is one audited change.

---
polter: 1
summary: One line saying what changes
rationale: Why it changes
---

## git-import: Git metadata import
stage: build · under: core/import · milestone: beta · decisions: Decision-0007

Intent: what we want and why.

- [ ] T1 Upsert commit evidence `backend/import/*`
- [x] T2 Stamp revision on facts
? Include merge commits? [blocking] (yes | no)
! No network calls during scan

handoff:
branch: feat/git-import
next: wire into ImportProjectSources

Rules:
- `## slug: Title` is a card; the lowercase-kebab slug is its identity. Stages: shape, plan, build, verify, delivered. under: is a Structure component path; milestone: is a milestone slug (empty is the Backlog).
- Tasks: [ ] open, [x] done, [-] dropped; T<n> and a trailing `scope` glob are optional. `?` is a question (`? Question -> answer` answers it), `!` an invariant.
- handoff: needs branch:; it also takes goal, done, in_progress, next, touched, agent.
- Claim a task before editing it: `claim: T2`; `done: T2` finishes it, `release: T2` lets go.
- A text changes only what it mentions. Remove with status: removed, [-], or a trailing [removed].
- Read `polterware brief <slug|path|file>` before you work; find with `polterware search <terms>`. Start with `polterware status`; end with a handoff.
- More: `polterware format structure|decisions|facts|feature`. Check with `polterware lint <file>`; write with `polterware apply <file|-> [--dry-run]`.
```

## Workflow

1. Start from `polterware status` (current card, branch, last handoff, open questions).
2. Before you work on a card, a Structure node, or a file, read `polterware brief <slug|path|file>`. Find anything with `polterware search <terms>`.
3. Before editing a task's files, claim it: `polterware task claim <slug>#T2`. Finish with `polterware task done <slug>#T2`, or `polterware task release <slug>#T2` to let go unfinished.
4. Write only what changes, then check the plan: `polterware apply file.pw.md --dry-run` (or pipe text to `polterware apply - --dry-run`). Every apply needs `summary` and `rationale`.
5. Apply, and fix errors from the line-numbered messages; each one says how.
6. End the session with `polterware handoff --card <slug> --note "..."`. A `touched:` list that does not match the git diff is a hint, not an error.

Writes in this session join one AgentRun per project automatically; do not start or complete runs yourself.
