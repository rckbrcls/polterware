import type { PolterwareBridge } from "../preload/bridge.js";
import { emptyCorePreferences } from "../shared/core-preferences.js";
import type { CoreStatus } from "../shared/core-status.js";
import { emptyQuitPreferences } from "../shared/quit-preferences.js";

const PREVIEW_PROJECT_ID = "browser-preview";
const EMPTY_PROJECT_ID = "browser-empty";

const previewProjects = [
  { id: PREVIEW_PROJECT_ID, name: "Browser preview", rootPath: "/preview", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: EMPTY_PROJECT_ID, name: "Empty project", rootPath: "/empty", createdAt: "2026-01-02T00:00:00.000Z" },
];

const previewEnvironments = [
  { id: "env-local", name: "Local", kind: "local", projectId: PREVIEW_PROJECT_ID, protection: "standard", isDefault: true, description: "Developer machine." },
  { id: "env-staging", name: "Staging", kind: "staging", projectId: PREVIEW_PROJECT_ID, protection: "relaxed", isDefault: false, description: "Pre-production checks." },
  { id: "env-production", name: "Production", kind: "production", projectId: PREVIEW_PROJECT_ID, protection: "strict", isDefault: false, description: "Customer-facing systems." },
  { id: "env-empty-local", name: "Local", kind: "local", projectId: EMPTY_PROJECT_ID, protection: "standard", isDefault: true, description: "" },
];

const previewSettings = [
  { projectId: PREVIEW_PROJECT_ID, description: "Sample project with data in every surface.", defaultEnvironmentId: "env-local", repository: "polterware" },
  { projectId: EMPTY_PROJECT_ID, description: "", defaultEnvironmentId: "env-empty-local", repository: "" },
];

const previewRepos = [
  { id: "repo-core", name: "polterware", path: "/preview/repos/polterware" },
  { id: "repo-web", name: "polterware-web", path: "/preview/repos/polterware-web" },
];

const view = (id: string, name: string, description: string, owner: string, environments: string[], tags: string[], purpose: string, members: [string, string, string, string][]) => ({
  id, name, description, updatedAt: "2026-09-20T12:00:00.000Z", owner, environments, tags, purpose,
  notes: "Maintained by hand for the browser preview.",
  members: members.map(([nodeId, memberName, type, layer]) => ({ nodeId, name: memberName, type, layer })),
});

const previewViews = [
  view("view-runtime", "Runtime topology", "How requests reach the data layer.", "Platform", ["Production"], ["runtime"], "Explain the request path.", [
    ["res-web", "Web app", "service", "edge"], ["res-api", "Core API", "service", "application"], ["res-db", "Primary database", "database", "data"]]),
  view("view-data", "Data stores", "Everything that persists state.", "Data", ["Production", "Staging"], ["data"], "Track stateful systems.", [
    ["res-db", "Primary database", "database", "data"], ["res-cache", "Session cache", "cache", "data"], ["res-stg-db", "Staging database", "database", "data"]]),
  view("view-delivery", "Delivery pipeline", "From commit to deploy.", "Platform", ["Local", "Staging"], ["ci"], "Show how changes ship.", [
    ["res-runner", "CI runner", "compute", "delivery"], ["res-bucket", "Artifact bucket", "storage", "delivery"], ["res-stg-api", "Staging API", "service", "application"]]),
  view("view-async", "Async work", "Queues and workers.", "Platform", ["Production"], ["jobs"], "Understand background processing.", [
    ["res-queue", "Job queue", "queue", "application"], ["res-api", "Core API", "service", "application"]]),
];

const knowledgeItem = (
  id: string, kind: string, title: string, summary: string, body: string, owner: string,
  status: string, tags: string[], updatedAt: string, extra: Record<string, unknown> = {},
) => ({ id, kind, title, summary, body, owner, status, tags, updatedAt, extraJson: JSON.stringify(extra) });

const adrExtra = (statusReason: string, reviewTrigger: string, supersededBy = "") => ({ supersededBy, reviewTrigger, statusReason });

