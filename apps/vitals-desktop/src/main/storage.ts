import { app, safeStorage } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AuthMode, SavedServerPublic } from "../shared/bridge.js";

interface SavedServerRecord extends SavedServerPublic {
  secretEnc?: string;
}

interface ServerStore {
  servers: SavedServerRecord[];
}

interface ServerSecrets {
  password?: string;
  privateKeyPassphrase?: string;
}

function storePath(): string {
  return join(app.getPath("userData"), "servers.json");
}

function loadStore(): ServerStore {
  const path = storePath();
  if (!existsSync(path)) return { servers: [] };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ServerStore;
  } catch {
    return { servers: [] };
  }
}

function saveStore(store: ServerStore): void {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  writeFileSync(storePath(), JSON.stringify(store, null, 2), "utf8");
}

function encryptSecret(secrets: ServerSecrets): string | undefined {
  if (!safeStorage.isEncryptionAvailable()) return undefined;
  const json = JSON.stringify(secrets);
  if (json === "{}") return undefined;
  const buf = safeStorage.encryptString(json);
  return buf.toString("base64");
}

function decryptSecret(enc: string | undefined): ServerSecrets {
  if (!enc || !safeStorage.isEncryptionAvailable()) return {};
  try {
    const json = safeStorage.decryptString(Buffer.from(enc, "base64"));
    return JSON.parse(json) as ServerSecrets;
  } catch {
    return {};
  }
}

export function listServersPublic(): SavedServerPublic[] {
  return loadStore().servers.map(({ secretEnc: _, ...rest }) => rest);
}

export function upsertServer(
  input: Omit<SavedServerPublic, "id"> & { id?: string },
  secrets: ServerSecrets,
): SavedServerPublic {
  const store = loadStore();
  const id = input.id ?? randomUUID();
  const secretEnc = encryptSecret(secrets);
  const record: SavedServerRecord = {
    id,
    label: input.label,
    host: input.host,
    port: input.port,
    username: input.username,
    authMode: input.authMode,
    privateKeyPath: input.privateKeyPath,
    secretEnc,
  };
  const idx = store.servers.findIndex((s) => s.id === id);
  if (idx >= 0) store.servers[idx] = record;
  else store.servers.push(record);
  saveStore(store);
  const { secretEnc: _, ...pub } = record;
  return pub;
}

export function deleteServer(id: string): void {
  const store = loadStore();
  store.servers = store.servers.filter((s) => s.id !== id);
  saveStore(store);
}

export function getServerSecrets(id: string): ServerSecrets | null {
  const rec = loadStore().servers.find((s) => s.id === id);
  if (!rec) return null;
  return decryptSecret(rec.secretEnc);
}

export function getServerById(id: string): SavedServerPublic | null {
  const rec = loadStore().servers.find((s) => s.id === id);
  if (!rec) return null;
  const { secretEnc: _, ...pub } = rec;
  return pub;
}

export type { ServerSecrets };
