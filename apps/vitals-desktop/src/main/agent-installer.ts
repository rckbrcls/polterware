import { createHash, randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Client, SFTPWrapper } from "ssh2";

export type AgentArch = "amd64" | "arm64";
export type AgentOS = "linux" | "darwin" | "windows";

export interface AgentTarget {
  os: AgentOS;
  arch: AgentArch;
}

export class UnsupportedArchError extends Error {
  readonly code = "unsupported_arch" as const;

  constructor(readonly uname: string) {
    super(`Unsupported remote platform: ${uname}`);
    this.name = "UnsupportedArchError";
  }
}

/** Map `uname -m` to the bundled agent arch. Only x86_64 and aarch64/arm64 are supported. */
export function mapUnameArch(uname: string): AgentArch {
  switch (uname.trim()) {
    case "x86_64":
    case "amd64":
      return "amd64";
    case "aarch64":
    case "arm64":
      return "arm64";
    default:
      throw new UnsupportedArchError(uname.trim());
  }
}

/** Map `uname -sm` output ("Linux x86_64", "Darwin arm64") to an agent target. */
export function mapUnameTarget(uname: string): AgentTarget {
  const [system = "", machine = ""] = uname.trim().split(/\s+/);
  const os = system === "Linux" ? "linux" : system === "Darwin" ? "darwin" : null;
  if (!os) throw new UnsupportedArchError(uname.trim());
  return { os, arch: mapUnameArch(machine) };
}

/** Map Windows `%PROCESSOR_ARCHITECTURE%` (AMD64, ARM64) to an agent target. */
export function mapWindowsTarget(processorArchitecture: string): AgentTarget {
  switch (processorArchitecture.trim().toUpperCase()) {
    case "AMD64":
      return { os: "windows", arch: "amd64" };
    case "ARM64":
      return { os: "windows", arch: "arm64" };
    default:
      throw new UnsupportedArchError(`Windows ${processorArchitecture.trim()}`);
  }
}

export function agentBinaryFileName(target: AgentTarget): string {
  const ext = target.os === "windows" ? ".exe" : "";
  return `vitals-agent-${target.os}-${target.arch}${ext}`;
}

export function resolveLocalAgentBinary(
  target: AgentTarget,
  options: { appPath: string; resourcesPath: string; packaged: boolean },
): string {
  const name = agentBinaryFileName(target);
  if (options.packaged) {
    return join(options.resourcesPath, "agent", name);
  }
  return join(options.appPath, "resources", "agent", name);
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function remoteAgentCachePath(home: string, sha256Hex: string): string {
  const short = sha256Hex.slice(0, 12);
  return `${home.replace(/\/$/, "")}/.cache/vitals/agent-${short}`;
}

/** Native Windows path under %LOCALAPPDATA%\Vitals. */
export function windowsAgentPath(localAppData: string, sha256Hex: string): string {
  const short = sha256Hex.slice(0, 12);
  return `${localAppData.replace(/[\\/]+$/, "")}\\Vitals\\agent-${short}.exe`;
}

/** Windows OpenSSH SFTP addresses drive paths as /C:/dir/file. */
export function windowsSftpPath(nativePath: string): string {
  return `/${nativePath.replace(/\\/g, "/")}`;
}

/**
 * Exec command for the agent. On Windows `cmd /c` runs the binary whether
 * the account's OpenSSH shell is cmd or PowerShell.
 */
export function agentExecCommand(os: AgentOS, remotePath: string): string {
  if (os === "windows") return `cmd /c "${remotePath}"`;
  return shellQuote(remotePath);
}

function execCapture(client: Client, command: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let stdout = "";
      stream
        .on("close", (code: number) => {
          resolve({ stdout, code: code ?? 0 });
        })
        .on("data", (d: Buffer) => {
          stdout += d.toString("utf8");
        });
      stream.stderr.on("data", () => {
        /* ignore */
      });
      stream.on("error", reject);
    });
  });
}

function openSftp(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) reject(err);
      else resolve(sftp);
    });
  });
}

function sftpStat(sftp: SFTPWrapper, path: string): Promise<{ size: number } | null> {
  return new Promise((resolve) => {
    sftp.stat(path, (err, stats) => {
      if (err || !stats) {
        resolve(null);
        return;
      }
      resolve({ size: stats.size });
    });
  });
}

function sftpFastPut(sftp: SFTPWrapper, localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function sftpMkdir(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve) => {
    // An existing directory is the common case; a real failure surfaces on upload.
    sftp.mkdir(path, () => resolve());
  });
}

function sftpUnlink(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve) => {
    // A missing file is fine: callers only need the path to be free.
    sftp.unlink(path, () => resolve());
  });
}

