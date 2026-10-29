/** English skill body that teaches an AI how to use Polterware MCP tools and the local CLI. */
export const POLTERWARE_AI_SKILL_MARKDOWN = `# Polterware local project context

Use this skill when the operator asks about a Polterware project’s architecture, resources, knowledge, or bounded context. Polterware keeps a local SQLite project model (Canon) and knowledge store. Reach them through the stable Polterware MCP tools or the local \`polterware\` CLI — not by inventing cloud APIs.

## When to use

- Explain components, resources, environments, or linked library items (docs, Decisions, runbooks) for the active local project.
- Gather a bounded context package before proposing a change.
- Look up a Canon entity or evidence record by id after a context hit.
- Check drift findings for the project (import dependency diffs, edges under accepted Decisions without evidence, declared-versus-observed conflicts).
- Record a minimal AgentRun audit trail: context → task → change → evidence → drift. Justified changes (human and agent) appear in Agents → History.
- Mutate facts, evidence, or knowledge through audited write tools (required change envelope: \`summary\`, \`rationale\`, open \`agent_run_id\`). Humans on Desktop use the same envelope.
- Create or update Work cards (roadmap items, tasks, open questions, invariants) in Polter format with \`polter.apply\` or \`polterware apply\`.
- Bootstrap or refresh a project from the shell with \`polterware init | scan | context | drift\`.

## Tools

### Work cards (Polter format)

| Tool | Purpose |
| --- | --- |
| \`polter.format\` | The Polter format spec (about 150 tokens). Read it once before writing cards. |
| \`polter.query\` | \`cards\` lists one line per card; \`card <slug>\` returns the whole card. |
| \`polter.apply\` | Apply Polter text (\`text\`, optional \`dry_run\`) as one audited write. Needs \`summary\` and \`rationale\` (frontmatter or arguments). Without \`agent_run_id\` the write joins this session's run; no start or complete calls. |

### Reads

| Tool | Purpose |
| --- | --- |
| \`context.get\` | Bounded context package for optional \`query\` / \`entity_id\` under \`token_budget\`. Items include provenance (\`truth_class\`, \`source\`, \`path\`), machine \`reasons\` (why included), and \`evidence\` refs for facts. Pass optional \`agent_run_id\` to append a context step. |
| \`entity.get\` | Fetch one Canon entity by \`id\`. |
| \`evidence.get\` | Fetch one Canon evidence record by \`id\`. |
| \`drift.check\` | Narrow Drift Checker for a \`project_id\` (optional \`entity_id\`). Returns \`checker: "narrow"\` and typed \`findings\`. Pass optional \`agent_run_id\` to append a drift step. |

### AgentRun audit

| Tool | Purpose |
| --- | --- |
| \`agent_run.start\` | Start an open run with \`project_id\` + \`task\` (optional \`agent_label\`). |
| \`agent_run.append\` | Append declared-only \`kind: "change"\` (\`summary\` + \`rationale\` required, optional \`paths\`) or \`kind: "evidence"\` (\`evidence_ids\`). Does not mutate the Canon. |
| \`agent_run.complete\` | Mark the run completed. |
| \`agent_run.get\` | Reconstruct the ordered audit chain for one run. |
| \`agent_run.list\` | List runs for a project. |

### Audited writes

Every write requires \`project_id\`, \`agent_run_id\` (open run), \`summary\`, and \`rationale\`. Persisted rows use actor \`agent\` and source \`mcp\`.

| Tool | Purpose |
| --- | --- |
| \`fact.upsert\` | Upsert a Canon fact (\`statement\`; optional \`id\`, \`truth_class\`, \`entity_id\`). |
| \`evidence.upsert\` | Upsert Canon evidence (\`kind\`; optional \`id\`, \`evidence_summary\`, \`path\`). |
| \`evidence.link\` | Link evidence to a fact (\`fact_id\`, \`evidence_id\`). |
| \`knowledge.upsert\` | Upsert a knowledge item (\`title\`, \`kind\`; optional \`id\`, \`body\`, \`tags\`). |
| \`knowledge.link\` | Link knowledge to a Canon entity (\`knowledge_id\`, \`entity_id\`, \`predicate\`). |

Always pass the operator’s current \`project_id\` when the tool accepts it.

## Local CLI

Build with \`pnpm build:cli\` (\`dist/polterware\`). The same binary serves the Desktop core (\`polterware serve\`) and MCP (\`polterware mcp\`). In-process SQLite — no session file.

| Command | Purpose |
| --- | --- |
| \`polterware init --name <name> [--path <root>] [--id <id>]\` | Register a project and default \`local\` environment. |
| \`polterware scan --project <id>\` | Deterministic MVP import (facts, evidence, sources). |
| \`polterware context --project <id> [--query] [--entity] [--budget] [--agent-run-id] [--json]\` | Compile a context package. |
| \`polterware drift --project <id> [--entity] [--agent-run-id] [--json]\` | Run the Narrow Drift Checker. |
| \`polterware format\` | Print the Polter format spec. |
| \`polterware query cards\` | Read Work cards in Polter format. |
| \`polterware apply <file\\|-> [--dry-run]\` | Write Work cards from Polter text. |

Prefer MCP when already connected as an agent; use the CLI for shell/CI bootstrap against the same database.

## Suggested audit flow

For Work cards, \`polter.apply\` is the whole flow: the session run is implicit.

For facts, evidence, and knowledge:

1. \`agent_run.start\` with a clear task.
2. \`context.get\` with the returned \`agent_run_id\`.
3. Audited writes (\`fact.upsert\` / \`evidence.*\` / \`knowledge.*\`) with the same \`agent_run_id\` and a change envelope.
4. \`agent_run.append\` evidence ids you relied on (optional).
5. \`drift.check\` with the same \`agent_run_id\`.
6. \`agent_run.complete\`, then \`agent_run.get\` to verify the chain.

## Rules

1. Prefer \`context.get\` for “what should I know before changing X?”.
2. Use \`entity.get\` / \`evidence.get\` to drill into ids returned by \`context.get\`.
3. Call \`drift.check\` when asking whether the model disagrees with itself; treat empty findings as “no drift under the narrow rules”, not “no checker”.
4. Treat tool output as local truth with provenance — do not claim hosted or shared workspace data.
5. Do not invent Spec Kit CLI, \`.specify/\`, embeddings, GraphRAG, or fixed PCTX serialization.
6. Credentials and provider tokens are never in SQLite; do not ask Polterware MCP for secrets.
7. Drift findings are advisory — never overwrite project truth from a finding alone.
8. Prefer audited write tools to mutate the model; \`agent_run.append\` change steps are declared envelopes only and do not mutate the Canon.
9. Never omit \`summary\`, \`rationale\`, or \`agent_run_id\` on write tools — the core rejects incomplete envelopes.

## Cursor MCP config

Configure a local stdio MCP server that runs \`polterware mcp\` against the same Desktop database path shown in Agents. Copy the JSON snippet from that screen.
`;

export const POLTERWARE_AI_SKILL_FILENAME = "polterware-ai-skill.md";
