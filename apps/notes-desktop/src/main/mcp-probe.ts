export type McpProbeResult = { ok: boolean; toolCount?: number; error?: string };

type FetchLike = (input: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

function rpc(id: number, method: string, params?: Record<string, unknown>): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

function parseRpc(body: string): { error?: { message?: string }; result?: { tools?: unknown[] } } {
  const trimmed = body.trim();
  const jsonLine = trimmed.startsWith("data:")
    ? trimmed.split("\n").find(line => line.startsWith("data:"))?.slice(5).trim() ?? ""
    : trimmed;
  try {
    return JSON.parse(jsonLine) as { error?: { message?: string }; result?: { tools?: unknown[] } };
  } catch {
    return { error: { message: "The MCP server returned unreadable JSON." } };
  }
}

function scrub(text: string, token: string): string {
  let next = text;
  if (token) next = next.split(token).join("[redacted]");
  return next.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").trim().slice(0, 300);
}

export async function probeMcpConnection(input: {
  enabled: boolean;
  port: number;
  token: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<McpProbeResult> {
  if (!input.enabled) return { ok: false, error: "MCP is disabled. Enable it in Settings → Agents, then test again." };
  const port = Number.isInteger(input.port) && input.port > 0 && input.port <= 65535 ? input.port : 0;
  if (!port) return { ok: false, error: "MCP port is invalid." };
  if (!input.token.trim()) return { ok: false, error: "MCP token is missing. Rotate the token, then test again." };
  const fetchImpl = input.fetchImpl ?? fetch as FetchLike;
  const timeoutMs = input.timeoutMs ?? 3000;
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${input.token}`,
  };
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const init = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      signal,
      body: rpc(1, "initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "notes-desktop", version: "0" },
      }),
    });
    const initBody = await init.text();
    if (initBody.length > 8 * 1024 * 1024) return { ok: false, error: "MCP response is too large." };
    if (init.status === 403 || /MCP is disabled/i.test(initBody)) {
      return { ok: false, error: "MCP is disabled. Enable it in Settings → Agents, then test again." };
    }
    if (init.status === 401) return { ok: false, error: "The MCP token was rejected. Rotate the token and try again." };
    if (!init.ok) return { ok: false, error: scrub(initBody, input.token) || `MCP initialize failed (${init.status}).` };
    const initialized = parseRpc(initBody);
    if (initialized.error?.message) return { ok: false, error: scrub(initialized.error.message, input.token) };
    const session = init.headers.get("mcp-session-id");
    if (session) headers["Mcp-Session-Id"] = session;
    await fetchImpl(endpoint, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }).catch(() => undefined);
    const listed = await fetchImpl(endpoint, { method: "POST", headers, signal, body: rpc(2, "tools/list") });
    const listedBody = await listed.text();
    if (listedBody.length > 8 * 1024 * 1024) return { ok: false, error: "MCP response is too large." };
    if (!listed.ok) return { ok: false, error: scrub(listedBody, input.token) || `MCP tools/list failed (${listed.status}).` };
    const parsed = parseRpc(listedBody);
    if (parsed.error?.message) return { ok: false, error: scrub(parsed.error.message, input.token) };
    return { ok: true, toolCount: parsed.result?.tools?.length ?? 0 };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, error: "MCP did not respond in time." };
    return { ok: false, error: "MCP is unreachable." };
  }
}

export function mcpProbePublicResult(result: McpProbeResult): McpProbeResult {
  if (result.ok) return { ok: true, toolCount: result.toolCount ?? 0 };
  return { ok: false, error: result.error || "MCP is unreachable." };
}
