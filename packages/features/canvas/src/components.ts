import { circle, roundedAt, roundedBy, stadium } from "./outlines";

export type FamilyId = "client" | "compute" | "workflow" | "storage" | "messaging" | "ai" | "edge" | "security" | "platform" | "observability" | "external" | "people" | "document";
export type Inset = { top: number; right: number; bottom: number; left: number };
/** What a component is, drawn as its silhouette: something that stores is a cylinder whatever its type or technology. */
export type ComponentFamily = {
  id: FamilyId; label: string;
  /** The type a new component of this family starts as. */
  kind: string;
  geometry: { width: number; height: number };
  /** The outline in a w×h box at the origin; open subpaths are interior details. */
  path: (w: number, h: number) => string;
  /** Where the content sits clear of the outline's details. */
  inset: (w: number, h: number) => Inset;
  /** Things outside the project are drawn with a dashed frame. */
  dashed?: boolean;
  /** People get a round icon tile, like an avatar. */
  round?: boolean;
  /** Small solid marks painted in the line color, such as a window's three dots. */
  marks?: (w: number, h: number) => string;
};
const none: Inset = { top: 0, right: 0, bottom: 0, left: 0 };
const card = roundedBy(6);
const bar = (h: number) => Math.min(13, h / 5);
const cap = (h: number) => Math.min(14, h * 0.14);
const end = (w: number) => Math.min(8, w / 14);
const side = (w: number, h: number) => Math.min(w / 5, h * 0.4);
const pin = (h: number) => Math.min(6, h / 10);
const point = (h: number) => Math.min(22, h * 0.28);
const notch = (h: number) => Math.min(18, h * 0.35);
const wave = (h: number) => Math.min(10, h * 0.12);
/** Platform holds things: two slots along the bottom half. */
const slots = (w: number, h: number) => {
  const pad = 10; const top = h * 0.5; const width = (w - pad * 3) / 2;
  return roundedAt(pad, top, width, h - top - pad, 4) + roundedAt(pad * 2 + width, top, width, h - top - pad, 4);
};

/** The box family outlines are drawn in at icon size, where the card proportions would flatten them. */
export const GLYPH = { width: 40, height: 30 };

export const FAMILIES: readonly ComponentFamily[] = [
  { id: "client", label: "Client", kind: "frontend", geometry: { width: 220, height: 76 },
    // A window: square corners, a title bar and its three dots.
    path: (w, h) => `${roundedBy(3)(w, h)}M0 ${bar(h)}H${w}`, inset: (_w, h) => ({ ...none, top: bar(h) }),
    marks: (_w, h) => [0, 1, 2].map((i) => circle(bar(h) * (0.65 + i * 0.5), bar(h) / 2, bar(h) * 0.13)).join("") },
  { id: "compute", label: "Compute", kind: "service", geometry: { width: 220, height: 64 }, path: card, inset: () => none },
  { id: "workflow", label: "Workflow", kind: "pipeline", geometry: { width: 240, height: 64 },
    // A chevron: work that runs in steps or on a trigger.
    path: (w, h) => { const n = notch(h); return `M0 0H${w - n}L${w} ${h / 2}L${w - n} ${h}H0L${n} ${h / 2}Z`; },
    inset: (_w, h) => ({ ...none, left: notch(h), right: notch(h) }) },
  { id: "storage", label: "Storage", kind: "database", geometry: { width: 200, height: 96 },
    path: (w, h) => { const r = cap(h); return `M0 ${r}V${h - r}A${w / 2} ${r} 0 0 0 ${w} ${h - r}V${r}A${w / 2} ${r} 0 0 0 0 ${r}ZM0 ${r}A${w / 2} ${r} 0 0 0 ${w} ${r}`; },
    inset: (_w, h) => ({ ...none, top: cap(h) * 2, bottom: cap(h) / 2 }) },
  { id: "messaging", label: "Messaging", kind: "queue", geometry: { width: 240, height: 64 },
    path: (w, h) => { const r = end(w); return `M${r} 0H${w - r}A${r} ${h / 2} 0 0 1 ${w - r} ${h}H${r}A${r} ${h / 2} 0 0 1 ${r} 0ZM${w - r} 0A${r} ${h / 2} 0 0 0 ${w - r} ${h}`; },
    inset: (w) => ({ ...none, left: end(w), right: end(w) * 2 + 4 }) },
  { id: "ai", label: "AI", kind: "llm", geometry: { width: 220, height: 76 },
    // A chip: the body with pins along the top and bottom edges.
    path: (w, h) => { const p = pin(h); return roundedAt(0, p, w, h - p * 2, 6) + [0.2, 0.4, 0.6, 0.8].map((x) => `M${w * x} 0V${p}M${w * x} ${h - p}V${h}`).join(""); },
    inset: (_w, h) => ({ ...none, top: pin(h), bottom: pin(h) }) },
  { id: "edge", label: "Edge", kind: "gateway", geometry: { width: 240, height: 64 },
    path: (w, h) => { const s = side(w, h); return `M${s} 0H${w - s}L${w} ${h / 2}L${w - s} ${h}H${s}L0 ${h / 2}Z`; },
    inset: (w, h) => ({ ...none, left: side(w, h) * 0.6, right: side(w, h) * 0.6 }) },
  { id: "security", label: "Security", kind: "auth", geometry: { width: 220, height: 84 },
    // A badge: square shoulders and a pointed base, like a shield.
    path: (w, h) => { const r = 6; const t = point(h); return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - t}L${w / 2} ${h}L0 ${h - t}V${r}A${r} ${r} 0 0 1 ${r} 0Z`; },
    inset: (_w, h) => ({ ...none, bottom: point(h) }) },
  { id: "platform", label: "Platform", kind: "cluster", geometry: { width: 220, height: 112 },
    path: (w, h) => `${card(w, h)}${slots(w, h)}`, inset: (_w, h) => ({ ...none, bottom: h * 0.5 }) },
  { id: "observability", label: "Observability", kind: "monitoring", geometry: { width: 220, height: 80 },
    // A card with a pulse line along the bottom.
    path: (w, h) => { const y = h - 12; return `${card(w, h)}M10 ${y}H${w * 0.36}L${w * 0.41} ${y - 8}L${w * 0.47} ${y + 6}L${w * 0.52} ${y - 3}L${w * 0.55} ${y}H${w - 10}`; },
    inset: () => ({ ...none, bottom: 20 }) },
  { id: "external", label: "External", kind: "external", geometry: { width: 220, height: 64 }, path: card, inset: () => none, dashed: true },
  { id: "people", label: "People", kind: "user", geometry: { width: 200, height: 56 }, path: stadium,
    inset: (_w, h) => ({ ...none, left: h * 0.12, right: h * 0.2 }), round: true },
  { id: "document", label: "Document", kind: "spec", geometry: { width: 200, height: 84 },
    // A page with a wavy bottom edge: written artifacts such as specs, config and data files.
    path: (w, h) => { const r = 6; const d = wave(h); return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - d}Q${w * 0.75} ${h - d * 2.4} ${w / 2} ${h - d}T0 ${h - d}V${r}A${r} ${r} 0 0 1 ${r} 0Z`; },
    inset: (_w, h) => ({ ...none, bottom: wave(h) * 1.5 }) },
];
const familyById = new Map(FAMILIES.map((item) => [item.id, item]));

