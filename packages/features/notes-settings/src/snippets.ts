export type McpSnippetInput = {
  port: number;
  token: string;
  command?: string;
};

export type McpSnippets = {
  command: string;
  token: string;
  httpUrl: string;
  claudeStdio: string;
  claudeHttp: string;
  cursorStdioJson: string;
  cursorHttpJson: string;
  cursorConfig: string;
  claudeDesktopStdio: string;
  claudeDesktopHttp: string;
};

/** Single-quotes a command path that a shell would split, such as one inside "Polterware Notes.app". */
function shellArg(value: string): string {
  return /[\s'"\\$`]/.test(value) ? `'${value.replaceAll("'", `'\\''`)}'` : value;
}

function compact(value: unknown): string {
  return JSON.stringify(value);
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Copy-paste MCP client configs matching 04-mcp.md and the pwnotes runtime GetInfo shapes. */
export function mcpSnippets(input: McpSnippetInput): McpSnippets {
  const command = input.command?.trim() || "pwnotes";
  const token = input.token.trim() || "<mcp-token>";
  const port = Number.isInteger(input.port) && input.port > 0 ? input.port : 47600;
  const httpUrl = `http://127.0.0.1:${port}/mcp`;
  const stdio = { command, args: ["mcp"] };
  const http = { url: httpUrl, headers: { Authorization: `Bearer ${token}` } };
  const wrappedStdio = { mcpServers: { pwnotes: stdio } };
  const wrappedHttp = { mcpServers: { pwnotes: http } };
  return {
    command,
    token,
    httpUrl,
    claudeStdio: `claude mcp add pwnotes -- ${shellArg(command)} mcp`,
    claudeHttp: `claude mcp add --transport http pwnotes ${httpUrl} --header "Authorization: Bearer ${token}"`,
    cursorStdioJson: compact(stdio),
    cursorHttpJson: compact(http),
    cursorConfig: pretty(wrappedStdio),
    claudeDesktopStdio: pretty(wrappedStdio),
    claudeDesktopHttp: pretty(wrappedHttp),
  };
}