function sftpRename(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.rename(from, to, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** Atomic replace via posix-rename when the server has it; plain rename needs a free target. */
async function sftpReplace(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      sftp.ext_openssh_rename(from, to, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return;
  } catch {
    // Unsupported extension (Windows OpenSSH and others): fall back below.
  }
  await sftpUnlink(sftp, to);
  await sftpRename(sftp, from, to);
}

/** Parse the first 64-char hex digest from sha256sum, shasum or certutil output. */
export function parseSha256Output(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const first = line.trim().split(/\s+/)[0] ?? "";
    if (/^[0-9a-f]{64}$/i.test(first)) return first.toLowerCase();
    // Older certutil prints the digest as space-separated byte pairs.
    const joined = line.replace(/\s+/g, "");
    if (/^[0-9a-f]{64}$/i.test(joined)) return joined.toLowerCase();
  }
  return null;
}

export function remoteSha256Command(os: AgentOS, remotePath: string): string {
  if (os === "windows") return `cmd /c certutil -hashfile "${remotePath}" SHA256`;
  const p = shellQuote(remotePath);
  return `sha256sum ${p} 2>/dev/null || shasum -a 256 ${p} 2>/dev/null`;
}

/** Null when the host has no hash tool; the caller then re-uploads. */
async function remoteSha256(client: Client, os: AgentOS, remotePath: string): Promise<string | null> {
  const result = await execCapture(client, remoteSha256Command(os, remotePath));
  if (result.code !== 0) return null;
  return parseSha256Output(result.stdout);
}

function sftpChmod(sftp: SFTPWrapper, path: string, mode: number): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.chmod(path, mode, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export interface InstallAgentResult {
  remotePath: string;
  /** Command line that starts the agent over an exec channel. */
  command: string;
  target: AgentTarget;
  sha256: string;
  uploaded: boolean;
}

export interface InstallAgentOptions {
  appPath: string;
  resourcesPath: string;
  packaged: boolean;
}

async function detectTarget(client: Client): Promise<AgentTarget> {
  const uname = await execCapture(client, "uname -sm");
  if (uname.code === 0 && uname.stdout.trim()) {
    return mapUnameTarget(uname.stdout);
  }
  // No uname: Windows OpenSSH (cmd or PowerShell as the default shell).
  const win = await execCapture(client, "cmd /c echo %PROCESSOR_ARCHITECTURE%");
  if (win.code !== 0 || !win.stdout.trim()) {
    throw new Error(`uname -sm failed with code ${uname.code}`);
  }
  return mapWindowsTarget(firstLine(win.stdout));
}

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/)[0]?.trim() ?? "";
}

/**
 * Detect the remote OS and arch and ensure the matching bundled agent is
 * cached on the host: ~/.cache/vitals/agent-<sha12> (mode 0700, in a 0700
 * directory) on Linux and macOS, %LOCALAPPDATA%\Vitals\agent-<sha12>.exe on
 * Windows. A cached binary is reused only when its SHA-256 matches; otherwise
 * it is uploaded to a temporary name and renamed into place, so a partial or
 * tampered file is never executed.
 */
export async function installAgent(
  client: Client,
  options: InstallAgentOptions,
): Promise<InstallAgentResult> {
  const target = await detectTarget(client);

  const localPath = resolveLocalAgentBinary(target, options);
  const localStat = statSync(localPath);
  const sha256 = sha256File(localPath);
  const size = localStat.size;

  let remotePath: string;
  let sftpPath: string;
  let sftpDir: string | null = null;
  if (target.os === "windows") {
    const local = firstLine((await execCapture(client, "cmd /c echo %LOCALAPPDATA%")).stdout);
    if (!local || local.includes("%")) {
      throw new Error("Could not resolve remote LOCALAPPDATA");
    }
    remotePath = windowsAgentPath(local, sha256);
    sftpPath = windowsSftpPath(remotePath);
    sftpDir = sftpPath.slice(0, sftpPath.lastIndexOf("/"));
  } else {
    const homeResult = await execCapture(client, 'printenv HOME || echo "$HOME"');
    const home = firstLine(homeResult.stdout);
    if (!home) {
      throw new Error("Could not resolve remote HOME");
    }
    const dir = shellQuote(`${home}/.cache/vitals`);
    await execCapture(client, `mkdir -p ${dir} && chmod 700 ${dir}`);
    remotePath = remoteAgentCachePath(home, sha256);
    sftpPath = remotePath;
  }
  const command = agentExecCommand(target.os, remotePath);

  const sftp = await openSftp(client);
  try {
    if (sftpDir) await sftpMkdir(sftp, sftpDir);

    // The size check only skips the hash exec when the file obviously differs.
    const existing = await sftpStat(sftp, sftpPath);
    const cached = existing?.size === size && (await remoteSha256(client, target.os, remotePath)) === sha256;
    if (!cached) {
      const tmpPath = `${sftpPath}.${randomBytes(4).toString("hex")}.tmp`;
      try {
        await sftpFastPut(sftp, localPath, tmpPath);
        if (target.os !== "windows") await sftpChmod(sftp, tmpPath, 0o700);
        await sftpReplace(sftp, tmpPath, sftpPath);
      } catch (err) {
        await sftpUnlink(sftp, tmpPath);
        throw err;
      }
    }
    return { remotePath, command, target, sha256, uploaded: !cached };
  } finally {
    sftp.end();
  }
}

function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}