const previewKnowledge = [
  knowledgeItem("adr-principle-local", "adr", "Local-first truth", "One SQLite database per project.",
    "## Decision\n\nProject state must stay useful on one machine without a hosted account.", "Platform", "active", ["principle"], "2026-09-01T09:00:00.000Z",
    { scope: "principle" }),
  knowledgeItem("adr-principle-evidence", "adr", "Evidence over opinion", "Observed facts win over inferred ones.",
    "## Decision\n\nDeclared and observed facts take precedence over inferred knowledge.", "Platform", "active", ["principle"], "2026-09-01T09:00:00.000Z",
    { scope: "principle" }),
  knowledgeItem("doc-overview", "doc", "System overview", "How the pieces fit together.", "# Overview\n\nThe core owns storage; clients attach to it.", "Platform", "published", ["overview"], "2026-09-02T09:00:00.000Z",
    { author: "Ada", environment: "All", componentIds: ["comp-core"] }),
  knowledgeItem("doc-onboarding", "doc", "Onboarding guide", "First week checklist.", "# Onboarding\n\n1. Clone the repo.\n2. Start the core.", "Platform", "published", ["guide"], "2026-09-03T09:00:00.000Z",
    { author: "Grace", environment: "Local", componentIds: ["comp-cli"] }),
  knowledgeItem("doc-api", "doc", "API conventions", "Naming and error rules.", "# API\n\nErrors use stable codes.", "Backend", "published", ["api"], "2026-09-04T09:00:00.000Z",
    { author: "Linus", environment: "Production", componentIds: ["comp-api"] }),
  knowledgeItem("doc-release", "doc", "Release process", "Draft of the new release flow.", "# Release\n\nDraft in progress.", "Platform", "draft", ["release"], "2026-09-05T09:00:00.000Z",
    { author: "Ada", environment: "Staging", componentIds: ["comp-cli"] }),
  knowledgeItem("doc-data", "doc", "Data model notes", "Tables and ownership.", "# Data\n\nFacts carry evidence.", "Data", "published", ["data"], "2026-09-06T09:00:00.000Z",
    { author: "Edsger", environment: "All", componentIds: ["comp-store"] }),
  knowledgeItem("doc-security", "doc", "Threat notes", "Draft threat model.", "# Threats\n\nTokens never reach SQLite.", "Security", "draft", ["security"], "2026-09-07T09:00:00.000Z",
    { author: "Margaret", environment: "Production", componentIds: ["comp-api"] }),
  knowledgeItem("adr-001", "adr", "ADR 001: Single local core", "One process opens the database.", "## Decision\n\nOnly the core opens SQLite.\n\n## Consequence\n\nClients attach over a local socket.", "Platform", "active", ["storage"], "2026-08-01T09:00:00.000Z",
    adrExtra("Still the simplest safe model.", "Revisit if cloud sync ships.")),
  knowledgeItem("adr-002", "adr", "ADR 002: Poll for changes", "Clients poll for updates.", "## Decision\n\nClients poll every few seconds.", "Platform", "superseded", ["sync"], "2026-08-05T09:00:00.000Z",
    adrExtra("Replaced by push events.", "None.", "adr-003")),
  knowledgeItem("adr-003", "adr", "ADR 003: Push change events", "The core pushes change events.", "## Decision\n\nThe core streams change events to clients.", "Platform", "active", ["sync"], "2026-08-10T09:00:00.000Z",
    adrExtra("Lower latency than polling.", "Revisit if event volume grows.")),
  knowledgeItem("adr-004", "adr", "ADR 004: Markdown intent files", "Intent lives in Polter text.", "## Decision\n\nWork cards are written as Polter text.", "Product", "challenged", ["format"], "2026-08-15T09:00:00.000Z",
    adrExtra("Two teams report friction with the grammar.", "Review after the next format release.")),
  knowledgeItem("adr-005", "adr", "ADR 005: Signed evidence", "Evidence should be signed.", "## Decision\n\nProposal to sign imported evidence.", "Security", "proposed", ["security"], "2026-08-20T09:00:00.000Z",
    adrExtra("Awaiting review.", "Decide before the public beta.")),
  ...[
    ["rb-restart-core", "Restart the core", "core", "high", "Recover a stuck local core."],
    ["rb-rotate-token", "Rotate the session token", "api", "critical", "Replace the bearer session token."],
    ["rb-restore-db", "Restore the database", "store", "critical", "Restore from the last checkpoint."],
    ["rb-clear-cache", "Clear the session cache", "cache", "low", "Flush stale sessions."],
  ].map(([id, title, service, severity, summary]) => knowledgeItem(id, "runbook", title, summary, `# ${title}\n\nFollow the steps below.`, "Platform", "published", ["ops"], "2026-09-08T09:00:00.000Z", {
    service, severity, prerequisites: ["Shell access", "Core installed"], steps: ["Check status", "Apply the fix", "Confirm health"],
    commands: [`polterware status`, `polterware serve --check`], rollback: "Restore the previous state and restart.", lastValidated: "2026-09-08T09:00:00.000Z",
  })),
  ...[
    ["src-readme", "README", "README.md"],
    ["src-agents", "Agent instructions", "AGENTS.md"],
    ["src-package", "Workspace manifest", "package.json"],
    ["src-schema", "Schema baseline", "schemas/baseline.sql"],
  ].map(([id, title, path]) => knowledgeItem(id, "source", title, `Registered source ${path}.`, "", "Platform", "active", [], "2026-09-09T09:00:00.000Z", { path })),
];

