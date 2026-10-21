/** Local experimental MCP helper status exposed to the renderer. */
export type McpServerStatus = {
  running: boolean;
  pid: number | null;
  dbPath: string;
  command: string;
  cursorConfig: string;
};
