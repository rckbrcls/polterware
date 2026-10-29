import type { ComponentCategory, ComponentTypeDefinition } from "./registry";

const KIND_LABELS = {
  web: "Web app",
  mobile: "Mobile app",
  desktop: "Desktop app",
  api: "API",
  service: "Service",
  worker: "Worker",
  job: "Job",
  function: "Function",
  database: "Database",
  cache: "Cache",
  queue: "Queue",
  stream: "Stream",
  storage: "Storage",
  search: "Search",
  warehouse: "Warehouse",
  host: "Host",
  load_balancer: "Load balancer",
  gateway: "Gateway",
  cdn: "CDN",
  network: "Network",
  dns: "DNS",
  region: "Region",
  repository: "Repository",
  library: "Library",
  pipeline: "Pipeline",
  build: "Build",
  registry: "Registry",
  external: "External",
  saas: "SaaS",
  third_party_api: "Third-party API",
  authentication: "Authentication",
  payments: "Payments",
  connector: "Connector",
  system: "System",
  note: "Note",
  custom: "Custom",
} satisfies Record<string, string>;

const PURPOSE_BY_CATEGORY = {
  applications: "What this app or service does in our system…",
  data: "Primary store / cache / stream for…",
  infrastructure: "How this infrastructure piece is used…",
  development: "Role in the delivery pipeline…",
  external: "Vendor system we depend on for…",
  structure: "System boundary or annotation…",
  connected: "Linked capability used for…",
} satisfies Record<ComponentCategory, string>;

function humanizeType(id: string): string {
  return id
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Read-only copy for the configure header and purpose placeholder.
 * Catalog `description` is type-level; purpose is instance-level.
 */
export function placeHints(def: ComponentTypeDefinition) {
  const typeKey = String(def.nodeType ?? def.id);
  const kindLabel = Object.entries(KIND_LABELS).find(([key]) => key === typeKey)?.[1]
    ?? humanizeType(typeKey);
  return {
    kindLabel,
    typeBlurb: def.description,
    purposePlaceholder: PURPOSE_BY_CATEGORY[def.category] ?? "What this component does here…",
    statusLine: "Places as planned / unlinked until a resource is linked",
  };
}