const link = (id: string, knowledgeId: string, entityId: string, predicate: string) => ({
  id, knowledgeId, entityId, predicate, truthClass: "declared", source: "polterware",
});

const previewLinks = [
  link("link-1", "doc-overview", "ent-core", "describes"),
  link("link-2", "doc-onboarding", "ent-cli", "describes"),
  link("link-3", "doc-api", "ent-api", "describes"),
  link("link-4", "doc-data", "ent-store", "describes"),
  link("link-5", "rb-restart-core", "ent-core", "operates"),
  link("link-6", "rb-rotate-token", "ent-res-api", "operates"),
  link("link-7", "rb-restore-db", "ent-res-db", "operates"),
  link("link-8", "rb-clear-cache", "ent-res-cache", "operates"),
];

const entity = (id: string, kind: string, refId: string, title: string) => ({
  id, kind, refKind: kind, refId, title, truthClass: "declared", source: "polterware",
});

const previewEntities = [
  entity("ent-core", "component", "comp-core", "Core"),
  entity("ent-cli", "component", "comp-cli", "CLI"),
  entity("ent-api", "component", "comp-api", "API"),
  entity("ent-store", "component", "comp-store", "Store"),
];

type AtlasSeed = [id: string, parentId: string, level: string, slug: string, path: string, title: string, status: string, decisions: string[], childCount: number, featureCount: number, openQuestions: number, folder: string];

