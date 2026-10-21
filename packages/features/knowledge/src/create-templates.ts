import type { IconTileTone } from "@polterware/frontend-design-system";

export type KnowledgeTemplateKind = "doc" | "runbook" | "verdict" | "card" | "source";

export type KnowledgeCreateTemplate = {
  id: string;
  kind: KnowledgeTemplateKind;
  title: string;
  description: string;
  tone: IconTileTone;
  body?: string;
  extraJson?: string;
};

const DOC_TEMPLATES: KnowledgeCreateTemplate[] = [
  {
    id: "doc-architecture-overview",
    kind: "doc",
    title: "Architecture overview",
    description: "System context, boundaries, and key components.",
    tone: "architecture",
    body: `## Purpose

Describe why this system exists and who it serves.

## Context

- Primary users: …
- Environments: …

## System boundaries

- In scope: …
- Out of scope: …

## Key components

| Component | Role |
| --- | --- |
| … | … |

## Data flow

1. …
2. …

## Open questions

- …
`,
  },
  {
    id: "doc-onboarding",
    kind: "doc",
    title: "Onboarding guide",
    description: "Local setup steps for a new operator.",
    tone: "knowledge",
    body: `## Prerequisites

- Polterware Desktop installed
- Access to this local project

## Setup

1. Clone the repository
2. Install dependencies
3. Start the local core and Desktop
4. Open this project

## Verify

- [ ] Architecture canvas loads
- [ ] Agents MCP config copies against the local database
- [ ] Knowledge docs are readable

## Common pitfalls

- …
`,
  },
  {
    id: "doc-postmortem",
    kind: "doc",
    title: "Incident postmortem",
    description: "Timeline, impact, and follow-ups after an incident.",
    tone: "observability",
    body: `## Summary

What happened in one or two sentences.

## Impact

- Users affected: …
- Duration: …
- Severity: …

## Timeline

| Time | Event |
| --- | --- |
| … | Detected |
| … | Mitigated |
| … | Resolved |

## Root cause

…

## What went well

- …

## What to improve

- …

## Action items

- [ ] …
`,
  },
];

const VERDICT_TEMPLATES: KnowledgeCreateTemplate[] = [
  {
    id: "verdict-adopt-technology",
    kind: "verdict",
    title: "Adopt a core technology",
    description: "Decide to introduce a library, service, or platform.",
    tone: "architecture",
    body: `## Status

Proposed

## Context

We need to choose a technology for …

Constraints:

- Must run locally through the polterware core when applicable
- Must fit the current architecture boundaries

## Decision

Adopt … for …

## Consequences

Positive:

- …

Negative:

- …

Follow-ups:

- [ ] Update Architecture components
- [ ] Document operational runbooks
`,
  },
  {
    id: "verdict-reject-shared-db",
    kind: "verdict",
    title: "Reject shared database coupling",
    description: "Keep services from sharing a mutable store.",
    tone: "data",
    body: `## Status

Proposed

## Context

Multiple components need related data. Sharing one database would be the fastest path, but increases coupling.

## Decision

Reject shared mutable database ownership across service boundaries. Prefer explicit APIs or owned data stores.

## Consequences

Positive:

- Clear ownership
- Safer independent changes

Negative:

- More integration work up front

Follow-ups:

- [ ] Map data owners on the Architecture canvas
- [ ] Document sync or event contracts
`,
  },
  {
    id: "verdict-local-first-execution",
    kind: "verdict",
    title: "Keep execution local-first",
    description: "Prefer Desktop + core over hosted runners for v1.",
    tone: "execution",
    body: `## Status

Proposed

## Context

Operators need project context, agent access, and provider Connect without a hosted control plane. Hosted runners would add accounts and network dependency.

## Decision

Keep Desktop, Integrations Connect auth, and the polterware CLI, core, and MCP local for the first version.

## Consequences

Positive:

- Works offline on the operator machine
- Credentials stay in OS/CLI stores

Negative:

- No shared remote execution yet

Follow-ups:

- [ ] Document local project-root assumptions in Resources
`,
  },
];

