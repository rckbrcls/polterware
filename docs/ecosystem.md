# Polterware ecosystem

Polterware is an umbrella for apps and tools by Erick Barcelos that can work **together**. It is not a bucket for everything Erick builds. A project that cannot integrate with the rest stays a personal project.

## Admission criteria

A project joins the umbrella when both of these hold:

1. **It integrates with at least one sibling** through a real contract: CLI, MCP, Connect RPC, shared schemas, or a documented file format. "Could integrate someday" does not count; the first integration must be nameable.
2. **It is useful alone.** Each member runs without the others; integrations add value but are never required.

Not requirements: being local-first, having its own core or store, keeping a separate data model, or using the shared design system and release path. Members may share them (most do today), but that is a convention, not a gate.

Anything that fails either criterion is a personal project: it lives in its own repository and is not listed on the Polterware site.

## Integration is allowed to be active

Members may command each other. A member can launch agents, call another member's tools, or write into another member's store through its public contract. There is no "observe only" rule between members. The only limit is each member's own security boundaries (credentials, sandboxes).

## Roster

| Member | Role | Integrates with |
|---|---|---|
| Polterware | Project context, work cards, decisions, commits | Agents via MCP/CLI (`polter.apply`, `polter.query`, AgentRun) |
| Polterware Notes | Notes and reminders | Agents via MCP/CLI; notifier |
| Polterware Vitals | SSH host metrics | Local core protocol |
| dispatch (candidate) | Routes a task to the right coding-agent CLI by tier and quota | Polterware, Polterware Notes, and Polterware Vitals (below) |

## dispatch: assessment

Fits. It is useful alone and has concrete integrations:

- **Polterware**: reads cards and context to build the task brief; records each delegation as an AgentRun with summary and rationale; attaches results as evidence on the card.
- **Polterware Notes**: notifies through the notifier when a long run finishes; can save results as notes.
- **Polterware Vitals**: host metrics (CPU, memory, GPU) inform where and when heavy runs go.

Open before admission: the first implemented integration (AgentRun registration is the natural one) and, optionally, a name in the family style. Until the first integration exists it stays in its own repository.