const atlasSeeds: AtlasSeed[] = [
  ["n-sys", "", "system", "polterware", "polterware", "Polterware", "in_progress", [], 4, 0, 0, ""],
  ["n-platform", "n-sys", "domain", "platform", "polterware/platform", "Platform", "in_progress", [], 3, 1, 0, "backend"],
  ["n-product", "n-sys", "domain", "product", "polterware/product", "Product", "in_progress", [], 3, 2, 1, "apps"],
  ["n-data", "n-sys", "domain", "data", "polterware/data", "Data", "delivered", [], 2, 1, 0, "schemas"],
  ["n-agents", "n-sys", "domain", "agents", "polterware/agents", "Agents", "proposed", [], 2, 0, 1, "plugins"],
  ["comp-core", "n-platform", "component", "core", "polterware/platform/core", "Core", "delivered", ["ADR 001", "ADR 003"], 0, 2, 0, "backend/runtimes"],
  ["comp-cli", "n-platform", "component", "cli", "polterware/platform/cli", "CLI", "delivered", [], 0, 1, 0, "backend/cli"],
  ["comp-api", "n-platform", "component", "api", "polterware/platform/api", "API", "drift", ["ADR 003"], 0, 1, 1, "backend/api"],
  ["comp-desktop", "n-product", "component", "desktop", "polterware/product/desktop", "Desktop", "in_progress", [], 0, 3, 1, "apps/polterware-desktop"],
  ["comp-atlas", "n-product", "component", "atlas", "polterware/product/atlas", "Atlas", "in_progress", ["ADR 004"], 0, 2, 0, "packages/features/atlas"],
  ["comp-inbox", "n-product", "component", "inbox", "polterware/product/inbox", "Inbox", "delivered", [], 0, 1, 0, "packages/features/inbox"],
  ["comp-store", "n-data", "component", "store", "polterware/data/store", "Store", "delivered", ["ADR 001"], 0, 1, 0, "backend/store"],
  ["comp-contracts", "n-data", "component", "contracts", "polterware/data/contracts", "Contracts", "delivered", [], 0, 0, 0, "schemas"],
  ["comp-mcp", "n-agents", "component", "mcp", "polterware/agents/mcp", "MCP bridge", "proposed", ["ADR 005"], 0, 1, 1, "backend/mcp"],
  ["comp-plugin", "n-agents", "component", "plugin", "polterware/agents/plugin", "Agent plugin", "proposed", [], 0, 0, 0, "plugins/polterware"],
];

/** `uses:` per node id: the node paths it depends on. The map draws them as edges. */
const previewUses: Record<string, string[]> = {
  "comp-cli": ["polterware/platform/core"],
  "comp-api": ["polterware/platform/core", "polterware/data/store"],
  "comp-desktop": ["polterware/platform/api", "polterware/product/inbox"],
  "comp-atlas": ["polterware/platform/core"],
  "comp-mcp": ["polterware/platform/core", "polterware/data/contracts"],
  "comp-plugin": ["polterware/agents/mcp"],
};

const previewAtlas = {
  nodes: atlasSeeds.map(([id, parentId, level, slug, path, title, status, decisions, childCount, featureCount, openQuestions, folder]) => ({
    id, parentId, level, slug, path, title, status, decisions, childCount, featureCount, openQuestions, folder,
    uses: previewUses[id] ?? [],
    intent: `${title} keeps its part of the system coherent.`,
    invariants: level === "component" ? [{ id: `inv-${slug}`, text: `${title} never writes outside its own folder.` }] : [],
    repo: level === "component" ? "polterware" : "",
  })),
  driftSlugs: ["api"],
  historical: false,
};

const previewLayoutNodes = [
  "comp-cli",
  "comp-core",
  "comp-desktop",
  "comp-api",
  "comp-store",
  "comp-atlas",
  "comp-mcp",
].map((id, index) => ({
  id,
  name: id,
  type: "service",
  origin: "manual",
  state: "observed",
  x: 40 + index * 24,
  y: 40,
  width: 188,
  height: 56,
  zIndex: 1,
}));

const previewLayout = {
  formatVersion: 1,
  id: "browser-preview-layout",
  systemId: "sys-local",
  nodes: previewLayoutNodes,
  // Atlas edges come from the nodes' uses: (previewUses), not from the layout.
  relationships: [],
  boundaries: [],
  preferences: { edgeRouting: "orthogonal" },
  viewport: { x: 64, y: 32, zoom: 0.85 },
};

/** The preview layout lives in memory so a map edit survives a workspace refresh. */
const previewLayoutState = { bodyJson: JSON.stringify(previewLayout), revision: 3 };

/**
 * Enough of `work.apply` for the Atlas map: a node block that moves it (under:)
 * or replaces its uses:. Everything else is ignored, like the rest of this bridge.
 */