export type ComponentDefinition = {
  kind: string; label: string; family: FamilyId;
  /** Suggestions only; any technology text is allowed. */
  technologies: readonly string[];
};

/** Mirrors canvas.ComponentKinds in backend/domains/canvas/model.go, in palette order. */
export const COMPONENTS: readonly ComponentDefinition[] = [
  { kind: "frontend", label: "Web app", family: "client", technologies: ["React", "Solid", "Next.js", "Vue", "Svelte", "Angular", "Astro"] },
  { kind: "mobile", label: "Mobile app", family: "client", technologies: ["React Native", "Flutter", "Swift", "Kotlin", "Expo"] },
  { kind: "desktop", label: "Desktop app", family: "client", technologies: ["Electron", "Tauri", "SwiftUI", "Qt"] },
  { kind: "cli", label: "CLI", family: "client", technologies: ["Go", "Rust", "Node.js", "Python"] },
  { kind: "service", label: "Service", family: "compute", technologies: ["Go", "Node.js", "Python", "Rust", "Java", "Elixir", ".NET"] },
  { kind: "api", label: "API", family: "compute", technologies: ["REST", "GraphQL", "gRPC", "tRPC", "WebSocket"] },
  { kind: "gateway", label: "Gateway", family: "edge", technologies: ["Nginx", "Envoy", "Kong", "AWS API Gateway", "Cloudflare"] },
  { kind: "worker", label: "Worker", family: "compute", technologies: ["Go", "Node.js", "Python", "Sidekiq", "Celery"] },
  { kind: "function", label: "Function", family: "compute", technologies: ["AWS Lambda", "Cloudflare Workers", "Vercel Functions", "Cloud Functions"] },
  { kind: "scheduler", label: "Scheduler", family: "workflow", technologies: ["Cron", "Temporal", "Airflow", "EventBridge Scheduler"] },
  { kind: "database", label: "Database", family: "storage", technologies: ["Postgres", "MySQL", "SQLite", "MongoDB", "DynamoDB", "Cassandra"] },
  { kind: "cache", label: "Cache", family: "storage", technologies: ["Redis", "Memcached", "Valkey"] },
  { kind: "queue", label: "Queue", family: "messaging", technologies: ["RabbitMQ", "SQS", "NATS", "BullMQ"] },
  { kind: "stream", label: "Event stream", family: "messaging", technologies: ["Kafka", "Kinesis", "Redpanda", "Pulsar"] },
  { kind: "storage", label: "Object storage", family: "storage", technologies: ["S3", "R2", "GCS", "Azure Blob"] },
  { kind: "search", label: "Search index", family: "storage", technologies: ["Elasticsearch", "OpenSearch", "Meilisearch", "Typesense", "Algolia"] },
  { kind: "warehouse", label: "Warehouse", family: "storage", technologies: ["BigQuery", "Snowflake", "Redshift", "ClickHouse", "DuckDB"] },
  { kind: "auth", label: "Identity", family: "security", technologies: ["Auth0", "Clerk", "Cognito", "Keycloak", "Supabase Auth"] },
  { kind: "cdn", label: "CDN", family: "edge", technologies: ["Cloudflare", "CloudFront", "Fastly", "Akamai"] },
  { kind: "cluster", label: "Cluster", family: "platform", technologies: ["Kubernetes", "ECS", "Nomad", "Docker Compose"] },
  { kind: "monitoring", label: "Monitoring", family: "observability", technologies: ["Datadog", "Grafana", "Prometheus", "Sentry", "OpenTelemetry"] },
  { kind: "external", label: "External API", family: "external", technologies: ["GitHub", "Slack", "Twilio", "Google APIs"] },
  { kind: "llm", label: "AI model", family: "ai", technologies: ["Claude", "GPT", "Gemini", "Llama", "Mistral"] },
  { kind: "payment", label: "Payments", family: "external", technologies: ["Stripe", "Adyen", "PayPal", "Paddle"] },
  { kind: "email", label: "Email", family: "external", technologies: ["SES", "SendGrid", "Postmark", "Resend", "Mailgun"] },
  { kind: "user", label: "User", family: "people", technologies: [] },
  { kind: "team", label: "Team", family: "people", technologies: [] },
  { kind: "agent", label: "Agent", family: "ai", technologies: ["Claude Code", "Codex", "Cursor", "LangGraph", "CrewAI"] },
  { kind: "mcp", label: "MCP server", family: "ai", technologies: ["Polterware MCP", "GitHub MCP", "Filesystem MCP", "Postgres MCP"] },
  { kind: "vector", label: "Vector index", family: "ai", technologies: ["pgvector", "Pinecone", "Weaviate", "Qdrant", "Chroma"] },
  { kind: "secrets", label: "Secrets", family: "security", technologies: ["Vault", "AWS Secrets Manager", "Doppler", "1Password", "Infisical"] },
  { kind: "firewall", label: "Firewall", family: "security", technologies: ["Cloudflare WAF", "AWS WAF", "Fastly Next-Gen WAF"] },
  { kind: "kms", label: "Key management", family: "security", technologies: ["AWS KMS", "Google Cloud KMS", "Azure Key Vault", "Vault Transit"] },
  { kind: "logs", label: "Logs", family: "observability", technologies: ["Loki", "Elasticsearch", "CloudWatch Logs", "Datadog Logs", "Better Stack"] },
  { kind: "tracing", label: "Tracing", family: "observability", technologies: ["OpenTelemetry", "Jaeger", "Tempo", "Honeycomb", "Datadog APM"] },
  { kind: "alerting", label: "Alerting", family: "observability", technologies: ["PagerDuty", "Opsgenie", "Alertmanager", "incident.io"] },
  { kind: "pipeline", label: "Pipeline", family: "workflow", technologies: ["Airflow", "Dagster", "dbt", "Fivetran", "Temporal"] },
  { kind: "ci", label: "CI/CD", family: "workflow", technologies: ["GitHub Actions", "GitLab CI", "CircleCI", "Buildkite", "Jenkins"] },
  { kind: "webhook", label: "Webhook", family: "workflow", technologies: ["Stripe webhooks", "GitHub webhooks", "Svix", "Hookdeck"] },
  { kind: "config", label: "Config", family: "document", technologies: ["YAML", "JSON", "TOML", ".env", "Terraform"] },
  { kind: "spec", label: "Spec", family: "document", technologies: ["OpenAPI", "Markdown", "AsyncAPI", "Protobuf", "JSON Schema"] },
  { kind: "dataset", label: "Dataset", family: "document", technologies: ["CSV", "Parquet", "JSON Lines", "Delta Lake", "Iceberg"] },
];

const byKind = new Map(COMPONENTS.map((item) => [item.kind, item]));
export function component(kind: string): ComponentDefinition | undefined { return byKind.get(kind); }
/** The family a component type belongs to; the library offers one generic component per family and the type is picked in the inspector. */
export function family(kind: string): ComponentFamily | undefined { const item = byKind.get(kind); return item ? familyById.get(item.family) : undefined; }
/** System, domain, and component nodes stand for Structure nodes and require a ref (canvas.StructureKinds). */
export const structureKind = (kind: string) => kind === "system" || kind === "domain" || kind === "component";
/** The silhouette a semantic node is drawn in: its family's, or the plain Compute card for Structure nodes. */
export function silhouette(kind: string): ComponentFamily | undefined { return family(kind) ?? (structureKind(kind) ? familyById.get("compute") : undefined); }
