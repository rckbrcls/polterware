#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "--core-only" ]]; then
  DB_PATH="${POLTERWARE_DEV_DB:-$ROOT/.data/dev-local.db}"
  mkdir -p "$(dirname "$DB_PATH")"
  exec go run ./backend/runtimes/cli -db "$DB_PATH" serve
fi

if [[ $# -gt 0 ]]; then
  echo "Usage: ./scripts/dev.sh [--core-only]" >&2
  exit 1
fi

exec pnpm dev:polterware
