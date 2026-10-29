export type CommanderOverviewId = "knowledge" | "integrations";

export type CommanderOverviewCard = {
  id: CommanderOverviewId;
  title: string;
  subtitle: string;
  tone: "knowledge" | "integration" | "neutral";
  openCommandId: string;
};

export type CommanderFeatureRow = {
  id: string;
  title: string;
  status: string;
  kind: "card";
};

export type CommanderIntegrationRow = {
  id: string;
  name: string;
  status: string;
  label: string;
};

export type CommanderOverviewDetail = {
  features: CommanderFeatureRow[];
  integrations: CommanderIntegrationRow[];
};

export type CommanderOverviewSnapshot = {
  available: boolean;
  projectId: string;
  cards: CommanderOverviewCard[];
  detail: CommanderOverviewDetail;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function emptyDetail(): CommanderOverviewDetail {
  return { features: [], integrations: [] };
}

function offlineCards(message: string): CommanderOverviewCard[] {
  return [
    {
      id: "knowledge",
      title: "Knowledge",
      subtitle: message,
      tone: "knowledge",
      openCommandId: "nav.work",
    },
    {
      id: "integrations",
      title: "Integrations",
      subtitle: message,
      tone: "integration",
      openCommandId: "nav.platforms",
    },
  ];
}

/**
 * Overview + drill-down payloads for the global Commander window.
 */
export async function loadCommanderOverview(): Promise<CommanderOverviewSnapshot> {
  try {
    const listed = asRecord(await window.polterware.core.projects.list());
    const projects = asObjectArray(listed.projects).filter(
      (project) => asString(project.status, "active") !== "archived",
    );
    const projectId = asString(projects[0]?.id);
    if (!projectId) {
      return {
        available: true,
        projectId: "",
        cards: offlineCards("No local project"),
        detail: emptyDetail(),
      };
    }

    const [knowledgeRes, workRes, connectionsRes, providersRes] = await Promise.all([
      window.polterware.core.knowledge.list({ projectId }),
      window.polterware.core.work.listCards({ projectId }).catch(() => ({ cards: [] })),
      window.polterware.core.integrations.listConnections({ projectId }),
      window.polterware.core.integrations.listProviders(),
    ]);

    const knowledgeItems = asObjectArray(asRecord(knowledgeRes).items);
    const cardsList = asObjectArray(asRecord(workRes).cards).map((card) => ({
      id: asString(card.slug),
      title: asString(card.title) || asString(card.slug),
      status: asString(card.stage, "shape"),
      kind: "card" as const,
    }));
    const deliveredCount = cardsList.filter((item) => item.status === "delivered").length;
    const features: CommanderFeatureRow[] = [
      ...cardsList.slice(0, 10),
    ];

    const providers = asObjectArray(asRecord(providersRes).providers);
    const providerNames = new Map(
      providers.map((item) => [asString(item.id), asString(item.name) || asString(item.id)]),
    );
    const connections = asObjectArray(asRecord(connectionsRes).connections);
    const integrations: CommanderIntegrationRow[] = connections.slice(0, 12).map((item) => {
      const providerId = asString(item.providerId);
      return {
        id: asString(item.id),
        name: providerNames.get(providerId) ?? providerId,
        status: asString(item.status, "unknown"),
        label: asString(item.label) || providerId,
      };
    });
    const connected = integrations.filter((item) => item.status === "connected").length;
    const failed = integrations.filter((item) => item.status === "failed").length;

    return {
      available: true,
      projectId,
      cards: [
        {
          id: "knowledge",
          title: "Knowledge",
          subtitle:
            cardsList.length === 0
              ? "No Work cards"
              : `${cardsList.length} ${cardsList.length === 1 ? "card" : "cards"} · ${deliveredCount} delivered`,
          tone: "knowledge",
          openCommandId: "nav.work",
        },
        {
          id: "integrations",
          title: "Integrations",
          subtitle:
            integrations.length === 0
              ? "No connections"
              : failed > 0
                ? `${connected} connected · ${failed} failed`
                : `${connected} connected`,
          tone: "integration",
          openCommandId: "nav.platforms",
        },
      ],
      detail: { features, integrations },
    };
  } catch {
    return {
      available: false,
      projectId: "",
      cards: offlineCards("Core unavailable"),
      detail: emptyDetail(),
    };
  }
}