function applyPreviewPolter(args?: { projectId?: string; text?: string }): Promise<Record<string, never>> {
  const text = args?.projectId === PREVIEW_PROJECT_ID ? args.text ?? "" : "";
  const heading = /^# ([^:\s]+):/m.exec(text);
  const node = heading ? previewAtlas.nodes.find((item) => item.path === heading[1]) : undefined;
  if (node) {
    const uses = /^uses:(.*)$/m.exec(text);
    if (uses) {
      node.uses = uses[1]!.split(",").map((part) => part.trim()).filter(Boolean);
    }
    const under = /(?:^|·\s*)under:\s*([^\s·]+)/m.exec(text)?.[1];
    const parent = under ? previewAtlas.nodes.find((item) => item.path === under) : undefined;
    if (parent && parent.id !== node.parentId) {
      const oldPath = node.path;
      node.parentId = parent.id;
      node.path = `${parent.path}/${node.slug}`;
      for (const item of previewAtlas.nodes) {
        item.uses = item.uses.map((path) => (path === oldPath ? node.path : path));
      }
    }
  }
  return Promise.resolve({});
}

const previewAtlasHistory = [
  { batchId: "batch-4", at: "2026-09-25T10:00:00.000Z", nodeOps: 3, summary: "Added the agents domain." },
  { batchId: "batch-3", at: "2026-09-18T10:00:00.000Z", nodeOps: 2, summary: "Marked the API component as drifting." },
  { batchId: "batch-2", at: "2026-09-10T10:00:00.000Z", nodeOps: 5, summary: "Split platform into core and CLI." },
  { batchId: "batch-1", at: "2026-09-01T10:00:00.000Z", nodeOps: 8, summary: "Imported the first hierarchy." },
];

const cardSeeds: [slug: string, title: string, stage: string, kind: string, under: string, taskStates: string[]][] = [
  ["clarify-scope", "Clarify project scope", "shape", "feature", "polterware/product/desktop", ["open"]],
  ["agent-handoff", "Agent handoff summary", "shape", "feature", "polterware/agents/mcp", []],
  ["split-api", "Split the API layer", "plan", "architecture", "polterware/platform/api", ["open", "open"]],
  ["event-stream", "Change event stream", "plan", "feature", "polterware/platform/core", ["done", "open"]],
  ["atlas-canvas", "Atlas canvas", "build", "feature", "polterware/product/atlas", ["done", "open", "open"]],
  ["board-view", "Work board", "build", "feature", "polterware/product/desktop", ["done", "done", "open"]],
  ["inbox-actions", "Inbox actions", "build", "feature", "polterware/product/inbox", ["open", "dropped"]],
  ["drift-checks", "Drift checks", "verify", "feature", "polterware/platform/api", ["done", "done"]],
  ["store-baseline", "Store baseline", "verify", "architecture", "polterware/data/store", ["done"]],
  ["core-daemon", "Core daemon lock", "delivered", "feature", "polterware/platform/core", ["done", "done"]],
  ["cli-status", "CLI status command", "delivered", "feature", "polterware/platform/cli", ["done"]],
  ["contracts-gen", "Contract generation", "delivered", "architecture", "polterware/data/contracts", ["done", "done"]],
];

const previewCards = cardSeeds.map(([slug, title, stage, kind, under, taskStates], index) => ({
  id: `card-${slug}`, slug, title, stage, kind, under,
  intent: `${title} so agents and people share one view.`,
  owner: index % 2 === 0 ? "Ada" : "Grace",
  decisions: index % 3 === 0 ? ["ADR 001"] : ["ADR 003"],
  updatedAt: `2026-09-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`,
  tasks: taskStates.map((state, taskIndex) => ({
    id: `task-${slug}-${taskIndex + 1}`, number: taskIndex + 1, title: `Step ${taskIndex + 1} of ${title.toLowerCase()}`,
    state, scope: "backend", claimHolder: state === "open" && taskIndex === 0 ? "agent-1" : "",
  })),
  questions: index % 3 === 1 ? [
    { id: `q-${slug}-1`, text: `Should ${title.toLowerCase()} ship behind a flag?`, blocking: index === 1, options: ["Yes", "No"], state: "open", answer: "" },
    { id: `q-${slug}-2`, text: "Which owner reviews it?", blocking: false, options: ["Ada", "Grace"], state: "answered", answer: "Ada" },
  ] : [],
  invariants: [{ id: `inv-${slug}`, text: "Never persist provider credentials." }],
}));

