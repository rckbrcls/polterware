export type CliConnectionState =
  | "cli-unavailable"
  | "ready"
  | "authenticating"
  | "connected"
  | "failed";

export type IntegrationCatalogCategory =
  | "Source Control"
  | "Cloud"
  | "Deployment"
  | "Databases"
  | "Infrastructure";

export type WorkspaceCatalogProvider = {
  id: string;
  name: string;
  description: string;
  category: IntegrationCatalogCategory;
  binary: string;
  authCommands: string[];
  transcript: string[];
  state: CliConnectionState;
};

export type WorkspaceIntegration = {
  id: string;
  providerId: string;
  name: string;
  provider: string;
  status: "connected" | "error" | "disconnected" | "disabled";
  connectionLabel: string;
  environment: string;
  environments?: string[];
  lastSync: string;
  summary: string;
  resourceCount: number;
  cliCommand: string;
  syncInterval?: string;
  freshness?: "fresh" | "stale" | "unknown";
  error?: string;
};

export type WorkspaceIntegrationResource = {
  id: string;
  integrationId: string;
  name: string;
  kind: string;
  externalId: string;
  environment: string;
  status: string;
};

export type WorkspaceIntegrationSyncRun = {
  id: string;
  integrationId: string;
  startedAt: string;
  finishedAt: string;
  result: "success" | "partial" | "failed" | "running";
  imported: number;
  changed: number;
  message: string;
};

export type WorkspaceEntityLink = {
  id: string;
  entityId: string;
  entityTitle: string;
  entityKind: string;
  entityRefId: string;
  predicate: string;
  truthClass: string;
  source: string;
};

export type WorkspaceCanonEntity = {
  id: string;
  kind: string;
  refKind: string;
  refId: string;
  title: string;
  truthClass: string;
  source: string;
};

export type WorkspaceVerdict = {
  id: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  updatedAt: string;
  tags: string[];
  /** Stored status, kept for display of legacy rows. */
  status: string;
  /** Lifecycle state: proposed, active, challenged, or superseded. */
  state: DecisionState;
  /** A principle applies to the whole project and stays pinned above local decisions. */
  scope: "principle" | "decision";
  /** Title of the decision that replaced this one; empty when none. */
  supersededBy: string;
  /** Titles of the decisions this one replaced. */
  supersedes: string[];
  reviewTrigger: string;
  statusReason: string;
  /** Paths of the Atlas nodes that cite this decision. */
  governs: string[];
  /** Atlas node the decision is scoped to; unset means the whole project. */
  scopeNodeId?: string;
  owner: string;
  entityLinks: WorkspaceEntityLink[];
};

/**
 * One piece of Evidence: a markdown note, optionally pointing at a project file.
 * There is no type; a runbook or a document is an item carrying that tag.
 */
export type WorkspaceEvidence = {
  id: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  tags: string[];
  /** Project-relative path of the file this evidence points at; empty for a plain note. */
  path: string;
  /** Atlas node the evidence is scoped to; unset means the whole project. */
  scopeNodeId?: string;
  owner: string;
  updatedAt: string;
  entityLinks: WorkspaceEntityLink[];
};

export type DecisionState = "proposed" | "active" | "challenged" | "superseded";

/** Work board column for a card (Grounded SDD lifecycle). */
export type WorkStage = "shape" | "plan" | "build" | "verify" | "delivered";

export type WorkspaceWorkTask = {
  id: string;
  number: number;
  title: string;
  state: "open" | "done" | "dropped";
  scope: string;
  /** Agent label holding the task's claim; empty when the task is free. */
  claimHolder: string;
};

export type WorkspaceWorkQuestion = {
  id: string;
  text: string;
  blocking: boolean;
  options: string[];
  state: "open" | "answered";
  answer: string;
};

export type WorkspaceWorkInvariant = {
  id: string;
  text: string;
};

