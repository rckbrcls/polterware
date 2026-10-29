import { createBrowserStructure } from "./browser-dev-structure";
import type { PolterwareBridge } from "../preload/bridge.js";
import { createBrowserCanvas } from "./browser-dev-canvas";
import { emptyCorePreferences } from "../shared/core-preferences.js";
import type { CoreStatus } from "../shared/core-status.js";
import { emptyQuitPreferences } from "../shared/quit-preferences.js";

const PREVIEW_PROJECT_ID = "browser-preview";
const EMPTY_PROJECT_ID = "browser-empty";

const previewProjects = [
  {
    id: PREVIEW_PROJECT_ID,
    name: "Browser preview",
    rootPath: "/preview",
    description: "Sample project with data in every surface.",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
  },
  {
    id: EMPTY_PROJECT_ID,
    name: "Empty project",
    rootPath: "/empty",
    description: "",
    status: "active",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
];

const previewEnvironments = [
  { id: "env-local", name: "Local", kind: "local", projectId: PREVIEW_PROJECT_ID, protection: "standard", isDefault: true, description: "Developer machine." },
  { id: "env-staging", name: "Staging", kind: "staging", projectId: PREVIEW_PROJECT_ID, protection: "relaxed", isDefault: false, description: "Pre-production checks." },
  { id: "env-production", name: "Production", kind: "production", projectId: PREVIEW_PROJECT_ID, protection: "strict", isDefault: false, description: "Customer-facing systems." },
  { id: "env-empty-local", name: "Local", kind: "local", projectId: EMPTY_PROJECT_ID, protection: "standard", isDefault: true, description: "" },
];

const previewSettings = [
  { projectId: PREVIEW_PROJECT_ID, description: "Sample project with data in every surface.", defaultEnvironmentId: "env-local", repository: "polterware", agentsSync: false },
  { projectId: EMPTY_PROJECT_ID, description: "", defaultEnvironmentId: "env-empty-local", repository: "", agentsSync: false },
];

const previewRepos = [
  { id: "repo-core", name: "polterware", path: "/preview/repos/polterware" },
  { id: "repo-web", name: "polterware-web", path: "/preview/repos/polterware-web" },
];

const knowledgeItem = (
  id: string, kind: string, title: string, summary: string, body: string, owner: string,
  status: string, tags: string[], updatedAt: string, extra: Record<string, unknown> = {},
) => {
  const doc = kind === "doc" || kind === "runbook" || kind === "source";
  return {
    id, kind: doc ? "doc" : kind, docType: doc ? kind : "", title, summary, body, owner, status,
    tags, updatedAt, extraJson: JSON.stringify(extra),
  };
};

const decisionExtra = (statusReason: string, reviewTrigger: string, supersededBy = "") => ({ supersededBy, reviewTrigger, statusReason });

const previewKnowledge = [
  knowledgeItem("decision-principle-local", "decision", "Local-first truth", "One SQLite database per project.",
    "## Decision\n\nProject state must stay useful on one machine without a hosted account.", "Platform", "active", [], "2026-09-01T09:00:00.000Z",
    { level: "principle" }),
  knowledgeItem("decision-principle-evidence", "decision", "Evidence over opinion", "Observed facts win over inferred ones.",
    "## Decision\n\nDeclared and observed facts take precedence over inferred knowledge.", "Platform", "active", [], "2026-09-01T09:00:00.000Z",
    { level: "principle" }),
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
  knowledgeItem("decision-001", "decision", "Decision 001: Single local core", "One process opens the database.", "## Decision\n\nOnly the core opens SQLite.\n\n## Consequence\n\nClients attach over a local socket.", "Platform", "active", ["storage"], "2026-08-01T09:00:00.000Z",
    decisionExtra("Still the simplest safe model.", "Revisit if cloud sync ships.")),
  knowledgeItem("decision-002", "decision", "Decision 002: Poll for changes", "Clients poll for updates.", "## Decision\n\nClients poll every few seconds.", "Platform", "superseded", ["sync"], "2026-08-05T09:00:00.000Z",
    decisionExtra("Replaced by push events.", "None.", "decision-003")),
  knowledgeItem("decision-003", "decision", "Decision 003: Push change events", "The core pushes change events.", "## Decision\n\nThe core streams change events to clients.", "Platform", "active", ["sync"], "2026-08-10T09:00:00.000Z",
    decisionExtra("Lower latency than polling.", "Revisit if event volume grows.")),
  knowledgeItem("decision-004", "decision", "Decision 004: Markdown intent files", "Intent lives in Polter text.", "## Decision\n\nWork cards are written as Polter text.", "Product", "challenged", ["format"], "2026-08-15T09:00:00.000Z",
    decisionExtra("Two teams report friction with the grammar.", "Review after the next format release.")),
  knowledgeItem("decision-005", "decision", "Decision 005: Signed evidence", "Evidence should be signed.", "## Decision\n\nProposal to sign imported evidence.", "Security", "proposed", ["security"], "2026-08-20T09:00:00.000Z",
    decisionExtra("Awaiting review.", "Decide before the public beta.")),
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

type StructureSeed = [id: string, parentId: string, level: "system" | "domain" | "component", slug: string, path: string, title: string, status: "proposed" | "in_progress" | "delivered" | "drift", decisions: string[], childCount: number, featureCount: number, openQuestions: number, folder: string];

const structureSeeds: StructureSeed[] = [
  ["n-sys", "", "system", "polterware", "polterware", "Polterware", "in_progress", [], 4, 0, 0, ""],
  ["n-platform", "n-sys", "domain", "platform", "polterware/platform", "Platform", "in_progress", [], 3, 1, 0, "backend"],
  ["n-product", "n-sys", "domain", "product", "polterware/product", "Product", "in_progress", [], 3, 2, 1, "apps"],
  ["n-data", "n-sys", "domain", "data", "polterware/data", "Data", "delivered", [], 2, 1, 0, "schemas"],
  ["n-agents", "n-sys", "domain", "agents", "polterware/agents", "Agents", "proposed", [], 2, 0, 1, "plugins"],
  ["comp-core", "n-platform", "component", "core", "polterware/platform/core", "Core", "delivered", ["Decision 001", "Decision 003"], 0, 2, 0, "backend/runtimes"],
  ["comp-cli", "n-platform", "component", "cli", "polterware/platform/cli", "CLI", "delivered", [], 0, 1, 0, "backend/cli"],
  ["comp-api", "n-platform", "component", "api", "polterware/platform/api", "API", "drift", ["Decision 003"], 0, 1, 1, "backend/api"],
  ["comp-desktop", "n-product", "component", "desktop", "polterware/product/desktop", "Desktop", "in_progress", [], 0, 3, 1, "apps/polterware-desktop"],
  ["comp-structure", "n-product", "component", "structure", "polterware/product/structure", "Structure", "in_progress", ["Decision 004"], 0, 2, 0, "packages/features/structure"],
  ["comp-inbox", "n-product", "component", "inbox", "polterware/product/inbox", "Inbox", "delivered", [], 0, 1, 0, "packages/features/inbox"],
  ["comp-store", "n-data", "component", "store", "polterware/data/store", "Store", "delivered", ["Decision 001"], 0, 1, 0, "backend/store"],
  ["comp-contracts", "n-data", "component", "contracts", "polterware/data/contracts", "Contracts", "delivered", [], 0, 0, 0, "schemas"],
  ["comp-mcp", "n-agents", "component", "mcp", "polterware/agents/mcp", "MCP bridge", "proposed", ["Decision 005"], 0, 1, 1, "backend/mcp"],
  ["comp-plugin", "n-agents", "component", "plugin", "polterware/agents/plugin", "Agent plugin", "proposed", [], 0, 0, 0, "plugins/polterware"],
];

/** Component kind and technology per node id; the plugin leaves its technology empty. */
const previewKindTech: Record<string, [kind: string, tech: string]> = {
  "comp-core": ["service", "Go"],
  "comp-cli": ["cli", "Go"],
  "comp-api": ["api", "ConnectRPC"],
  "comp-desktop": ["desktop", "Electron"],
  "comp-structure": ["frontend", "Solid"],
  "comp-inbox": ["frontend", "Solid"],
  "comp-store": ["database", "SQLite"],
  "comp-contracts": ["spec", "Protobuf"],
  "comp-mcp": ["mcp", "Go"],
  "comp-plugin": ["agent", ""],
};

/** `uses:` per node id: the node paths it depends on. The map draws them as edges. */
const previewUses: Record<string, string[]> = {
  "comp-cli": ["polterware/platform/core"],
  "comp-api": ["polterware/platform/core", "polterware/data/store"],
  "comp-desktop": ["polterware/platform/api", "polterware/product/inbox"],
  "comp-structure": ["polterware/platform/core"],
  "comp-mcp": ["polterware/platform/core", "polterware/data/contracts"],
  "comp-plugin": ["polterware/agents/mcp"],
};

const previewStructure = {
  nodes: structureSeeds.map(([id, parentId, level, slug, path, title, status, decisions, childCount, featureCount, openQuestions, folder]) => ({
    id, parentId, level, slug, path, title, status, decisions, childCount, featureCount, openQuestions, folder,
    uses: previewUses[id] ?? [],
    kind: previewKindTech[id]?.[0] ?? "",
    tech: previewKindTech[id]?.[1] ?? "",
    intent: `${title} keeps its part of the system coherent.`,
    invariants: level === "component" ? [{ id: `inv-${slug}`, text: `${title} never writes outside its own folder.` }] : [],
    repo: level === "component" ? "polterware" : "",
  })),
  driftSlugs: ["api"],
  historical: false,
};

const promotedCards = new Map<string, Record<string, unknown>[]>();
const promotedFacts = new Map<string, Record<string, unknown>[]>();
const promotedDecisions = new Map<string, Record<string, unknown>[]>();

/**
 * Enough of `work.apply` for canvas promotions and the Structure map: a node block that moves it (under:)
 * or replaces its uses:. Everything else is ignored, like the rest of this bridge.
 */
async function applyPreviewPolter(args?: { projectId?: string; text?: string; dryRun?: boolean; change?: { summary?: string } }): Promise<Record<string, unknown>> {
  const projectId = args?.projectId ?? "";
  if (![PREVIEW_PROJECT_ID, "browser-empty"].includes(projectId)) throw new Error("Project not found.");
  const text = args?.text ?? "";
  const card = /^## ([a-z0-9]+(?:-[a-z0-9]+)*): (.+)$/m.exec(text);
  const decision = /^### new: (.+)$/m.exec(text);
  const fact = /^#### ([a-z0-9]+(?:-[a-z0-9]+)*): (.+)$/m.exec(text);
  if (card || decision || fact) {
    // Canvas promotions carry the reason in the text; Desktop writes send it as the change envelope.
    const justified = Boolean(args?.change?.summary?.trim()) || /^summary: .+$/m.test(text) && /^rationale: .+$/m.test(text);
    if (!/^polter: 1$/m.test(text) || !justified) throw new Error("Promotion needs Polter v1, summary and rationale.");
    const id = `promoted-${crypto.randomUUID()}`;
    const title = (card?.[2] ?? fact?.[2] ?? decision?.[1] ?? "").trim();
    if (card) {
      const cards = [...(projectId === PREVIEW_PROJECT_ID ? previewCards : []), ...(promotedCards.get(projectId) ?? [])];
      if (cards.some((item) => item.slug === card[1])) throw new Error("That Work card slug already exists.");
      // The meta line follows the heading; the lines after it are the intent.
      const [, meta = "", ...rest] = text.slice(card.index).split("\n");
      const value = (key: string) => new RegExp(`(?:^|· )${key}: ([^·]+?)(?: ·|$)`).exec(meta)?.[1]?.trim() ?? "";
      const stage = value("stage") || "shape";
      if (args?.dryRun) return { applied: false, diagnostics: [], ops: [`+ card ${card[1]} ${JSON.stringify(title)} [${stage}]`] };
      promotedCards.set(projectId, [...(promotedCards.get(projectId) ?? []), { id, projectId, slug: card[1], title, stage, status: "active", kind: value("kind") || "feature", intent: rest.join("\n").trim(), owner: "", under: value("under"), decisions: [], tasks: [], questions: [], invariants: [], updatedAt: new Date().toISOString() }]);
      return { applied: true, diagnostics: [], ops: [`+ card ${card[1]} ${JSON.stringify(title)} [${stage}]`] };
    }
    if (fact) {
      const facts = promotedFacts.get(projectId) ?? [];
      if (facts.some((item) => item.slug === fact[1])) return { applied: false, diagnostics: [], ops: [] };
      if (!/^kind: declared$/m.test(text)) throw new Error("Canvas Facts start Declared.");
      if (args?.dryRun) return { applied: false, diagnostics: [], ops: [`+ fact ${id} ${JSON.stringify(title)}`] };
      promotedFacts.set(projectId, [...facts, { id, projectId, slug: fact[1], statement: title, truthClass: "declared", source: "polter", actor: "human", entityId: "", observedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
      return { applied: true, diagnostics: [], ops: [`+ fact ${id} ${JSON.stringify(title)}`] };
    }
    if (!/^status: proposed$/m.test(text)) throw new Error("Canvas Decisions start Proposed.");
    const decisions = [...(projectId === PREVIEW_PROJECT_ID ? previewKnowledge : []), ...(promotedDecisions.get(projectId) ?? [])];
    const number = 1 + Math.max(0, ...decisions.map((item) => Number(/Decision[ -]0*(\d+)/i.exec(String(item.title))?.[1] ?? 0)));
    const assigned = `Decision ${String(number).padStart(4, "0")}: ${title}`;
    if (args?.dryRun) return { applied: false, diagnostics: [], ops: [`+ decision ${assigned} ${JSON.stringify(assigned)}`] };
    promotedDecisions.set(projectId, [...(promotedDecisions.get(projectId) ?? []), { id, projectId, kind: "decision", title: assigned, summary: "", bodyMarkdown: "", status: "proposed", extraJson: "{}", tags: [], updatedAt: new Date().toISOString() }]);
    return { applied: true, diagnostics: [], ops: [`+ decision ${assigned} ${JSON.stringify(assigned)}`] };
  }
  throw new Error("Unsupported Polter input.");
}

const previewStructureHistory = [
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
  ["structure-canvas", "Structure canvas", "build", "feature", "polterware/product/structure", ["done", "open", "open"]],
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
  decisions: index % 3 === 0 ? ["Decision 001"] : ["Decision 003"],
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
  inboxItem("inb-3", "decision", false, "Keep Markdown intent files?", "Decision 004 is challenged.", ["Keep", "Replace"], "Decision 004", "decision:decision-004", "open", ["decide", "defer", "ignore"]),
  inboxItem("inb-4", "drift", false, "API returns fields not in the contract", "Warning from the last scan.", [], "polterware/platform/api", "drift:api", "open", ["fix_code", "update_intent", "ignore"]),
  inboxItem("inb-5", "drift", false, "Desktop imports a removed module", "Conflict with the structure.", [], "polterware/product/desktop", "drift:desktop", "deferred", ["fix_code", "update_intent", "defer"]),
  inboxItem("inb-6", "verify", false, "Session cache fact has no evidence", "Attach evidence or reject.", [], "Session cache", "fact:cache", "open", ["verify", "reject"]),
  inboxItem("inb-7", "verify", false, "Web app region is unverified", "No import confirms the region.", [], "Web app", "fact:web", "open", ["verify", "reject"]),
  inboxItem("inb-8", "verify", false, "Staging database has no owner", "Owner fact is missing.", [], "Staging database", "fact:stg-db", "deferred", ["verify", "defer"]),
];


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

const previewFactSeeds: [id: string, statement: string, truthClass: string, entityId: string, source: string, actor: string, evidence: string[]][] = [
  ["fact-core-sqlite", "The core is the only process that opens SQLite.", "verified", "ent-core", "import", "agent", ["cev-lock", "cev-schema"]],
  ["fact-cli-binary", "The CLI ships as the single polterware binary.", "verified", "ent-cli", "import", "agent", ["cev-build"]],
  ["fact-api-contract", "The API returns only fields declared in the contract.", "declared", "ent-api", "desktop", "human", []],
  ["fact-api-drift", "The API returns two undeclared fields on /status.", "observed", "ent-api", "drift-scan", "agent", ["cev-scan"]],
  ["fact-store-baseline", "One clean SQLite baseline, no migration from older databases.", "declared", "ent-store", "desktop", "human", ["cev-schema"]],
  ["fact-store-fts", "Knowledge search is backed by an FTS5 index.", "inferred", "ent-store", "import", "agent", []],
  ["fact-core-idle", "The core stops itself after the configured idle time.", "observed", "ent-core", "git", "agent", ["cev-commit"]],
];

const previewCanonEvidenceSeeds: [id: string, kind: string, summary: string, path: string][] = [
  ["cev-lock", "file", "Daemon lock guards the database path.", "backend/runtimes/cli/serve.go"],
  ["cev-schema", "file", "Single baseline schema.", "backend/platform/db/sqlite/migrations/0001_baseline.sql"],
  ["cev-build", "test", "Binary build passes in CI.", ".github/workflows/ci.yml"],
  ["cev-scan", "scan", "Drift scan found undeclared fields.", "docs/openapi.yaml"],
  ["cev-commit", "commit", "Idle shutdown landed in 3f9a2c1.", "backend/runtimes/cli/idle.go"],
];

const previewCanonEvidence = previewCanonEvidenceSeeds.map(([id, kind, summary, path]) => ({
  id, projectId: PREVIEW_PROJECT_ID, kind, summary, source: "import", path, actor: "agent",
  observedAt: "2026-09-20T09:00:00.000Z", createdAt: "2026-09-20T09:00:00.000Z", updatedAt: "2026-09-20T09:00:00.000Z",
}));

const previewFacts = previewFactSeeds.map(([id, statement, truthClass, entityId, source, actor], index) => ({
  id, projectId: PREVIEW_PROJECT_ID, statement, truthClass, entityId, source, actor,
  // Each fact is scoped to the Structure component its subject stands for.
  scopeNodeId: previewEntities.find((item) => item.id === entityId)?.refId ?? "",
  observedAt: `2026-09-${String(12 + index).padStart(2, "0")}T09:00:00.000Z`,
  createdAt: `2026-09-${String(12 + index).padStart(2, "0")}T09:00:00.000Z`,
  updatedAt: `2026-09-${String(12 + index).padStart(2, "0")}T09:00:00.000Z`,
}));

const previewRunSeeds: [id: string, actorKind: string, label: string, task: string, status: string, steps: [kind: string, summary: string, subjects?: string[]][]][] = [
  ["run-1", "agent", "claude-code", "Import project sources", "completed", [["import", "Registered 14 sources from the project root."], ["fact", "Added fact: The core is the only process that opens SQLite."]]],
  ["run-2", "agent", "codex", "Split the API layer", "completed", [["work", "Moved card Split the API layer to Plan.", ["card-split-api"]], ["decision", "Proposed decision: Poll for changes."]]],
  ["run-3", "human", "Ada", "Review drift findings", "completed", [["drift", "Marked API drift as update intent."]]],
  ["run-4", "agent", "claude-code", "Verify session cache", "failed", [["fact", "Could not attach evidence: no matching file."]]],
  ["run-5", "human", "Grace", "Link runbook to Core", "completed", [["link", "Linked Deploy runbook to the Core component."]]],
  ["run-6", "human", "Ada", "Pin the local-first principle", "completed", [["decision", "Pinned Local-first truth as a principle.", ["decision-principle-local"]], ["work", "Added a task to Split the API layer.", ["card-split-api"]]]],
];

/** When a preview run happened: one a day from 20 September, and the last one this morning, so Activity shows Today. */
function previewRunTime(index: number, minute: number): string {
  if (index === previewRunSeeds.length - 1) {
    const today = new Date();
    today.setHours(9, minute, 0, 0);
    return today.toISOString();
  }
  return `2026-09-${String(20 + index).padStart(2, "0")}T10:${String(minute).padStart(2, "0")}:00.000Z`;
}

const previewRuns = previewRunSeeds.map(([id, actorKind, agentLabel, task, status], index) => ({
  id, projectId: PREVIEW_PROJECT_ID, task, agentLabel, actorKind, status,
  createdAt: previewRunTime(index, 0),
  completedAt: previewRunTime(index, 5),
}));

const previewRunSteps = previewRunSeeds.flatMap(([runId, , , , , steps], runIndex) =>
  steps.map(([kind, summary, subjects], stepIndex) => ({
    id: `${runId}-step-${stepIndex + 1}`, agentRunId: runId, kind, summary,
    payloadJson: JSON.stringify({ kind, summary, ...(subjects ? { subject_ids: subjects } : {}) }),
    createdAt: previewRunTime(runIndex, stepIndex + 1),
  })),
);

const previewChanges = previewRunSteps.map((step) => {
  const run = previewRuns.find((item) => item.id === step.agentRunId)!;
  return {
    stepId: step.id, agentRunId: run.id, projectId: PREVIEW_PROJECT_ID, actorKind: run.actorKind, agentLabel: run.agentLabel,
    runStatus: run.status, runTask: run.task, summary: step.summary, payloadJson: step.payloadJson, createdAt: step.createdAt,
  };
}).reverse();

/** What each preview run's agent answered, with the Markdown agents write. */
const previewDispatchOutputs: Record<string, string> = {
  "drun-1": [
    "## Summary",
    "",
    "Added the dispatch RPC handlers and wired them to the core. **All checks pass.**",
    "",
    "### Changes",
    "",
    "1. `backend/domains/dispatch/rpc.go`: new `VerifyRun` and `MergeRun` handlers.",
    "2. `schemas/polterware/local/v1/dispatch.proto`: request and response messages.",
    "3. Tests for both handlers, including the *conflict* path.",
    "",
    "```go",
    "func (s *Server) MergeRun(ctx context.Context, req *MergeRunRequest) (*MergeRunResponse, error) {",
    "\treturn s.merge(ctx, req.GetId())",
    "}",
    "```",
    "",
    "> The merge keeps the worktree until `polterware clean` runs.",
    "[verified] go test ./backend/... passed",
    "[merged] dispatch/drun-1 into main",
  ].join("\n"),
  "drun-2": [
    "## What I did",
    "",
    "- Moved the layout serializer into `structure/layout.go`.",
    "- Kept the JSON field order stable for the golden files.",
    "",
    "## What failed",
    "",
    "`go vet` reported an unused import in `structure/layout_test.go`.",
    "[failed] go vet reported an unused import",
  ].join("\n"),
};

/** What the core replays from `watchRun` for a preview run: the CLI's JSONL stream and its own events. */
const previewDispatchStreams: Record<string, { kind: string; text: string }[]> = {
  "drun-1": [
    {
      kind: "output",
      text: [
        { type: "thread.started", thread_id: "019a-preview" },
        { type: "turn.started" },
        { type: "item.completed", item: { id: "item_0", type: "reasoning", text: "**Locating the dispatch RPC surface**" } },
        { type: "item.completed", item: { id: "item_1", type: "command_execution", command: "rg -n \"VerifyRun|MergeRun\" backend", exit_code: 0 } },
        { type: "item.completed", item: { id: "item_2", type: "file_change", changes: [{ path: "backend/domains/dispatch/rpc.go", kind: "update" }, { path: "schemas/polterware/local/v1/dispatch.proto", kind: "update" }] } },
        { type: "item.completed", item: { id: "item_3", type: "command_execution", command: "go test ./backend/domains/dispatch/...", exit_code: 0 } },
        { type: "item.completed", item: { id: "item_4", type: "agent_message", text: (previewDispatchOutputs["drun-1"] ?? "").split("\n[")[0] } },
        { type: "turn.completed", usage: { input_tokens: 18240, output_tokens: 1210 } },
      ].map((event) => JSON.stringify(event)).join("\n") + "\n",
    },
    { kind: "verified", text: "go test ./backend/... passed" },
    { kind: "merged", text: "dispatch/drun-1 into main" },
  ],
};

const previewDispatchRuns = [
  {
    id: "drun-1",
    projectId: PREVIEW_PROJECT_ID,
    status: "completed",
    tier: "normal",
    agent: "codex",
    model: "gpt-5-codex",
    provider: "openai",
    effort: "medium",
    prompt: "Add dispatch RPC handlers",
    cardSlug: "event-stream",
    agentRunId: "",
    dir: ".",
    repo: "polterware",
    worktree: "/preview/worktrees/drun-1",
    branch: "dispatch/drun-1",
    baseSha: "a1b2c3d",
    readOnly: false,
    verification: "passed",
    exitCode: 0,
    exitClass: "ok",
    error: "",
    note: "Verified and merged cleanly.",
    filesChanged: 4,
    insertions: 120,
    deletions: 12,
    createdAt: "2026-09-25T11:00:00.000Z",
    startedAt: "2026-09-25T11:00:05.000Z",
    finishedAt: "2026-09-25T11:02:10.000Z",
    mergedAt: "2026-09-25T11:02:30.000Z",
    mergeSha: "f4e5d6c",
  },
  {
    id: "drun-2",
    projectId: PREVIEW_PROJECT_ID,
    status: "failed",
    tier: "hard",
    agent: "grok",
    model: "grok-4.7",
    provider: "xai",
    effort: "high",
    prompt: "Refactor the Structure layout serializer",
    cardSlug: "structure-canvas",
    agentRunId: "",
    dir: ".",
    repo: "polterware",
    worktree: "/preview/worktrees/drun-2",
    branch: "dispatch/drun-2",
    baseSha: "a1b2c3d",
    readOnly: false,
    verification: "failed",
    exitCode: 1,
    exitClass: "verification_failed",
    error: "go vet reported an unused import",
    note: "",
    filesChanged: 2,
    insertions: 48,
    deletions: 19,
    createdAt: "2026-09-26T09:10:00.000Z",
    startedAt: "2026-09-26T09:10:04.000Z",
    finishedAt: "2026-09-26T09:14:20.000Z",
    mergedAt: "",
    mergeSha: "",
  },
];

const previewDispatchWorktrees = [
  {
    id: "wt-1",
    projectId: PREVIEW_PROJECT_ID,
    runId: "drun-1",
    cardSlug: "event-stream",
    path: "/preview/worktrees/drun-1",
    branch: "dispatch/drun-1",
    baseSha: "a1b2c3d",
    status: "merged",
    owner: "codex",
  },
  {
    id: "wt-2",
    projectId: PREVIEW_PROJECT_ID,
    runId: "drun-2",
    cardSlug: "structure-canvas",
    path: "/preview/worktrees/drun-2",
    branch: "dispatch/drun-2",
    baseSha: "a1b2c3d",
    status: "active",
    owner: "grok",
  },
];

const previewDispatchQuota = [
  {
    agent: "codex",
    provider: "openai",
    window: "5h",
    source: "probe",
    confidence: "high",
    usedPercent: 42.5,
    windowMinutes: 300,
    resetsAt: "2026-09-26T14:00:00.000Z",
    sampledAt: "2026-09-26T10:00:00.000Z",
  },
  {
    agent: "grok",
    provider: "xai",
    window: "5h",
    source: "ledger",
    confidence: "low",
    windowMinutes: 300,
    resetsAt: "",
    sampledAt: "2026-09-26T10:00:00.000Z",
  },
];

type PreviewDispatchTier = { name: string; provider: string; agent: string; model: string; speed: number; strength: number; position: number };

let previewDispatchTiers: PreviewDispatchTier[] = [
  { name: "easy", provider: "openai", agent: "codex", model: "gpt-5-codex-mini", speed: 5, strength: 2, position: 0 },
  { name: "easy", provider: "xai", agent: "grok", model: "grok-4.7-build-fast", speed: 4, strength: 2, position: 1 },
  { name: "normal", provider: "openai", agent: "codex", model: "gpt-5-codex", speed: 4, strength: 3, position: 0 },
  { name: "normal", provider: "xai", agent: "grok", model: "grok-4.7", speed: 2, strength: 3, position: 1 },
  { name: "hard", provider: "xai", agent: "grok", model: "grok-4.7", speed: 2, strength: 5, position: 0 },
];

const previewDispatchModels = [
  { agent: "codex", model: "gpt-5-codex-mini", provider: "openai", tier: "easy" },
  { agent: "codex", model: "gpt-5-codex", provider: "openai", tier: "normal" },
  { agent: "codex", model: "gpt-6.1-sol", provider: "openai", tier: "hard" },
  { agent: "grok", model: "grok-4.7-build-fast", provider: "xai", tier: "easy" },
  { agent: "grok", model: "grok-4.7", provider: "xai", tier: "normal" },
];

const previewDispatchAgents = [
  {
    name: "codex",
    bin: "codex",
    provider: "openai",
    quotaSource: "probe",
    confidence: "high",
    risk: "low",
    usedPercent: 42.5,
    cooldownUntil: "",
  },
  {
    name: "grok",
    bin: "grok",
    provider: "xai",
    quotaSource: "ledger",
    confidence: "low",
    risk: "medium",
    cooldownUntil: "",
  },
];

const previewDispatchHistory = [
  {
    id: "devt-1",
    runId: "drun-1",
    projectId: PREVIEW_PROJECT_ID,
    kind: "started",
    agent: "codex",
    tier: "normal",
    text: "Started dispatch run drun-1 on event-stream",
    seq: 1,
    at: "2026-09-25T11:00:05.000Z",
  },
  {
    id: "devt-2",
    runId: "drun-1",
    projectId: PREVIEW_PROJECT_ID,
    kind: "verified",
    agent: "codex",
    tier: "normal",
    text: "Verification passed for drun-1",
    seq: 2,
    at: "2026-09-25T11:02:10.000Z",
  },
  {
    id: "devt-3",
    runId: "drun-1",
    projectId: PREVIEW_PROJECT_ID,
    kind: "merged",
    agent: "codex",
    tier: "normal",
    text: "Merged dispatch/drun-1 at f4e5d6c",
    seq: 3,
    at: "2026-09-25T11:02:30.000Z",
  },
  {
    id: "devt-4",
    runId: "drun-2",
    projectId: PREVIEW_PROJECT_ID,
    kind: "failed",
    agent: "grok",
    tier: "hard",
    text: "go vet reported an unused import",
    seq: 4,
    at: "2026-09-26T09:14:20.000Z",
  },
];

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
  const structure = createBrowserStructure(PREVIEW_PROJECT_ID, previewStructure.nodes);
  const structureCards = structuredClone(previewCards);
  // Inbox actions on the preview seed: defer marks an item deferred, the others clear it.
  const inboxItems = structuredClone(previewInboxItems);
  function inboxFor(projectId: string) {
    if (projectId !== PREVIEW_PROJECT_ID) return { items: [], openCount: 0, blockingCount: 0 };
    return {
      items: inboxItems,
      openCount: inboxItems.filter((item) => item.state === "open").length,
      blockingCount: inboxItems.filter((item) => item.blocking).length,
    };
  }
  // Archived and deleted knowledge ids; the seed itself stays untouched.
  const archivedKnowledge = new Map<string, string>();
  const deletedKnowledge = new Set<string>();
  // Saved items override the seed by id; new ids are appended.
  const savedKnowledge = new Map<string, Record<string, unknown>>();
  function knowledgeFor(projectId: string) {
    const seed = [...(projectId === PREVIEW_PROJECT_ID ? previewKnowledge : []), ...(promotedDecisions.get(projectId) ?? [])]
      .map((item) => savedKnowledge.get(String(item.id)) ?? item);
    const added = [...savedKnowledge.values()]
      .filter((item) => item.projectId === projectId && !seed.some((entry) => entry.id === item.id));
    return [...seed, ...added];
  }
  function knowledgeById(id?: string) {
    return savedKnowledge.get(id ?? "") ?? previewKnowledge.find((entry) => entry.id === id);
  }
  // Seeded milestones; mutations live only in this bridge instance, like the core:
  // archiving moves the milestone's cards back to the Backlog.
  type PreviewMilestone = {
    id: string; projectId: string; slug: string; name: string; goal: string; exitCriteria: string[]; targetDate: string;
    state: "planned" | "active" | "done"; position: number; archivedAt: string; createdAt: string; updatedAt: string;
  };
  const milestones: PreviewMilestone[] = [
    { slug: "beta", name: "Beta", goal: "People outside the team run Polterware on their own projects.", exitCriteria: ["Five external projects imported", "No open blocking questions"], targetDate: "2026-11-30", state: "active" as const },
    { slug: "launch", name: "Launch", goal: "", exitCriteria: [], targetDate: "", state: "planned" as const },
  ].map((item, position) => ({
    ...item, id: `preview-milestone-${item.slug}`, projectId: PREVIEW_PROJECT_ID, position, archivedAt: "",
    createdAt: "2026-09-20T12:00:00.000Z", updatedAt: "2026-09-20T12:00:00.000Z",
  }));
  const seedMilestone: Record<string, string> = {
    "board-view": "beta", "inbox-actions": "beta", "drift-checks": "beta", "store-baseline": "beta", "core-daemon": "beta",
    "structure-canvas": "launch", "agent-handoff": "launch",
  };
  for (const card of structureCards) (card as { milestoneId?: string }).milestoneId = seedMilestone[card.slug] ? `preview-milestone-${seedMilestone[card.slug]}` : "";
  let nextMilestone = milestones.length;
  function listedMilestones(projectId: string) {
    return milestones.filter((item) => item.projectId === projectId && !item.archivedAt).sort((a, b) => a.position - b.position);
  }
  function findMilestone(projectId: string, id: string) {
    const milestone = milestones.find((item) => item.id === id && item.projectId === projectId);
    if (!milestone) throw new Error("milestone not found");
    return milestone;
  }
  function milestoneName(name: string, projectId: string, exceptId = "") {
    const value = name.trim();
    if (!value) throw new Error("milestone name is required");
    if ([...value].length > 80) throw new Error("milestone name is too long (max 80 characters)");
    if (listedMilestones(projectId).some((item) => item.id !== exceptId && item.name.toLowerCase() === value.toLowerCase())) throw new Error("a milestone already uses this name");
    return value;
  }
  function milestoneSlug(name: string, projectId: string) {
    const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "milestone";
    const taken = new Set(milestones.filter((item) => item.projectId === projectId).map((item) => item.slug));
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    return slug;
  }
  function projectCards(projectId: string) {
    return [...(projectId === PREVIEW_PROJECT_ID ? structureCards : []), ...(promotedCards.get(projectId) ?? [])] as { slug: string; milestoneId?: string }[];
  }
  // Saved filters start empty and live only in this bridge instance, like the core:
  // upsert by (project, surface, name), and an empty projectId is app-level.
  type PreviewSavedFilter = {
    id: string; projectId: string; surface: string; name: string; payloadJson: string;
    position: number; createdAt: string; updatedAt: string;
  };
  let savedFilters: PreviewSavedFilter[] = [];
  let nextSavedFilter = 0;
  function surfaceFilters(projectId: string, surface: string) {
    return savedFilters.filter((item) => item.projectId === projectId && item.surface === surface)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }
  function savedFilterPayload(payloadJson: string) {
    const value = payloadJson.trim();
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { parsed = undefined; }
    const version = (parsed as { version?: unknown } | undefined)?.version;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Number.isInteger(version) || (version as number) < 1) {
      throw new Error("saved filter payload must be a JSON object with an integer version");
    }
    return value;
  }
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
        setAgentsSync: async (args?: ProjectArgs & { enabled?: boolean }) => {
          const settings = previewSettings.find((item) => item.projectId === args?.projectId);
          if (settings) settings.agentsSync = args?.enabled === true;
          return { enabled: args?.enabled === true, files: args?.enabled ? [{ repo: "", path: "AGENTS.md", action: "write", reason: "" }] : [] };
        },
        listRepos: scoped({ repos: previewRepos }, { repos: [] }),
      }),
      canvas: createBrowserCanvas(),
      knowledge: browserDevApi({
        list: async (args?: ProjectArgs & { kind?: string; archived?: boolean }) => ({
          items: knowledgeFor(args?.projectId ?? "")
            .filter((item) => !deletedKnowledge.has(String(item.id)) && (!args?.kind || item.kind === args.kind))
            .filter((item) => archivedKnowledge.has(String(item.id)) === (args?.archived === true))
            .map((item) => ({ ...item, archivedAt: archivedKnowledge.get(String(item.id)) ?? "" })),
        }),
        save: async (args?: { item?: Record<string, unknown> }) => {
          const id = String(args?.item?.id ?? "");
          if (!id) throw new Error("knowledge item id is required");
          const item = { ...knowledgeById(id), ...args?.item, updatedAt: new Date().toISOString() };
          savedKnowledge.set(id, item);
          return { item };
        },
        // Archive and delete follow the core rules: decisions never move, and only archived items delete.
        setArchived: async (args?: { id?: string; archived?: boolean }) => {
          const item = knowledgeById(args?.id);
          const id = String(item?.id ?? "");
          if (!item || deletedKnowledge.has(id)) throw new Error("unknown knowledge item");
          if (item.kind === "decision") throw new Error("decisions are never archived or deleted: supersede them");
          if (args?.archived) archivedKnowledge.set(id, new Date().toISOString());
          else archivedKnowledge.delete(id);
          return { item: { ...item, archivedAt: archivedKnowledge.get(id) ?? "" } };
        },
        delete: async (args?: { id?: string }) => {
          const item = knowledgeById(args?.id);
          const id = String(item?.id ?? "");
          if (!item || deletedKnowledge.has(id)) throw new Error("unknown knowledge item");
          if (item.kind === "decision") throw new Error("decisions are never archived or deleted: supersede them");
          if (!archivedKnowledge.has(id)) throw new Error("archive the item before deleting it permanently");
          archivedKnowledge.delete(id);
          deletedKnowledge.add(id);
          return {};
        },
        listLinks: scoped({ links: previewLinks }, { links: [] }),
      }),
      canon: browserDevApi({
        listEntities: scoped({ entities: previewEntities }, { entities: [] }),
        listFacts: async (args?: ProjectArgs & { entityId?: string }) => ({
          facts: [...(args?.projectId === PREVIEW_PROJECT_ID ? previewFacts : []), ...(promotedFacts.get(args?.projectId ?? "") ?? [])]
            .filter((fact) => !args?.entityId || fact.entityId === args.entityId),
        }),
        getFact: async (args?: { id?: string }) => {
          const fact = [...previewFacts, ...[...promotedFacts.values()].flat()].find((item) => item.id === args?.id);
          const ids = previewFactSeeds.find((seed) => seed[0] === args?.id)?.[6] ?? [];
          return { fact, evidence: previewCanonEvidence.filter((item) => ids.includes(item.id)) };
        },
        listEvidence: scoped({ evidence: previewCanonEvidence }, { evidence: [] }),
      }),
      context: browserDevApi({
        listChanges: async (args?: ProjectArgs & { actorKind?: string; limit?: number; subjectId?: string }) => ({
          changes: args?.projectId === PREVIEW_PROJECT_ID
            ? previewChanges
              .filter((change) => !args.actorKind || change.actorKind === args.actorKind)
              .filter((change) => !args.subjectId || (JSON.parse(change.payloadJson) as { subject_ids?: string[] }).subject_ids?.includes(args.subjectId))
              .slice(0, args.limit ?? 50)
            : [],
        }),
        getAgentRun: async (args?: { id?: string }) => ({
          run: previewRuns.find((item) => item.id === args?.id),
          steps: previewRunSteps.filter((step) => step.agentRunId === args?.id),
        }),
      }),
      dispatch: browserDevApi({
        listRuns: async (args?: ProjectArgs & { limit?: number; offset?: number }) => {
          if (args?.projectId !== PREVIEW_PROJECT_ID) return { runs: [] };
          const offset = args.offset ?? 0;
          const limit = args.limit && args.limit > 0 ? args.limit : previewDispatchRuns.length;
          return { runs: previewDispatchRuns.slice(offset, offset + limit) };
        },
        getRun: async (args?: { id?: string }) => ({
          run: previewDispatchRuns.find((item) => item.id === args?.id),
        }),
        startRun: async (args?: {
          projectId?: string;
          tier?: string;
          prompt?: string;
          cardSlug?: string;
          agent?: string;
          worktree?: string;
          dir?: string;
          readOnly?: boolean;
        }) => {
          const run = {
            id: `drun-${previewDispatchRuns.length + 1}`,
            projectId: args?.projectId ?? PREVIEW_PROJECT_ID,
            status: "running",
            tier: args?.tier || "normal",
            agent: args?.agent || "codex",
            model: "gpt-5-codex",
            provider: "openai",
            effort: "medium",
            prompt: args?.prompt ?? "",
            cardSlug: args?.cardSlug ?? "",
            agentRunId: "",
            dir: args?.dir ?? ".",
            repo: "polterware",
            worktree: args?.worktree ?? "",
            branch: "",
            baseSha: "",
            readOnly: Boolean(args?.readOnly),
            verification: "",
            exitCode: 0,
            exitClass: "",
            error: "",
            note: "",
            filesChanged: 0,
            insertions: 0,
            deletions: 0,
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            finishedAt: "",
            mergedAt: "",
            mergeSha: "",
          };
          previewDispatchRuns.unshift(run);
          return { run };
        },
        cancelRun: async (args?: { id?: string }) => {
          const run = previewDispatchRuns.find((item) => item.id === args?.id);
          if (run) run.status = "cancelled";
          return { run };
        },
        verifyRun: async (args?: { id?: string }) => {
          const run = previewDispatchRuns.find((item) => item.id === args?.id);
          if (run) run.verification = "verified";
          return { ok: Boolean(run), json: JSON.stringify({ status: run ? "verified" : "error" }) };
        },
        mergeRun: async (args?: { id?: string }) => {
          const run = previewDispatchRuns.find((item) => item.id === args?.id);
          if (run) {
            run.mergedAt = new Date().toISOString();
            run.mergeSha = "a1b2c3d";
          }
          return { ok: Boolean(run), json: JSON.stringify({ merged: Boolean(run) }) };
        },
        result: async (args?: { id?: string; section?: string }) => {
          const run = previewDispatchRuns.find((item) => item.id === args?.id);
          if (!run) return { content: "", total: 0 };
          const output = args?.section === "output" ? previewDispatchOutputs[run.id] : undefined;
          return { content: output ?? `${args?.section ?? "summary"}: ${run.note || run.error || run.status}`, total: 1 };
        },
        listWorktrees: scoped({ worktrees: previewDispatchWorktrees }, { worktrees: [] }),
        listQuota: async (args?: { agent?: string }) => ({
          snapshots: previewDispatchQuota.filter((item) => !args?.agent || item.agent === args.agent),
        }),
        listTiers: async () => ({ tiers: previewDispatchTiers }),
        listAgents: async () => ({ agents: previewDispatchAgents }),
        listHistory: async (args?: ProjectArgs & { agent?: string; tier?: string; limit?: number; offset?: number }) => {
          if (args?.projectId !== PREVIEW_PROJECT_ID) return { events: [] };
          const filtered = previewDispatchHistory.filter(
            (event) =>
              (!args.agent || event.agent === args.agent) &&
              (!args.tier || event.tier === args.tier),
          );
          const offset = args.offset ?? 0;
          const limit = args.limit && args.limit > 0 ? args.limit : filtered.length;
          return { events: filtered.slice(offset, offset + limit) };
        },
        checkTiers: async () => ({ problems: [] }),
        listModels: async () => ({ models: previewDispatchModels, problems: [] }),
        replaceTiers: async (payload?: { tiers?: PreviewDispatchTier[] }) => {
          const counts: Record<string, number> = {};
          previewDispatchTiers = (payload?.tiers ?? []).map((tier) => ({ ...tier, position: (counts[tier.name] = (counts[tier.name] ?? -1) + 1) }));
          return { tiers: previewDispatchTiers };
        },
        stats: async (args?: ProjectArgs & { by?: string; since?: string }) => ({
          by: args?.by || "tier",
          since: args?.since || "",
          inFlight: 0,
          rows:
            args?.projectId === PREVIEW_PROJECT_ID
              ? [
                  { key: "normal", runs: 1, successPct: 100, firstTryPct: 100, p50Ms: 125000, p90Ms: 125000, fallbacks: 0, rateLimits: 0, orphans: 0 },
                  { key: "hard", runs: 1, successPct: 0, firstTryPct: 0, p50Ms: 256000, p90Ms: 256000, fallbacks: 0, rateLimits: 0, orphans: 0 },
                ]
              : [],
          rankings:
            args?.projectId === PREVIEW_PROJECT_ID
              ? {
                  mostUsedModel: { key: "gpt-5-codex", runs: 1, samples: 1, p50Ms: 125000, successPct: 100, reason: "" },
                  mostUsedProvider: { key: "openai", runs: 1, samples: 1, p50Ms: 125000, successPct: 100, reason: "" },
                  slowestModel: { key: "desconhecido", runs: 0, samples: 0, reason: "insufficient samples (minimum 5)" },
                  mostFailedModel: { key: "desconhecido", runs: 0, samples: 0, reason: "insufficient samples (minimum 5)" },
                }
              : {
                  mostUsedModel: { key: "desconhecido", runs: 0, samples: 0, reason: "no runs in range" },
                  mostUsedProvider: { key: "desconhecido", runs: 0, samples: 0, reason: "no runs in range" },
                  slowestModel: { key: "desconhecido", runs: 0, samples: 0, reason: "insufficient samples (minimum 5)" },
                  mostFailedModel: { key: "desconhecido", runs: 0, samples: 0, reason: "insufficient samples (minimum 5)" },
                },
        }),
        getClassifier: async () => ({
          featureSchema: 1,
          minSamples: 5,
          featureNames: [
            "bias", "prompt_chars", "prompt_words", "prompt_lines", "list_items", "code_fences",
            "existing_files", "existing_packages", "create", "refactor", "fix", "investigate", "test",
            "risk_auth", "risk_security", "risk_money", "risk_data", "risk_migration", "verification_command",
            "readonly", "write", "tier_easy", "tier_normal", "tier_hard",
          ],
          tiers: [
            { tier: "easy", samples: 0, weights: [-2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0] },
            { tier: "normal", samples: 2, weights: [-2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0] },
            { tier: "hard", samples: 1, weights: [-2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0] },
          ],
        }),
        capacity: async (args?: { since?: string }) => ({
          since: args?.since || "",
          note: "Quota percentages are relative to each agent's own window.",
          keys: [
            {
              key: "codex",
              windows: 1,
              hitFull: 0,
              consumedPct: 42.5,
              leftover: "unknown",
              pace: "on pace",
            },
          ],
        }),
        watchRun: (args: { id: string }, onEvent: (event: { id: string; seq: number; kind: string; text: string; at: string }) => void) => {
          const timer = window.setTimeout(() => {
            (previewDispatchStreams[args.id] ?? []).forEach((event, index) =>
              onEvent({ id: `${args.id}-${index}`, seq: index + 1, at: new Date().toISOString(), ...event }));
          }, 0);
          return () => window.clearTimeout(timer);
        },
      }),
      work: browserDevApi({
        listMilestones: async ({ projectId }: { projectId: string }) => ({ milestones: milestones.filter((item) => item.projectId === projectId).sort((a, b) => a.position - b.position) }),
        createMilestone: async ({ projectId, name }: { projectId: string; name: string }) => {
          const now = new Date().toISOString();
          const value = milestoneName(name, projectId);
          const milestone: PreviewMilestone = {
            id: `preview-milestone-${nextMilestone++}`, projectId, slug: milestoneSlug(value, projectId), name: value, goal: "", exitCriteria: [], targetDate: "",
            state: "planned", position: Math.max(-1, ...listedMilestones(projectId).map((item) => item.position)) + 1, archivedAt: "", createdAt: now, updatedAt: now,
          };
          milestones.push(milestone);
          return { milestone };
        },
        updateMilestone: async ({ projectId, id, name }: { projectId: string; id: string; name: string }) => {
          const milestone = findMilestone(projectId, id);
          milestone.name = milestoneName(name, projectId, id);
          milestone.updatedAt = new Date().toISOString();
          return { milestone };
        },
        archiveMilestone: async ({ projectId, id, archived }: { projectId: string; id: string; archived: boolean }) => {
          const milestone = findMilestone(projectId, id);
          milestone.archivedAt = archived ? milestone.archivedAt || new Date().toISOString() : "";
          if (archived) for (const card of projectCards(projectId)) if (card.milestoneId === id) card.milestoneId = "";
          return { milestone };
        },
        reorderMilestones: async ({ projectId, milestoneIds }: { projectId: string; milestoneIds: string[] }) => {
          const current = listedMilestones(projectId);
          if (milestoneIds.length !== current.length || new Set(milestoneIds).size !== current.length || current.some((item) => !milestoneIds.includes(item.id))) throw new Error("milestone order must list each milestone once");
          current.forEach((item) => { item.position = milestoneIds.indexOf(item.id); });
          return { milestones: listedMilestones(projectId) };
        },
        listCards: async (args?: ProjectArgs) => ({
          cards: [...(args?.projectId === PREVIEW_PROJECT_ID ? structureCards : []), ...(promotedCards.get(args?.projectId ?? "") ?? [])]
            .filter((card) => (card as { status?: string }).status !== "removed"),
        }),
        listInbox: async (args?: ProjectArgs) => inboxFor(args?.projectId ?? ""),
        resolveInboxItem: async (args?: { projectId?: string; itemId?: string; action?: string; answer?: string }) => {
          const index = args?.projectId === PREVIEW_PROJECT_ID ? inboxItems.findIndex((item) => item.id === args?.itemId) : -1;
          const item = inboxItems[index];
          if (!item) throw new Error("unknown Inbox item");
          if (!item.actions.includes(args?.action ?? "")) throw new Error(`cannot ${args?.action} a ${item.kind} item`);
          if (args?.action === "defer") item.state = "deferred";
          else inboxItems.splice(index, 1);
          return { item, action: args?.action ?? "", ops: [] };
        },
        listStructure: async (args?: ProjectArgs) => structure.list(args?.projectId ?? ""),
        apply: async (args?: { projectId?: string; text?: string; dryRun?: boolean; change?: { summary?: string } }) => {
          if (/^# [^#]/m.test(args?.text ?? "")) {
            if (![PREVIEW_PROJECT_ID, "browser-empty"].includes(args?.projectId ?? "")) throw new Error("Project not found.");
            const projectId = args!.projectId!;
            const before = structure.list(projectId).nodes;
            const result = structure.apply(projectId, args?.text ?? "", args?.dryRun);
            if (!args?.dryRun) {
              const after = new Map(structure.list(projectId).nodes.map((node) => [node.id, node.path]));
              const moved = new Map(before.filter((node) => after.get(node.id) !== node.path).map((node) => [node.path, after.get(node.id)!]));
              const cards = [...(projectId === PREVIEW_PROJECT_ID ? structureCards : []), ...(promotedCards.get(projectId) ?? [])];
              for (const card of cards) if (typeof card.under === "string" && moved.has(card.under)) card.under = moved.get(card.under)!;
            }
            return result;
          }
          // `## slug` blocks without a title change existing cards: the board's moves and the list's batches.
          const text = args?.text ?? "";
          const blocks = [...text.matchAll(/^## ([a-z0-9-]+)\n(.*)$/gm)];
          if (blocks.length > 0 && !/^## [a-z0-9-]+: /m.test(text)) {
            if (![PREVIEW_PROJECT_ID, "browser-empty"].includes(args?.projectId ?? "")) throw new Error("Project not found.");
            if (!args?.change?.summary?.trim()) throw new Error("A change needs a summary.");
            const cards = projectCards(args!.projectId!) as { slug: string; stage?: string; status?: string; milestoneId?: string; updatedAt?: string }[];
            const changes = blocks.map(([, slug, meta]) => {
              const card = cards.find((item) => item.slug === slug);
              if (!card) throw new Error(`unknown card ${slug}`);
              // milestone: takes a slug; an empty value returns the card to the Backlog.
              const milestoneSlug = /(?:^|· )milestone: *([a-z0-9-]*)/.exec(meta)?.[1];
              const milestone = milestoneSlug ? listedMilestones(args!.projectId!).find((item) => item.slug === milestoneSlug) : undefined;
              if (milestoneSlug && !milestone) throw new Error(`unknown milestone "${milestoneSlug}"`);
              return { card, stage: /(?:^|· )stage: ([a-z]+)/.exec(meta)?.[1], status: /(?:^|· )status: ([a-z]+)/.exec(meta)?.[1], milestoneId: milestoneSlug === undefined ? undefined : milestone?.id ?? "" };
            });
            if (!args?.dryRun) {
              for (const { card, stage, status, milestoneId } of changes) {
                if (stage) card.stage = stage;
                if (status) card.status = status;
                if (milestoneId !== undefined) card.milestoneId = milestoneId;
                card.updatedAt = new Date().toISOString();
              }
            }
            return {
              applied: !args?.dryRun,
              diagnostics: [],
              ops: changes.map(({ card, stage, status }) => `~ card ${card.slug}${stage ? ` stage ${stage}` : ""}${status ? ` status ${status}` : ""}`),
            };
          }
          // A `### <decision id>` block moves a stored decision: its status (with the reason a
          // challenge records) or its level. Supersedes and new decisions fall through.
          const decisionBlock = /^### (?!new:)(\S+)\n(.*)$/m.exec(text);
          if (decisionBlock && !/supersedes:/.test(decisionBlock[2]) && knowledgeById(decisionBlock[1])?.kind === "decision") {
            if (!args?.change?.summary?.trim()) throw new Error("A change needs a summary.");
            const item = knowledgeById(decisionBlock[1])!;
            const meta = decisionBlock[2];
            const status = /(?:^|· )status: ([a-z]+)/.exec(meta)?.[1];
            const reason = /(?:^|· )reason: (.+?)(?: ·|$)/.exec(meta)?.[1];
            const level = /(?:^|· )level: ([a-z]+)/.exec(meta)?.[1];
            if (status === "challenged" && !reason) throw new Error("a challenge needs a reason:");
            const extra = { ...JSON.parse(String(item.extraJson || "{}")), ...(reason ? { statusReason: reason } : {}), ...(level ? { level } : {}) };
            if (!args?.dryRun) savedKnowledge.set(String(item.id), { ...item, ...(status ? { status } : {}), extraJson: JSON.stringify(extra), updatedAt: new Date().toISOString() });
            return { applied: !args?.dryRun, diagnostics: [], ops: [`~ decision ${item.id}${status ? ` status ${status}` : ""}${level ? ` level ${level}` : ""}`] };
          }
          // milestone: is resolved here because milestones live in this bridge instance.
          const slug = /(?:^|· )milestone: *([a-z0-9-]*)/m.exec(args?.text ?? "")?.[1] ?? "";
          const milestone = slug ? listedMilestones(args?.projectId ?? "").find((item) => item.slug === slug) : undefined;
          if (slug && !milestone) throw new Error(`unknown milestone "${slug}": list them with polterware query milestones, or create one in the Desktop`);
          const result = await applyPreviewPolter(args);
          const card = /^## ([a-z0-9-]+):/m.exec(args?.text ?? "")?.[1];
          if (milestone && result.applied && card) {
            const created = projectCards(args!.projectId!).find((item) => item.slug === card);
            if (created) created.milestoneId = milestone.id;
          }
          return result;
        },
        setScope: async () => ({}),
        listStructureHistory: scoped({ entries: previewStructureHistory }, { entries: [] }),
      }),
      savedFilters: browserDevApi({
        list: async ({ projectId = "", surface }: { projectId?: string; surface: string }) => {
          if (!surface.trim()) throw new Error("saved filter surface is required");
          return { filters: surfaceFilters(projectId.trim(), surface.trim()) };
        },
        save: async (input: { projectId?: string; surface: string; name: string; payloadJson: string }) => {
          const projectId = (input.projectId ?? "").trim();
          const surface = input.surface.trim();
          const name = input.name.trim();
          if (!surface) throw new Error("saved filter surface is required");
          if (!name || [...name].length > 80) throw new Error("Use a saved filter name with 1 to 80 characters.");
          const payloadJson = savedFilterPayload(input.payloadJson);
          const now = new Date().toISOString();
          const current = surfaceFilters(projectId, surface);
          const existing = current.find((item) => item.name === name);
          if (existing) {
            if (existing.payloadJson !== payloadJson) Object.assign(existing, { payloadJson, updatedAt: now });
            return { filter: existing };
          }
          const filter = {
            id: `preview-filter-${nextSavedFilter++}`, projectId, surface, name, payloadJson,
            position: current.reduce((next, item) => Math.max(next, item.position + 1), 0), createdAt: now, updatedAt: now,
          };
          savedFilters.push(filter);
          return { filter };
        },
        delete: async ({ id }: { id: string }) => {
          if (!savedFilters.some((item) => item.id === id)) throw new Error("saved filter not found");
          savedFilters = savedFilters.filter((item) => item.id !== id);
          return {};
        },
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