const inboxItem = (
  id: string, kind: string, blocking: boolean, title: string, detail: string, options: string[],
  where: string, source: string, state: string, actions: string[],
) => ({ id, kind, blocking, title, detail, options, where, source, state, actions });

const previewInboxItems = [
  inboxItem("inb-1", "decision", true, "Ship the event stream behind a flag?", "The card asks for a decision.", ["Yes", "No"], "polterware/platform/core", "card:event-stream", "open", ["decide", "delegate", "defer"]),
  inboxItem("inb-2", "decision", true, "Who reviews agent handoff?", "Owner is unset.", ["Ada", "Grace"], "polterware/agents/mcp", "card:agent-handoff", "open", ["decide", "delegate", "defer"]),
  inboxItem("inb-3", "decision", false, "Keep Markdown intent files?", "ADR 004 is challenged.", ["Keep", "Replace"], "ADR 004", "adr:adr-004", "open", ["decide", "defer", "ignore"]),
  inboxItem("inb-4", "drift", false, "API returns fields not in the contract", "Warning from the last scan.", [], "polterware/platform/api", "drift:api", "open", ["fix_code", "update_intent", "ignore"]),
  inboxItem("inb-5", "drift", false, "Desktop imports a removed module", "Conflict with the atlas.", [], "polterware/product/desktop", "drift:desktop", "deferred", ["fix_code", "update_intent", "defer"]),
  inboxItem("inb-6", "verify", false, "Session cache fact has no evidence", "Attach evidence or reject.", [], "Session cache", "fact:cache", "open", ["verify", "reject"]),
  inboxItem("inb-7", "verify", false, "Web app region is unverified", "No import confirms the region.", [], "Web app", "fact:web", "open", ["verify", "reject"]),
  inboxItem("inb-8", "verify", false, "Staging database has no owner", "Owner fact is missing.", [], "Staging database", "fact:stg-db", "deferred", ["verify", "defer"]),
];

const previewInbox = {
  items: previewInboxItems,
  openCount: previewInboxItems.filter((item) => item.state === "open").length,
  blockingCount: previewInboxItems.filter((item) => item.blocking).length,
};

const provider = (id: string, name: string, category: string, binary: string, authCommands: string[]) => ({
  id, name, category, binary, authCommands, description: `Connect ${name} through its command-line tool.`,
});

const previewProviders = [
  provider("github", "GitHub", "Source Control", "gh", ["gh auth login"]),
  provider("gitlab", "GitLab", "Source Control", "glab", ["glab auth login"]),
  provider("aws", "AWS", "Cloud", "aws", ["aws sso login"]),
  provider("google-cloud", "Google Cloud", "Cloud", "gcloud", ["gcloud auth login"]),
  provider("azure", "Azure", "Cloud", "az", ["az login"]),
  provider("vercel", "Vercel", "Deployment", "vercel", ["vercel login"]),
  provider("supabase", "Supabase", "Databases", "supabase", ["supabase login"]),
  provider("terraform", "Terraform", "Infrastructure", "terraform", ["terraform login"]),
  provider("docker", "Docker", "Infrastructure", "docker", ["docker login"]),
];

const previewConnections = [
  { id: "conn-github", providerId: "github", status: "connected", label: "polterware org", environmentId: "env-local", lastSyncAt: "2026-09-28T08:00:00.000Z", summary: "3 repositories", cliCommand: "gh auth status", syncInterval: "1h", freshness: "fresh", errorMessage: "" },
  { id: "conn-aws", providerId: "aws", status: "error", label: "prod account", environmentId: "env-production", lastSyncAt: "2026-09-20T08:00:00.000Z", summary: "Sync failed", cliCommand: "aws sts get-caller-identity", syncInterval: "6h", freshness: "stale", errorMessage: "The SSO session has expired." },
  { id: "conn-supabase", providerId: "supabase", status: "disconnected", label: "staging project", environmentId: "env-staging", lastSyncAt: "", summary: "Not signed in", cliCommand: "supabase projects list", syncInterval: "", freshness: "unknown", errorMessage: "" },
];

