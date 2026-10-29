export type ArchViewMember = {
  id: string;
  name: string;
  type?: string;
  layer?: string;
};

export type ArchitectureViewDraft = {
  id?: string;
  name: string;
  members: Array<{ nodeId: string; name: string; type?: string; layer?: string }>;
  description?: string;
  owner?: string;
  purpose?: string;
  notes?: string;
  filterSummary?: string;
  environments?: string[];
  tags?: string[];
};

export type ArchViewCard = {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  updated: string;
  owner?: string;
  environments?: string[];
  tags?: string[];
  purpose?: string;
  /** Present only when membership is known. Never invent from nodeCount. */
  members?: ArchViewMember[];
  notes?: string;
  filterSummary?: string;
  dataSource?: "fixture" | string;
};

export const VIEW_FIXTURES: ArchViewCard[] = [
  {
    id: "v-system",
    name: "System view",
    description: "All production components across the system map.",
    nodeCount: 9,
    updated: "2m ago",
    owner: "Platform",
    environments: ["Production"],
    tags: ["system", "default"],
    purpose: "Full production topology",
    members: [
      { id: "n-gha", name: "GitHub Actions", type: "CI pipeline", layer: "Delivery" },
      { id: "n-vercel", name: "Vercel Web", type: "Web application", layer: "Edge" },
      { id: "n-gw", name: "API Gateway", type: "API gateway", layer: "Edge" },
      { id: "n-auth", name: "Auth Service", type: "Service", layer: "Application" },
      { id: "n-pay", name: "Payment Service", type: "Service", layer: "Application" },
      { id: "n-worker", name: "Worker", type: "Worker", layer: "Application" },
      { id: "n-pg", name: "PostgreSQL", type: "Database", layer: "Data" },
      { id: "n-redis", name: "Redis", type: "Cache", layer: "Data" },
      { id: "n-queue", name: "Event Queue", type: "Queue", layer: "Data" },
    ],
    notes: "Default system lens. Prefer Payment flow or Infrastructure when focusing a slice.",
    filterSummary: "All components / Production",
    dataSource: "fixture",
  },
  {
    id: "v-pay",
    name: "Payment flow",
    description: "Checkout path from edge through payment workers and stores.",
    nodeCount: 6,
    updated: "1h ago",
    owner: "Payments Guild",
    environments: ["Production", "Staging"],
    tags: ["payments", "checkout"],
    purpose: "Checkout and settlement lens",
    members: [
      { id: "n-gw", name: "API Gateway", type: "API gateway", layer: "Edge" },
      { id: "n-pay", name: "Payment Service", type: "Service", layer: "Application" },
      { id: "n-worker", name: "Worker", type: "Worker", layer: "Application" },
      { id: "n-pg", name: "PostgreSQL", type: "Database", layer: "Data" },
      { id: "n-redis", name: "Redis", type: "Cache", layer: "Data" },
      { id: "n-queue", name: "Event Queue", type: "Queue", layer: "Data" },
    ],
    notes: "Use when reviewing checkout incidents or settlement latency.",
    filterSummary: "Types: gateway, service, worker, database, cache, queue / Tags: payments",
    dataSource: "fixture",
  },
  {
    id: "v-infra",
    name: "Infrastructure",
    description: "Cloud, nodes and data plane components.",
    nodeCount: 12,
    updated: "1d ago",
    owner: "SRE",
    environments: ["Production"],
    tags: ["infra", "data"],
    purpose: "Infrastructure and data plane",
    // Intentionally no members: exercise unavailable membership with only nodeCount.
    notes: "Membership list is not authored for this mock view yet.",
    dataSource: "fixture",
  },
  {
    id: "v-auth",
    name: "Authentication flow",
    description: "Authentication-related services",
    nodeCount: 4,
    updated: "3d ago",
    // Sparse baseline: name/description/nodeCount/updated only (plus implicit defaults).
  },
];
