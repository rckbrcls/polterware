export type OverviewId = "knowledge" | "integrations";

export type OverviewFeatureRow = {
  id: string;
  title: string;
  status: string;
  kind: "card";
};

export type OverviewIntegrationRow = {
  id: string;
  name: string;
  status: string;
  label: string;
};

export type OverviewDetailPayload = {
  features: OverviewFeatureRow[];
  integrations: OverviewIntegrationRow[];
};

export const OVERVIEW_TITLES: Record<OverviewId, string> = {
  knowledge: "Knowledge",
  integrations: "Integrations",
};

export const OVERVIEW_CARD_ORDER: readonly OverviewId[] = [
  "knowledge",
  "integrations",
];

export const OVERVIEW_OPEN_COMMAND: Record<OverviewId, string> = {
  knowledge: "nav.work",
  integrations: "nav.platforms",
};
