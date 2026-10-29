#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0

die() {
  echo "FAIL: $*"
  fail=1
}

# Forbidden legacy trees / packages on disk
for p in legacy packages/core packages/ui apps/polterware-desktop/src/renderer-solid; do
  if [[ -e "$ROOT/$p" ]]; then
    die "forbidden path still present: $p"
  fi
done

# Product desktop must not depend on React
if [[ -f "$ROOT/apps/polterware-desktop/package.json" ]]; then
  if node -e "
    const p=require('$ROOT/apps/polterware-desktop/package.json');
    const d={...p.dependencies||{},...p.devDependencies||{}};
    if (d.react || d['react-dom']) process.exit(2);
  "; then
    :
  else
    code=$?
    if [[ $code -eq 2 ]]; then
      die "apps/polterware-desktop must not depend on react/react-dom"
    else
      die "could not parse apps/polterware-desktop/package.json"
    fi
  fi
fi

# Official Solid entry only
if [[ ! -f "$ROOT/apps/polterware-desktop/src/renderer/main.tsx" ]]; then
  die "missing apps/polterware-desktop/src/renderer/main.tsx"
fi
if ! rg -q 'src/renderer' "$ROOT/apps/polterware-desktop/electron.vite.config.ts" 2>/dev/null; then
  die "electron.vite.config.ts must point at src/renderer"
fi
if rg -q 'renderer-solid' "$ROOT/apps/polterware-desktop/electron.vite.config.ts" 2>/dev/null; then
  die "electron.vite.config.ts still references renderer-solid"
fi

# No mock workbench in product graph
if rg -n 'createMockWorkbenchAdapter' \
  "$ROOT/apps/polterware-desktop/src/renderer" \
  "$ROOT/apps/polterware-desktop/src/main" \
  2>/dev/null | rg -q .; then
  die "mock workbench in product graph"
fi

# No live package imports of removed TS core/ui (ignore specs/docs/migration history)
if rg -n '@polterware/core|@polterware/ui|packages/core|packages/ui' \
  "$ROOT/apps" "$ROOT/packages" "$ROOT/backend" \
  --glob '!**/node_modules/**' \
  --glob '!**/out/**' \
  2>/dev/null | rg -q .; then
  die "live code still references packages/core or packages/ui"
  rg -n '@polterware/core|@polterware/ui|packages/core|packages/ui' \
    "$ROOT/apps" "$ROOT/packages" "$ROOT/backend" \
    --glob '!**/node_modules/**' --glob '!**/out/**' 2>/dev/null | head -20 || true
fi

# The project graph is called Structure. Migrations and their test keep their history,
# and the MongoDB Atlas synonym in the provider registry is a product name.
if rg -n -i 'atlas' "$ROOT/apps" "$ROOT/packages" "$ROOT/backend" "$ROOT/schemas" "$ROOT/docs" "$ROOT/AGENTS.md" "$ROOT/DESIGN.md" \
  --glob '!**/node_modules/**' --glob '!**/out/**' --glob '!**/release/**' \
  --glob '!backend/platform/db/sqlite/migrations/*.sql' --glob '!backend/platform/db/sqlite/sqlite_test.go' \
  --glob '!docs/design-references/**' \
  2>/dev/null | rg -v 'synonyms: \["atlas"\]' | rg -q .; then
  die "the project graph is Structure; remove Atlas"
  rg -n -i 'atlas' "$ROOT/apps" "$ROOT/packages" "$ROOT/backend" "$ROOT/schemas" "$ROOT/docs" "$ROOT/AGENTS.md" "$ROOT/DESIGN.md" \
    --glob '!**/node_modules/**' --glob '!**/out/**' --glob '!**/release/**' \
    --glob '!backend/platform/db/sqlite/migrations/*.sql' --glob '!backend/platform/db/sqlite/sqlite_test.go' \
    --glob '!docs/design-references/**' 2>/dev/null | rg -v 'synonyms: \["atlas"\]' | head -20 || true
fi

# Decisions are called Decisions. Allowed: migration history and its test, the dispatch
# verifier and Vitals (a check's verdict is an ordinary word there), the input
# readers that accept the legacy ref prefix (adr|verdict|decision), and lines
# that name a legacy value on purpose.
verdict_hits() {
  rg -n -i 'verdict' "$ROOT/apps" "$ROOT/packages" "$ROOT/backend" "$ROOT/schemas" "$ROOT/docs" "$ROOT/AGENTS.md" "$ROOT/DESIGN.md" "$ROOT/README.md" \
    --glob '!**/node_modules/**' --glob '!**/out/**' --glob '!**/release/**' --glob '!**/gen/**' \
    --glob '!packages/contracts/src/gen/**' \
    --glob '!backend/platform/db/sqlite/migrations/*.sql' --glob '!backend/platform/db/sqlite/migrate.go' --glob '!backend/platform/db/sqlite/sqlite_test.go' \
    --glob '!backend/domains/dispatch/**' --glob '!backend/providers/dispatch/**' --glob '!apps/vitals-desktop/**' \
    --glob '!docs/design-references/**' 2>/dev/null | rg -v 'adr\|verdict\|decision|(?i)legacy' || true
}
if [[ -n "$(verdict_hits)" ]]; then
  die "Decisions are called Decisions; remove Verdict"
  verdict_hits | head -20
fi

if [[ $fail -ne 0 ]]; then
  exit 1
fi
echo "OK: legacy checks"
