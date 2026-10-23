#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# static electron isolation checks
node --input-type=module <<'NODE'
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const win = readFileSync(join(root, "apps/polterware-desktop/src/main/window.ts"), "utf8");
if (!win.includes("contextIsolation: true") || !win.includes("nodeIntegration: false")) process.exit(1);
const bridge = readFileSync(join(root, "apps/polterware-desktop/src/preload/bridge.ts"), "utf8");
if (!bridge.includes("contextBridge.exposeInMainWorld")) process.exit(1);
const html = readFileSync(join(root, "apps/polterware-desktop/src/renderer/index.html"), "utf8");
if (!html.includes("Content-Security-Policy")) process.exit(1);
console.log("electron isolation static checks OK");
NODE
