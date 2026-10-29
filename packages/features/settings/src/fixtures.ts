import type { ProjectEnvironment, ProjectGeneralSettings } from "./types";

/** Project environments for Settings — fixture honesty only. */
export const SETTINGS_ENVIRONMENT_MOCKS: ProjectEnvironment[] = [
  {
    id: "env-prod",
    name: "Production",
    kind: "production",
    protection: "strict",
    nodeCount: 4,
    isDefault: true,
    description: "Customer-facing production stage.",
    protectionRules: [
      "Changes remain visual in this version",
      "Freeze window: Fri 18:00 – Mon 08:00 UTC",
      "Destructive commands are not executed",
      "Fixture metadata refresh is manual",
    ],
    dataSource: "fixture",
  },
  {
    id: "env-staging",
    name: "Staging",
    kind: "staging",
    protection: "standard",
    nodeCount: 2,
    isDefault: false,
    description: "Pre-production validation stage.",
    protectionRules: [
      "Changes remain visual in this version",
      "Validation results are fixture data",
    ],
    dataSource: "fixture",
  },
  {
    id: "env-dev",
    name: "Development",
    kind: "development",
    protection: "relaxed",
    nodeCount: 1,
    isDefault: false,
    description: "Day-to-day engineering stage.",
    protectionRules: [
      "Session-only changes are allowed",
      "No data persists after the app closes",
    ],
    dataSource: "fixture",
  },
];

export const PROJECT_GENERAL_SETTINGS_MOCK: ProjectGeneralSettings = {
  name: "Polter",
  description: "Local project context for AI coding",
  defaultEnvironmentId: "env-prod",
  agentsSync: false,
  projectId: "polter_01H7E2K3Q8V6",
  repository: "polterware/polter",
  dataSource: "fixture",
};

export function findEnvironmentById(
  id: string | undefined | null,
  list: readonly ProjectEnvironment[] = SETTINGS_ENVIRONMENT_MOCKS,
): ProjectEnvironment | undefined {
  if (!id) return undefined;
  return list.find((environment) => environment.id === id);
}
