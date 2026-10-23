#!/usr/bin/env bash
set -euo pipefail
DESKTOP="$(cd "$(dirname "$0")/../.." && pwd)"
ROOT="$(cd "$DESKTOP/../.." && pwd)"
[[ "$(uname -s)" == Darwin ]] || { echo 'The packaged Polterware Notes E2E harness currently requires macOS.' >&2; exit 1; }
# All build logs go to stderr; stdout is just the executable, suitable for command substitution.
pnpm --dir "$ROOT" build:notes-core >&2
mkdir -p "$DESKTOP/tests/build"
(cd "$ROOT/notes/backend" && go build -o "$DESKTOP/tests/build/e2edriver" ./tests/e2edriver) >&2
pnpm --dir "$DESKTOP" build:native >&2
pnpm --dir "$DESKTOP" exec electron-vite build >&2
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --dir "$DESKTOP" exec electron-builder --mac --dir --publish never \
  --config.directories.output=test-results/build --config.mac.identity=null >&2
EXECUTABLE="$DESKTOP/test-results/build/mac-arm64/Polterware Notes.app/Contents/MacOS/Polterware Notes"
[[ -x "$EXECUTABLE" ]] || EXECUTABLE="$DESKTOP/test-results/build/mac/Polterware Notes.app/Contents/MacOS/Polterware Notes"
[[ -x "$EXECUTABLE" ]] || { echo 'Packaged executable was not produced.' >&2; exit 1; }
printf '%s\n' "$EXECUTABLE"