const RUNBOOK_TEMPLATES: KnowledgeCreateTemplate[] = [
  {
    id: "runbook-restart-service",
    kind: "runbook",
    title: "Restart a local service",
    description: "Stop, verify, and restart a process safely.",
    tone: "execution",
    body: `## Goal

Restart a local service without leaving it in a half-started state.

## When to use

The service is unhealthy, stuck, or needs a config reload that requires a restart.
`,
    extraJson: JSON.stringify({
      service: "Service",
      severity: "medium",
      prerequisites: ["Confirm the service component in the Atlas", "Note the working directory"],
      steps: [
        "Identify the running service",
        "Stop the service outside Polterware using the known command",
        "Confirm it is no longer running",
        "Start the service with the known command",
        "Verify health against the service component in the Atlas",
      ],
      commands: ["ps aux | grep <service>", "<start-command>"],
      rollback: "If the restart fails, restore the previous command and working directory, then start again.",
    }),
  },
  {
    id: "runbook-rotate-secrets",
    kind: "runbook",
    title: "Rotate local secrets",
    description: "Replace credentials without storing them in SQLite.",
    tone: "security",
    body: `## Goal

Rotate credentials used by a local CLI or process while keeping secrets out of the project database.

## When to use

A token leaked, expired, or must be rotated on a schedule.
`,
    extraJson: JSON.stringify({
      service: "Integrations",
      severity: "high",
      prerequisites: [
        "Confirm which CLI owns the credential",
        "Have access to the provider console if re-auth is required",
      ],
      steps: [
        "Identify the integration or process that uses the secret",
        "Revoke or rotate the credential in the provider",
        "Re-authenticate through Integrations or the provider CLI",
        "Probe connection status",
        "Restart dependent local processes if needed",
      ],
      commands: ["<provider> auth login", "<provider> auth status"],
      rollback: "Restore the previous credential only if the provider still accepts it, then re-probe.",
    }),
  },
  {
    id: "runbook-failover",
    kind: "runbook",
    title: "Failover a dependency",
    description: "Switch traffic or config to a healthy dependency.",
    tone: "infrastructure",
    body: `## Goal

Move the local project off a failing dependency onto a healthy alternative.

## When to use

A database, cache, or upstream service is unavailable and a standby exists.
`,
    extraJson: JSON.stringify({
      service: "Infrastructure",
      severity: "high",
      prerequisites: ["Confirm standby endpoint or node", "Notify operators before cutover"],
      steps: [
        "Confirm the primary dependency is unhealthy",
        "Update local config or environment to the standby",
        "Restart dependent processes",
        "Verify reads and writes against the standby",
        "Record the change in an Verdict or incident note",
      ],
      commands: ["<health-check-command>", "<restart-command>"],
      rollback: "Point config back to the primary once it is healthy and verified.",
    }),
  },
];

const CARD_TEMPLATES: KnowledgeCreateTemplate[] = [
  {
    id: "card-user-auth",
    kind: "card",
    title: "User authentication",
    description: "Sign-in, session, and access boundaries.",
    tone: "identity",
  },
  {
    id: "card-background-jobs",
    kind: "card",
    title: "Background job runner",
    description: "Queue, run, and observe async work.",
    tone: "execution",
  },
  {
    id: "card-api-rate-limit",
    kind: "card",
    title: "API rate limiting",
    description: "Protect endpoints with fair request limits.",
    tone: "security",
  },
];

const SOURCE_TEMPLATES: KnowledgeCreateTemplate[] = [
  {
    id: "source-readme",
    kind: "source",
    title: "README",
    description: "Project root README path.",
    tone: "knowledge",
    body: "Project overview and setup entry point.",
    extraJson: JSON.stringify({ path: "README.md" }),
  },
  {
    id: "source-openapi",
    kind: "source",
    title: "OpenAPI contract",
    description: "HTTP API contract under the repo.",
    tone: "architecture",
    body: "OpenAPI or Swagger document that declares the HTTP surface.",
    extraJson: JSON.stringify({ path: "openapi.yaml" }),
  },
  {
    id: "source-compose",
    kind: "source",
    title: "Docker Compose",
    description: "Local compose stack definition.",
    tone: "execution",
    body: "Compose file that describes local multi-service runtime.",
    extraJson: JSON.stringify({ path: "docker-compose.yml" }),
  },
];

export const KNOWLEDGE_CREATE_TEMPLATES: KnowledgeCreateTemplate[] = [
  ...DOC_TEMPLATES,
  ...VERDICT_TEMPLATES,
  ...RUNBOOK_TEMPLATES,
  ...CARD_TEMPLATES,
  ...SOURCE_TEMPLATES,
];

export function knowledgeTemplatesForKind(kind: KnowledgeTemplateKind): KnowledgeCreateTemplate[] {
  return KNOWLEDGE_CREATE_TEMPLATES.filter((template) => template.kind === kind);
}

/** Evidence has no type, so its starters are the document, runbook, and source templates together. */
export function evidenceTemplates(): KnowledgeCreateTemplate[] {
  return KNOWLEDGE_CREATE_TEMPLATES.filter(
    (template) => template.kind === "doc" || template.kind === "runbook" || template.kind === "source",
  );
}

export function knowledgeTemplateById(id: string): KnowledgeCreateTemplate | undefined {
  return KNOWLEDGE_CREATE_TEMPLATES.find((template) => template.id === id);
}
