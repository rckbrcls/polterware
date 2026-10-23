import { app } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface KnownHostEntry {
  fingerprint: string;
}

type KnownHostsStore = Record<string, KnownHostEntry>;

function storePath(): string {
  return join(app.getPath("userData"), "known_hosts.json");
}

function load(): KnownHostsStore {
  const path = storePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as KnownHostsStore;
  } catch {
    return {};
  }
}

function save(data: KnownHostsStore): void {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  writeFileSync(storePath(), JSON.stringify(data, null, 2), "utf8");
}

export function hostKey(host: string, port: number): string {
  return `${host}:${port}`;
}

export function getKnownFingerprint(host: string, port: number): string | null {
  const entry = load()[hostKey(host, port)];
  return entry?.fingerprint ?? null;
}

export function setKnownFingerprint(host: string, port: number, fingerprint: string): void {
  const data = load();
  data[hostKey(host, port)] = { fingerprint };
  save(data);
}

export function verifyFingerprint(
  host: string,
  port: number,
  fingerprint: string,
): "new" | "ok" | "mismatch" {
  const known = getKnownFingerprint(host, port);
  if (!known) return "new";
  if (known === fingerprint) return "ok";
  return "mismatch";
}

export function listKnownHosts(): import("../shared/bridge.js").KnownHost[] {
  const data: unknown = load();
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data).flatMap(([key, entry]) =>
    entry && typeof entry === "object" && typeof entry.fingerprint === "string"
      ? [{ key, fingerprint: entry.fingerprint }] : []);
}

export function removeKnownHost(key: string): void {
  if (typeof key !== "string") throw new Error("Invalid known host key");
  const data = Object.fromEntries(listKnownHosts().filter((entry) => entry.key !== key).map((entry) => [entry.key, { fingerprint: entry.fingerprint }]));
  save(data);
}