const iResource = (id: string, connectionId: string, name: string, kind: string, externalId: string, environmentId: string, status: string) => ({
  id, connectionId, name, kind, externalId, environmentId, status,
});

const previewIntegrationResources = [
  iResource("ir-1", "conn-github", "polterware/polterware", "repository", "gh-1", "env-local", "active"),
  iResource("ir-2", "conn-github", "polterware/site", "repository", "gh-2", "env-local", "active"),
  iResource("ir-3", "conn-aws", "core-api", "service", "aws-1", "env-production", "active"),
  iResource("ir-4", "conn-aws", "session-cache", "cache", "aws-2", "env-production", "degraded"),
  iResource("ir-5", "conn-aws", "job-queue", "queue", "aws-3", "env-production", "active"),
  iResource("ir-6", "conn-supabase", "staging-db", "database", "sb-1", "env-staging", "unknown"),
];

const previewSyncRuns = [
  { id: "run-1", connectionId: "conn-github", startedAt: "2026-09-28T08:00:00.000Z", finishedAt: "2026-09-28T08:00:12.000Z", result: "success", imported: 3, changed: 1, message: "Imported 3 repositories." },
  { id: "run-2", connectionId: "conn-github", startedAt: "2026-09-27T08:00:00.000Z", finishedAt: "2026-09-27T08:00:09.000Z", result: "partial", imported: 2, changed: 0, message: "One repository was skipped." },
  { id: "run-3", connectionId: "conn-aws", startedAt: "2026-09-20T08:00:00.000Z", finishedAt: "2026-09-20T08:00:03.000Z", result: "failed", imported: 0, changed: 0, message: "The SSO session has expired." },
  { id: "run-4", connectionId: "conn-supabase", startedAt: "2026-09-29T08:00:00.000Z", finishedAt: "", result: "running", imported: 0, changed: 0, message: "Waiting for the CLI." },
];

type ProjectArgs = { projectId?: string } | undefined;

/** Full data for the preview project, an empty value for anything else. */
function scoped<T>(full: T, empty: T): (args?: ProjectArgs) => Promise<T> {
  return async (args) => (args?.projectId === PREVIEW_PROJECT_ID ? full : empty);
}

function byProject<T extends { projectId: string }>(items: T[]): (args?: ProjectArgs) => Promise<T[]> {
  return async (args) => items.filter((item) => item.projectId === args?.projectId);
}

const stoppedCore: CoreStatus = {
  state: "stopped",
  pid: null,
  endpoint: null,
  dbPath: "",
  logPath: "",
  error: null,
};

const stoppedMcp = {
  running: false,
  pid: null,
  dbPath: "",
  command: "",
  cursorConfig: "",
};

function unsubscribe(): void {}

function emptyResult(): Promise<Record<string, never>> {
  return Promise.resolve({});
}

/** Nested calls resolve to an empty object unless a method is overridden. */
function browserDevApi(overrides?: Record<string, unknown>): (...args: unknown[]) => Promise<Record<string, never>> {
  function browserDevCall(): Promise<Record<string, never>> {
    return emptyResult();
  }
  if (overrides) Object.assign(browserDevCall, overrides);
  return new Proxy(browserDevCall, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      if (typeof property !== "string") return undefined;
      return browserDevApi();
    },
  });
}

