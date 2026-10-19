import { describe, expect, it } from "vitest";
import { mcpSnippets } from "./snippets";

describe("MCP snippet generator", () => {
  it.each([
    {
      name: "runtime defaults (pwnotes on PATH)",
      input: { port: 47600, token: "secret-token" },
      claudeStdio: "claude mcp add pwnotes -- pwnotes mcp",
      claudeHttp: 'claude mcp add --transport http pwnotes http://127.0.0.1:47600/mcp --header "Authorization: Bearer secret-token"',
      cursorStdio: '{"command":"pwnotes","args":["mcp"]}',
      cursorHttp: '{"url":"http://127.0.0.1:47600/mcp","headers":{"Authorization":"Bearer secret-token"}}',
    },
    {
      name: "packaged binary from 04-mcp.md",
      input: { port: 47600, token: "<mcp-token>", command: "/Applications/Polterware Notes.app/Contents/Resources/pwnotes" },
      claudeStdio: "claude mcp add pwnotes -- '/Applications/Polterware Notes.app/Contents/Resources/pwnotes' mcp",
      claudeHttp: 'claude mcp add --transport http pwnotes http://127.0.0.1:47600/mcp --header "Authorization: Bearer <mcp-token>"',
      cursorStdio: '{"command":"/Applications/Polterware Notes.app/Contents/Resources/pwnotes","args":["mcp"]}',
      cursorHttp: '{"url":"http://127.0.0.1:47600/mcp","headers":{"Authorization":"Bearer <mcp-token>"}}',
    },
    {
      name: "custom port",
      input: { port: 48001, token: "abc" },
      claudeStdio: "claude mcp add pwnotes -- pwnotes mcp",
      claudeHttp: 'claude mcp add --transport http pwnotes http://127.0.0.1:48001/mcp --header "Authorization: Bearer abc"',
      cursorStdio: '{"command":"pwnotes","args":["mcp"]}',
      cursorHttp: '{"url":"http://127.0.0.1:48001/mcp","headers":{"Authorization":"Bearer abc"}}',
    },
  ])("$name", ({ input, claudeStdio, claudeHttp, cursorStdio, cursorHttp }) => {
    const snippets = mcpSnippets(input);
    expect(snippets.claudeStdio).toBe(claudeStdio);
    expect(snippets.claudeHttp).toBe(claudeHttp);
    expect(snippets.cursorStdioJson).toBe(cursorStdio);
    expect(snippets.cursorHttpJson).toBe(cursorHttp);
    expect(JSON.parse(snippets.cursorStdioJson)).toEqual({ command: input.command ?? "pwnotes", args: ["mcp"] });
    expect(JSON.parse(snippets.cursorHttpJson)).toEqual({ url: snippets.httpUrl, headers: { Authorization: `Bearer ${input.token}` } });
    expect(JSON.parse(snippets.cursorConfig)).toEqual({ mcpServers: { pwnotes: JSON.parse(snippets.cursorStdioJson) } });
    expect(JSON.parse(snippets.claudeDesktopStdio)).toEqual({ mcpServers: { pwnotes: JSON.parse(snippets.cursorStdioJson) } });
    expect(JSON.parse(snippets.claudeDesktopHttp)).toEqual({ mcpServers: { pwnotes: JSON.parse(snippets.cursorHttpJson) } });
  });

  it("uses a placeholder when the token is empty", () => {
    const snippets = mcpSnippets({ port: 47600, token: "" });
    expect(snippets.claudeHttp).toContain("Bearer <mcp-token>");
    expect(JSON.parse(snippets.cursorHttpJson).headers.Authorization).toBe("Bearer <mcp-token>");
  });
});
