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

export type ProjectRepository = {
  id: string;
  name: string;
  path: string;
};

export type ProjectGeneralSettings = {
  name: string;
  description: string;
  defaultEnvironmentId: string;
  projectId: string;
  repository: string;
  dataSource: DataSource;
};

export type SettingsTabId = import("@polterware/feature-shell").ProjectSettingsTabId;
export type ProjectSettingsPageId = Extract<SettingsTabId, "general" | "repositories" | "environments" | "project-danger">;
