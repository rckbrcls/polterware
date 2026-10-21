import { spawn, type ChildProcess } from "node:child_process";
import {
  resolveCliBinaryPath,
  resolveRepositoryRoot,
  resolveUserDatabasePath,
} from "./core/process-supervisor.js";
import type { McpServerStatus } from "../shared/mcp-status.js";

export type McpSupervisor = {
  getStatus(): McpServerStatus;
  start(): Promise<McpServerStatus>;
  stop(): Promise<McpServerStatus>;
};

function buildLaunch(): { command: string; args: string[]; cwd?: string; display: string } {
  const dbPath = resolveUserDatabasePath();
  const binary = resolveCliBinaryPath();
  if (binary) {
    return {
      command: binary,
      args: ["-db", dbPath, "mcp"],
      display: `${binary} -db ${JSON.stringify(dbPath)} mcp`,
    };
  }
  const cwd = resolveRepositoryRoot();
  return {
    command: "go",
    args: ["run", "./backend/runtimes/cli", "-db", dbPath, "mcp"],
    cwd,
    display: `go run ./backend/runtimes/cli -db ${JSON.stringify(dbPath)} mcp`,
  };
}

function cursorConfigSnippet(dbPath: string): string {
  const binary = resolveCliBinaryPath();
  const config = binary
          ? {
                mcpServers: {
                  polterware: {
                    command: binary,
                    args: ["-db", dbPath, "mcp"],
                  },
                },
              }
            : {
                mcpServers: {
                  polterware: {
                    command: "go",
                    args: ["run", "./backend/runtimes/cli", "-db", dbPath, "mcp"],
                    cwd: resolveRepositoryRoot(),
                  },
                },
              };
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** Owns an optional local `polterware mcp` helper process (stdio kept open). */
export function createMcpSupervisor(options?: {
  log?: (message: string) => void;
}): McpSupervisor {
  let child: ChildProcess | undefined;

  const status = (): McpServerStatus => {
    const launch = buildLaunch();
    const dbPath = resolveUserDatabasePath();
    const running = Boolean(child && child.exitCode === null && !child.killed);
    return {
      running,
      pid: running && child?.pid ? child.pid : null,
      dbPath,
      command: launch.display,
      cursorConfig: cursorConfigSnippet(dbPath),
    };
  };

  const stop = async (): Promise<McpServerStatus> => {
    const current = child;
    child = undefined;
    if (!current || current.killed || current.exitCode !== null) {
      return status();
    }
    await new Promise<void>((resolveStop) => {
      const timer = setTimeout(() => {
        if (!current.killed) current.kill("SIGKILL");
        resolveStop();
      }, 2000);
      current.once("exit", () => {
        clearTimeout(timer);
        resolveStop();
      });
      current.kill("SIGTERM");
    });
    return status();
  };

  const start = async (): Promise<McpServerStatus> => {
    if (child && child.exitCode === null && !child.killed) {
      return status();
    }
    const launch = buildLaunch();
    const next = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env: { ...process.env },
      // Keep stdin open so the stdio MCP server stays parked until stop().
      stdio: ["pipe", "ignore", "pipe"],
    });
    child = next;
    next.stderr?.on("data", (chunk: Buffer) => {
      options?.log?.(chunk.toString("utf8").trim());
    });
    next.once("exit", (code) => {
      options?.log?.(`MCP helper exited (code ${code ?? "unknown"}).`);
      if (child === next) child = undefined;
    });
    next.once("error", (error) => {
      options?.log?.(`MCP helper failed to start: ${error.message}`);
      if (child === next) child = undefined;
    });
    // Brief settle so immediate status reads see a live pid when spawn succeeded.
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (next.exitCode !== null) {
      child = undefined;
      throw new Error("MCP helper exited immediately. Check the core binary and database path.");
    }
    return status();
  };

  return { getStatus: status, start, stop };
}