/** Work card from the Work tables (Verdict 0006), written through the Polter format. */
/** A feature, or an Architecture Change that edits the Atlas structure. */
export type WorkCardKind = "feature" | "architecture";

export type WorkspaceWorkCard = {
  id: string;
  slug: string;
  title: string;
  intent: string;
  stage: WorkStage;
  kind: WorkCardKind;
  owner: string;
  under: string;
  decisions: string[];
  updatedAt: string;
  tasks: WorkspaceWorkTask[];
  questions: WorkspaceWorkQuestion[];
  invariants: WorkspaceWorkInvariant[];
};

/** New-feature flow step (slice 9). Intent creates the card; the rest review it. */
export type FeatureFlowStep = "intent" | "shape" | "contract" | "plan";

/** Where an open question waits; answered questions carry their answer. */
export type FeatureQuestionRoute = "inbox" | "deferred" | "delegated" | "answered";

/** Shape impact and gate checks of one card, from WorkService.ReviewFeature. */
export type WorkspaceFeatureReview = {
  card: WorkspaceWorkCard;
  /** Set when the card's under: names an Atlas node. */
  underPath: string;
  underTitle: string;
  /** Component paths suggested for a card without under:. */
  suggested: string[];
  touches: { path: string; level: string; title: string }[];
  /** from is "card" or the node path citing the decision; status is empty when no Verdict matches. */
  decisions: { ref: string; id: string; title: string; status: string; from: string }[];
  inherited: { text: string; from: string }[];
  questions: {
    id: string;
    text: string;
    blocking: boolean;
    options: string[];
    route: FeatureQuestionRoute;
    answer: string;
  }[];
  checks: { step: "shape" | "contract" | "plan"; severity: "error" | "hint"; message: string }[];
};

export type AtlasLevel = "system" | "domain" | "component";
export type AtlasStatus = "proposed" | "in_progress" | "delivered" | "drift";

/** Atlas node from WorkService.ListAtlas. Status is derived on read. */
export type WorkspaceAtlasNode = {
  id: string;
  parentId: string;
  level: AtlasLevel;
  slug: string;
  path: string;
  title: string;
  intent: string;
  decisions: string[];
  invariants: WorkspaceWorkInvariant[];
  status: AtlasStatus;
  childCount: number;
  featureCount: number;
  openQuestions: number;
  /** Registered checkout name; empty is the project root. */
  repo: string;
  /** Folder inside that checkout; `path` stays the node identity. */
  folder: string;
  /** Both empty unless the node is moving between designs. */
  migrationFrom: string;
  migrationTo: string;
  /** Node paths this node depends on; the map draws them as edges. */
  uses?: string[];
};

export type WorkspaceAtlas = {
  nodes: WorkspaceAtlasNode[];
  driftSlugs: string[];
  /** True for a replayed past graph: status, feature counts, and drift are live-only. */
  historical: boolean;
};

/** One change batch that touched the Atlas, from WorkService.ListAtlasHistory. */
export type WorkspaceAtlasHistoryEntry = {
  batchId: string;
  at: string;
  nodeOps: number;
  summary: string;
};

export type WorkspaceInboxKind = "decision" | "drift" | "verify";

/** Inbox action ids from WorkService.ListInbox, primary first per kind. */
export type WorkspaceInboxAction =
  | "decide"
  | "delegate"
  | "defer"
  | "fix_code"
  | "update_intent"
  | "ignore"
  | "verify"
  | "reject";

/** One derived item that needs a person (WorkService.ListInbox). */
export type WorkspaceInboxItem = {
  id: string;
  kind: WorkspaceInboxKind;
  blocking: boolean;
  title: string;
  detail: string;
  options: string[];
  where: string;
  source: string;
  state: "open" | "deferred";
  actions: WorkspaceInboxAction[];
};

export type WorkspaceInbox = {
  items: WorkspaceInboxItem[];
  openCount: number;
  blockingCount: number;
};
