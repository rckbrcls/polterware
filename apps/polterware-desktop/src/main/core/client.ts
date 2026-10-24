import { createClient, type Client, type Interceptor, type Transport } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  ArchitectureService,
  AgentRunService,
  ChangeService,
  ContextService,
  DispatchService,
  HealthService,
  IntegrationService,
  KnowledgeService,
  MaintenanceService,
  ProjectModelService,
  ProjectService,
  TerminalService,
  WorkService,
} from "@polterware/contracts";

const authInterceptor = (token: string): Interceptor => (next) => async (request) => {
  request.header.set("Authorization", `Bearer ${token}`);
  request.header.set("Polterware-Client", "desktop");
  return next(request);
};

export type CoreClients = {
  health: Client<typeof HealthService>;
  maintenance: Client<typeof MaintenanceService>;
  projects: Client<typeof ProjectService>;
  architecture: Client<typeof ArchitectureService>;
  knowledge: Client<typeof KnowledgeService>;
  work: Client<typeof WorkService>;
  canon: Client<typeof ProjectModelService>;
  context: Client<typeof ContextService>;
  agentRuns: Client<typeof AgentRunService>;
  dispatch: Client<typeof DispatchService>;
  integrations: Client<typeof IntegrationService>;
  terminals: Client<typeof TerminalService>;
  changes: Client<typeof ChangeService>;
};

export function createCoreTransport(endpoint: string, token: string): Transport {
  return createConnectTransport({
    baseUrl: endpoint,
    httpVersion: "1.1",
    interceptors: [authInterceptor(token)],
  });
}

export function createCoreClients(endpoint: string, token: string): CoreClients {
  const transport = createCoreTransport(endpoint, token);
  return {
    health: createClient(HealthService, transport),
    maintenance: createClient(MaintenanceService, transport),
    projects: createClient(ProjectService, transport),
    architecture: createClient(ArchitectureService, transport),
    knowledge: createClient(KnowledgeService, transport),
    work: createClient(WorkService, transport),
    canon: createClient(ProjectModelService, transport),
    context: createClient(ContextService, transport),
    agentRuns: createClient(AgentRunService, transport),
    dispatch: createClient(DispatchService, transport),
    integrations: createClient(IntegrationService, transport),
    terminals: createClient(TerminalService, transport),
    changes: createClient(ChangeService, transport),
  };
}

export async function waitForHealth(clients: CoreClients): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await clients.health.check({});
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Polterware core health check failed.");
}

function bytesToBase64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

function sanitizeForIpc(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  // Buffer extends Uint8Array; convert before JSON.stringify (Buffer.toJSON would otherwise emit {type,data}).
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    return bytesToBase64(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForIpc(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeForIpc(nested);
    }
    return out;
  }
  return value;
}

export function toJsonObject(value: unknown): Record<string, unknown> {
  return sanitizeForIpc(value ?? {}) as Record<string, unknown>;
}

/** Decode base64 protobuf bytes payloads coming from the renderer over IPC. */
export function decodeBase64Bytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (typeof value !== "string" || value.length === 0) return undefined;
  return new Uint8Array(Buffer.from(value, "base64"));
}