function createBrowserDevBridge(): PolterwareBridge {
  const appearance = { version: 1, reduceTransparency: true as const };
  const shortcuts = { version: 1, overrides: {} as Record<string, string> };

  return {
    app: browserDevApi({
      getShortcutPreferences: async () => shortcuts,
      setShortcutPreferences: async (overrides: Record<string, string>) => ({
        version: 1,
        overrides,
      }),
      getAppearancePreferences: async () => appearance,
      setAppearancePreferences: async (preferences: { reduceTransparency: boolean }) => ({
        version: 1,
        reduceTransparency: preferences.reduceTransparency,
      }),
      getQuitPreferences: async () => emptyQuitPreferences(),
      setQuitPreferences: async (preferences: {
        confirmOnQuit?: boolean;
        quitAction?: "keep" | "stop";
      }) => ({ ...emptyQuitPreferences(), ...preferences }),
      getMcpStatus: async () => stoppedMcp,
      startMcp: async () => stoppedMcp,
      stopMcp: async () => stoppedMcp,
      getCorePreferences: async () => emptyCorePreferences(),
      setCorePreferences: async (preferences: {
        idle?: "never" | "10m" | "30m" | "1h";
        autoStart?: boolean;
      }) => ({ ...emptyCorePreferences(), ...preferences }),
      getCoreStatus: async () => stoppedCore,
      startCore: async () => stoppedCore,
      stopCore: async () => stoppedCore,
      restartCore: async () => stoppedCore,
      selectDirectory: async () => ({ path: null }),
    }),
    commander: browserDevApi({
      onFocusSearch: () => unsubscribe,
      onExecuteCommand: () => unsubscribe,
    }),
    core: browserDevApi({
      onStatusChange: () => unsubscribe,
      onChange: () => unsubscribe,
      projects: browserDevApi({
        list: async () => ({ projects: previewProjects }),
        listEnvironments: async (args?: ProjectArgs) => ({
          environments: await byProject(previewEnvironments)(args),
        }),
        getSettings: async (args?: ProjectArgs) => ({
          settings: previewSettings.find((item) => item.projectId === args?.projectId) ?? previewSettings[1],
        }),
        listRepos: scoped({ repos: previewRepos }, { repos: [] }),
      }),
      architecture: browserDevApi({
        listViews: scoped({ views: previewViews }, { views: [] }),
        getLayout: async (args?: ProjectArgs) =>
          args?.projectId === PREVIEW_PROJECT_ID
            ? { layout: { ...previewLayoutState } }
            : { layout: { bodyJson: "{}", revision: 0 } },
        updateLayout: async (args?: ProjectArgs & { bodyJson?: string }) => {
          if (args?.projectId === PREVIEW_PROJECT_ID && args.bodyJson) {
            previewLayoutState.bodyJson = args.bodyJson;
            previewLayoutState.revision += 1;
          }
          return { layout: { ...previewLayoutState } };
        },
      }),
      knowledge: browserDevApi({
        list: scoped({ items: previewKnowledge }, { items: [] }),
        listLinks: scoped({ links: previewLinks }, { links: [] }),
      }),
      ppm: browserDevApi({
        listEntities: scoped({ entities: previewEntities }, { entities: [] }),
      }),
      work: browserDevApi({
        listCards: scoped({ cards: previewCards }, { cards: [] }),
        listInbox: scoped(previewInbox, { items: [], openCount: 0, blockingCount: 0 }),
        listAtlas: scoped(previewAtlas, { nodes: [], driftSlugs: [], historical: false }),
        apply: applyPreviewPolter,
        listAtlasHistory: scoped({ entries: previewAtlasHistory }, { entries: [] }),
      }),
      integrations: browserDevApi({
        listProviders: async () => ({ providers: previewProviders }),
        listConnections: scoped({ connections: previewConnections }, { connections: [] }),
        listResources: scoped({ resources: previewIntegrationResources }, { resources: [] }),
        listSyncRuns: scoped({ runs: previewSyncRuns }, { runs: [] }),
      }),
      health: browserDevApi({
        getStoreHealth: async () => ({ quarantined: false, message: "" }),
      }),
    }),
  } as unknown as PolterwareBridge;
}

/** Installs the in-memory preview bridge when Electron preload did not. Returns false if one already exists. */
export function installBrowserDevBridge(): boolean {
  if (window.polterware) return false;
  window.polterware = createBrowserDevBridge();
  return true;
}
