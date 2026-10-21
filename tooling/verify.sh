#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$PATH:$(go env GOPATH 2>/dev/null)/bin:${HOME}/go/bin"
cd "$ROOT"
node --test tooling/check-ui-opacity.test.mjs
node tooling/check-ui-opacity.mjs
node tooling/check-docs-coverage.mjs
bash tooling/check-no-scenic.sh
bash tooling/check-domain-imports.sh
bash tooling/check-ts-boundaries.sh
bash tooling/check-legacy.sh
bash tooling/generate.sh
(cd backend && go test ./... -count=1)
(cd backend && go vet ./...)
node -e "const p=require('./apps/polterware-desktop/package.json'); const d={...p.dependencies,...p.devDependencies}; if(d.react||d['react-dom']) process.exit(1)"
test ! -d apps/polterware-desktop/src/renderer-solid
bash tooling/test-security.sh
echo "verify OK"
