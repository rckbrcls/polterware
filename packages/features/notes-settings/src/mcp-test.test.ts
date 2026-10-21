import { describe, expect, it, vi } from "vitest";
import { testMcpConnection } from "./mcp-test";

describe("Main MCP probe", () => {
  it("calls Main with no port or token and reports its tool count", async () => {
    const probe = vi.fn(async () => ({ ok: true, toolCount: 2 }));
    expect(await testMcpConnection({ testMcpConnection: probe })).toEqual({ ok: true, detail: "Connected. 2 tools listed." });
    expect(probe).toHaveBeenCalledWith();
  });
  it("keeps Main's honest MCP-off failure", async () => {
    const error = "MCP is off. Enable it in Agents > Access, then test again.";
    expect(await testMcpConnection({ testMcpConnection: async () => ({ ok: false, error }) })).toEqual({ ok: false, detail: error });
  });
  it("reports a failed IPC call without claiming success", async () => {
    expect(await testMcpConnection({ testMcpConnection: async () => { throw new Error("Main unavailable"); } })).toEqual({ ok: false, detail: "Main unavailable" });
  });
});
