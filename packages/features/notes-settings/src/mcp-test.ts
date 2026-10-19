import type { SettingsBridge } from "./model";
import { errorText } from "./model";

export type McpTestResult = { ok: boolean; detail: string };

/** Main owns the authenticated probe; only its safe result reaches the renderer. */
export async function testMcpConnection(app: Pick<SettingsBridge["app"], "testMcpConnection">): Promise<McpTestResult> {
  try {
    const result = await app.testMcpConnection();
    return {
      ok: result.ok,
      detail: result.ok
        ? `Connected.${result.toolCount === undefined ? "" : ` ${result.toolCount} tools listed.`}`
        : result.error || "MCP connection failed.",
    };
  } catch (error) {
    return { ok: false, detail: errorText(error) || "MCP connection failed." };
  }
}
