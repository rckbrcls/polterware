export type DataSource = "fixture" | "empty" | "unavailable";

export type EnvironmentKind = "production" | "staging" | "development" | "local";

export type ProtectionLevel = "strict" | "standard" | "relaxed";

export type ProjectEnvironment = {
  id: string;
  name: string;
  kind: EnvironmentKind;
  protection: ProtectionLevel;
  nodeCount: number;
  isDefault: boolean;
  /** Fixture summary lines for this local environment. */
  protectionRules: string[];
  description?: string;
  dataSource: DataSource;
};

/** A repository Structure components link: its GitHub identity and this machine's clone. */
export type ProjectRepository = {
  id: string;
  name: string;
  /** github.com/owner/repo, empty when it has no GitHub remote. */
  remote: string;
  /** This machine's clone, empty when it is not cloned here. */
  localPath: string;
};

export type ProjectGeneralSettings = {
  name: string;
  description: string;
  defaultEnvironmentId: string;
  projectId: string;
  repository: string;
  /** Whether the core keeps the AGENTS.md block of each repository clone current. */
  agentsSync: boolean;
  dataSource: DataSource;
};

export type SettingsTabId = import("@polterware/feature-shell").ProjectSettingsTabId;
export type ProjectSettingsPageId = Extract<SettingsTabId, "general" | "environments" | "project-danger">;
