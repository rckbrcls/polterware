import { describe, expect, it, vi } from "vitest";
import { mcpProbePublicResult, probeMcpConnection } from "./mcp-probe.js";

describe("MCP connection probe", () => {
  it("reports disabled MCP without calling the network", async () => {
    const fetchImpl = vi.fn();
    await expect(probeMcpConnection({ enabled: false, port: 47600, token: "live-token", fetchImpl })).resolves.toEqual({
      ok: false, error: "MCP is disabled. Enable it in Settings → Agents, then test again.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not return the token on success or failure", async () => {
    const token = "super-secret-mcp-token";
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      if (init.body.includes("initialize") && !init.body.includes("notifications/initialized")) {
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }) };
      }
      if (init.body.includes("tools/list")) {
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "a" }, { name: "b" }] } }) };
      }
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => "" };
    });
    const ok = await probeMcpConnection({ enabled: true, port: 47600, token, fetchImpl });
    expect(ok).toEqual({ ok: true, toolCount: 2 });
    expect(JSON.stringify(ok)).not.toContain(token);
    const denied = await probeMcpConnection({
      enabled: true, port: 47600, token,
      fetchImpl: vi.fn(async () => ({ ok: false, status: 401, headers: { get: () => null }, text: async () => `unauthorized ${token}` })),
    });
    expect(denied.ok).toBe(false);
    expect(JSON.stringify(denied)).not.toContain(token);
  });

  it("parses the complete tool catalog before redacting public errors", async () => {
    const token = "secret-token";
    const tools = Array.from({ length: 18 }, (_, i) => ({ name: `tool_${i}`, description: "x".repeat(300) }));
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => ({
      ok: true, status: 200, headers: { get: () => null },
      text: async () => JSON.stringify({ result: init.body.includes("tools/list") ? { tools } : {} }),
    }));
    const result = await probeMcpConnection({ enabled: true, port: 47600, token, fetchImpl });
    expect(result).toEqual({ ok: true, toolCount: 18 });
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("returns a clear error when MCP is unreachable", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:9"); });
    await expect(probeMcpConnection({ enabled: true, port: 9, token: "t", fetchImpl })).resolves.toEqual({
      ok: false, error: "MCP is unreachable.",
    });
    expect(mcpProbePublicResult({ ok: true, toolCount: 3, error: "nope" })).toEqual({ ok: true, toolCount: 3 });
  });
});
