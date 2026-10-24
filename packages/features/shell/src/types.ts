export type DataSource = "fixture" | "empty" | "unavailable";

export type {
  DeploymentMode,
  PlatformCapability,
  PlatformCapabilities,
  PlatformContext,
} from "@polterware/frontend-platform";

export type EnvironmentKind = "production" | "staging" | "development" | "local";

export type EnvironmentItem = {
  id: string;
  name: string;
  kind: EnvironmentKind;
  projectId: string;
};

export type ProjectSwitcherItem = {
  projectId: string;
  name: string;
  directory?: string;
  environmentSummary: string;
  isCurrent: boolean;
  /** Optional table/card display fields (fixture or live). */
  status?: "active" | "paused" | "archived";
  compute?: string;
  region?: string;
  createdAt?: string;
  /** Secondary id under project name in table view. */
  refId?: string;
};

/** The global scope filter: one Atlas node path, or empty for the whole project. */
export type WorkspaceScope = {
  node: string;
};

/** One Atlas node offered by the scope switcher. */
export type ScopeNodeItem = {
  id: string;
  parentId: string;
  level: "system" | "domain" | "component";
  path: string;
  title: string;
};
