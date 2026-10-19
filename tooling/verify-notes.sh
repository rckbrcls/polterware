#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$PATH:$(go env GOPATH 2>/dev/null)/bin:${HOME}/go/bin"
cd "$ROOT"

if [[ -f notes/schemas/buf.yaml ]]; then
  (cd notes/schemas && buf lint)
  if [[ -f notes/schemas/.buf/baseline.binpb ]]; then
    (cd notes/schemas && buf breaking --against .buf/baseline.binpb) || {
      echo "buf breaking reported changes — update notes/schemas/.buf/baseline.binpb intentionally"
      exit 1
    }
  fi
fi

(cd notes/backend && go test ./... -count=1)
(cd notes/backend && go vet ./...)

pnpm --filter "@polterware/*notes*" typecheck
pnpm --filter "@polterware/*notes*" test

bash tooling/check-notes-boundaries.sh
node tooling/check-ui-opacity.mjs

node --test tooling/check-ui-opacity.test.mjs
bash tooling/check-no-scenic.sh
bash tooling/check-domain-imports.sh
bash tooling/check-ts-boundaries.sh
bash tooling/check-legacy.sh
node -e "const p=require('./apps/polterware-desktop/package.json'); const d={...p.dependencies,...p.devDependencies}; if(d.react||d['react-dom']) process.exit(1)"
test ! -d apps/polterware-desktop/src/renderer-solid

echo "verify-notes OK"
