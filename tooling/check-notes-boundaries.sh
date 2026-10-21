#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0

DOMAINS="$ROOT/notes/backend/domains"
if [[ -d "$DOMAINS" ]]; then
  bad=$(rg -n 'modernc.org/sqlite|github.com/mattn/go-sqlite3|connectrpc.com/connect|github.com/jackc/pgx|electron|"database/sql"' \
    "$DOMAINS" --glob '*.go' 2>/dev/null || true)
  if echo "$bad" | rg -q .; then
    echo "FAIL: Polterware Notes domains import concrete infrastructure:"
    echo "$bad"
    fail=1
  fi
fi

if rg -n "from ['\"]electron['\"]|require\\(['\"]electron['\"]\\)" \
  "$ROOT/packages/frontend" "$ROOT/packages/features/notes-"* \
  --glob '*.{ts,tsx}' 2>/dev/null | rg -v 'node_modules' | rg -q .; then
  echo "FAIL: electron import outside notes-desktop"
  fail=1
fi

if rg -n "from ['\"]react['\"]|from ['\"]react-dom['\"]" \
  "$ROOT/apps/notes-desktop" "$ROOT/packages/features/notes-"* "$ROOT/packages/notes-contracts" "$ROOT/packages/frontend/map" \
  --glob '*.{ts,tsx}' 2>/dev/null | rg -v 'node_modules' | rg -q .; then
  echo "FAIL: React import in Polterware Notes packages"
  fail=1
fi

notes_features=("$ROOT/packages/features"/notes-*)
for feature_dir in "${notes_features[@]}"; do
  [[ -d "$feature_dir" ]] || continue
  name=$(basename "$feature_dir")
  if [[ "$name" == "notes-shell" ]]; then
    continue
  fi
  if rg -n "from ['\"]@polterware/feature-notes-[^'\"]+/(?!feature)" \
    "$feature_dir/src" --glob '*.{ts,tsx}' 2>/dev/null | rg -v 'node_modules' | rg -q .; then
    echo "FAIL: cross-feature deep import in $name"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  exit 1
fi
echo "OK: Polterware Notes boundaries"
