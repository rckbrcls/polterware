import { readFileSync } from "node:fs";
import type { ConnectConfig } from "ssh2";

export interface SshAuth {
  password?: string;
  privateKeyPath?: string;
  privateKeyPassphrase?: string;
  /** ssh-agent socket (or Windows named pipe); keys never leave the agent. */
  agent?: string;
}

const WINDOWS_OPENSSH_AGENT_PIPE = "\\\\.\\pipe\\openssh-ssh-agent";

/** The local ssh-agent: SSH_AUTH_SOCK, else the Windows OpenSSH agent pipe. */
export function resolveAgentSocket(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const sock = env.SSH_AUTH_SOCK?.trim();
  if (sock) return sock;
  if (platform === "win32") return WINDOWS_OPENSSH_AGENT_PIPE;
  return null;
}

export function applySshAuth(config: ConnectConfig, auth: SshAuth): ConnectConfig {
  if (auth.agent) config.agent = auth.agent;
  if (auth.password) config.password = auth.password;
  if (auth.privateKeyPath) {
    config.privateKey = readFileSync(auth.privateKeyPath, "utf8");
    if (auth.privateKeyPassphrase) config.passphrase = auth.privateKeyPassphrase;
  }
  return config;
}
