---
name: polter
description: Create or update Polterware Work cards (roadmap items, tasks, open questions, invariants) in Polter format with polterware apply. Use when planning work, recording tasks or decisions-in-progress, or moving a card between stages in a project tracked by Polterware.
---

# Polter format

Write Work cards as Polter text and apply them with the `polterware` CLI. The Polterware store is the source of truth; a `.pw.md` file is only input.

```markdown
Polter format v1: markdown that writes Polterware Work cards.

---
polter: 1
summary: One line saying what changes
rationale: Why it changes
---

## git-import: Git metadata import
stage: plan · owner: erick · under: core/import · decisions: Verdict-0007

Intent paragraph: what we want and why.

- [ ] T1 Upsert commit evidence `backend/import/*`
- [x] T2 Stamp revision on facts
? Include merge commits? [blocking] (yes | no)
! No network calls during scan

handoff:
branch: feat/git-import
agent: codex
goal: import HEAD, branch and recent commits as evidence
done: commit evidence upsert in core
in_progress: stamping revision on observed facts
next: wire into ImportProjectSources
touched: backend/import.go, docs/spec.md

### new: Local SQLite authority
status: active · trigger: multi-user sync · supersedes: Verdict-0003 · reason: why

Verdict body: context, decision, consequences.

Rules:
- `## slug: Title` is a card; the lowercase-kebab slug is its identity.
- `# path: Title` is an Atlas node. level: system, domain, or component. under: names the parent path. A component may also sit directly under its system (outside any domain). A different under: on an existing node moves it and rewrites descendant paths. uses: lists the node paths it depends on (comma separated; empty clears); the map draws them as edges. A card under: names a component path once any component exists. repo: names a checkout from `polterware repo add` (empty is the project root); path: is a folder inside it, not the node path. migrating: old design -> new design marks a node in transition (empty clears it).
- `### ref: Title` is an Verdict lifecycle block. `new` proposes one (a number is assigned); an Verdict number or id changes an existing one. States: proposed → active → challenged → active or superseded. `status: challenged` needs a reason:; `trigger:` is the review condition; `scope:` is the Atlas node path the decision applies to (omit for the whole project); `supersedes: Verdict-0003` on the newer decision marks the older one superseded. Decisions are never removed. The body is plain text: no # lines.
- Stages: shape, plan, build, verify, delivered.
- `kind: architecture` marks a card as an Architecture Change (default feature). Its under: names the node it changes; set `migrating:` on that node while the change is in flight, and clear it when the card is delivered.
- Tasks: [ ] open, [x] done, [-] dropped; T<n>, `[repo: api]`, and a trailing `scope` glob are optional. A scope may carry its checkout: `api:src/auth/*`.
- `?` is an open question, `!` a contract invariant. `? Question -> answer` records the decision and closes its Inbox item.
- `handoff:` records one session on `branch:` (required): goal, done, in_progress, next, touched, agent.
- Claim before editing: `claim: T2` in the card or `polterware task claim slug#T2`; `done: T2` finishes, `release: T2` lets go. The holder is the session agent; a task or overlapping scope held by another agent is refused. Scopes in different checkouts never overlap.
- A text only changes what it mentions. Remove with status: removed, [-], or a trailing [removed].
- New feature: `polterware feature new "<intent>"`, then `feature shape|contract|plan <slug>` (`--accept` / `--approve` pass the gate); check with `polterware verify <slug>`.
- Start with `polterware status`. End with `polterware handoff --card <slug> --note "..."`.
- Check with `polterware lint file.pw.md`; write with `polterware apply file.pw.md [--dry-run]`.
```

## Workflow

1. Start from `polterware status` (current card, branch, last handoff, open questions).
2. Read current cards first: `polterware query cards` (one line per card) or `polterware query "card <slug>"`.
3. Before editing a task's files, claim it: `polterware task claim <slug>#T2`. Finish with `polterware task done <slug>#T2`, or `polterware task release <slug>#T2` to let go unfinished.
4. Write only what changes. Unmentioned cards, tasks, and fields stay as they are.
5. Check the plan: `polterware apply file.pw.md --dry-run` (or pipe text to `polterware apply - --dry-run`).
6. Apply: `polterware apply file.pw.md`. Every apply needs `summary` and `rationale` in the frontmatter.
7. Fix errors from the line-numbered messages; each one says how.
8. End the session with `polterware handoff --card <slug> --note "..."`. A `touched:` list that does not match the git diff is a hint, not an error.

Writes in this session join one AgentRun per project automatically; do not start or complete runs yourself.
