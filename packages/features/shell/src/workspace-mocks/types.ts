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

export type WorkspaceDecision = {
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
  /** Title of the decision that replaced this one; empty when none. */
  supersededBy: string;
  /** Titles of the decisions this one replaced. */
  supersedes: string[];
  reviewTrigger: string;
  statusReason: string;
  /** Paths of the Structure nodes that cite this decision. */
  governs: string[];
  /**
   * Structure nodes the decision applies to (its contexts). None means the whole project:
   * the decision is a principle, pinned above the others.
   */
  scopeNodeIds: string[];
  owner: string;
  entityLinks: WorkspaceEntityLink[];
};

/** One doc: a markdown note. Docs have no types; tags are the free labels that tell them apart. */
export type WorkspaceDoc = {
  id: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  tags: string[];
  /** Structure nodes the doc is about (its contexts); none means the whole project. */
  scopeNodeIds: string[];
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

/** Work card from the Work tables (Decision 0006), written through the Polter format. */
/** A feature, or an Architecture Change that edits the Structure. */
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
  /** The milestone the card ships in; empty is the Backlog. */
  milestoneId?: string;
  /** Display text, such as "Sep 28, 2026, 12:00 PM". */
  updatedAt: string;
  /** The same instant as ISO text, for ordering. */
  updatedAtIso?: string;
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
  /** Set when the card's under: names a Structure node. */
  underPath: string;
  underTitle: string;
  /** Component paths suggested for a card without under:. */
  suggested: string[];
  touches: { path: string; level: string; title: string }[];
  /** from is "card" or the node path citing the decision; status is empty when no Decision matches. */
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

export type StructureLevel = "domain" | "component";
export type StructureStatus = "proposed" | "in_progress" | "delivered";

/** Structure node from WorkService.ListStructure. Status is derived on read. */
export type WorkspaceStructureNode = {
  id: string;
  parentId: string;
  level: StructureLevel;
  slug: string;
  path: string;
  title: string;
  intent: string;
  decisions: string[];
  invariants: WorkspaceWorkInvariant[];
  status: StructureStatus;
  childCount: number;
  featureCount: number;
  openQuestions: number;
  /** Registered checkout name; empty is the project root. */
  repo: string;
  /** Folder inside that checkout; `path` stays the node identity. */
  folder: string;
  /** What a component is (a canvas component kind); empty on other levels. */
  kind?: string;
  /** Free-text technology, the canvas technology prop. */
  tech?: string;
  /** Both empty unless the node is moving between designs. */
  migrationFrom: string;
  migrationTo: string;
  deploys?: { id: string; environmentId: string; environment: string; provider: string; resource: string }[];
};

export type WorkspaceStructure = {
  nodes: WorkspaceStructureNode[];
  /** True for a replayed past graph: status and feature counts are live-only. */
  historical: boolean;
};

/** One change batch that touched the Structure, from WorkService.ListStructureHistory. */
export type WorkspaceStructureHistoryEntry = {
  batchId: string;
  at: string;
  nodeOps: number;
  summary: string;
};

export type WorkspaceInboxKind = "conflict" | "decision" | "setup";

/** Inbox action ids from WorkService.ListInbox, primary first per kind. */
export type WorkspaceInboxAction =
  | "decide"
  | "delegate"
  | "defer"
  | "ignore";

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
  /** Conflict items: conflict (slug), rule and rule_id, decision and decision_id; Setup items: the provider. */
  details: Record<string, string>;
};

export type WorkspaceInbox = {
  items: WorkspaceInboxItem[];
  openCount: number;
  blockingCount: number;
};

export type MilestoneState = "planned" | "active" | "done";

/** A milestone from WorkService.ListMilestones; it owns the cards that ship together. */
export type WorkspaceMilestone = {
  id: string;
  projectId: string;
  /** What a card's milestone: line names; it never changes. */
  slug: string;
  name: string;
  goal: string;
  exitCriteria: string[];
  /** YYYY-MM-DD or empty. */
  targetDate: string;
  state: MilestoneState;
  position: number;
  /** Empty while the milestone is listed. */
  archivedAt: string;
};
