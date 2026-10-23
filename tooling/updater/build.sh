#!/usr/bin/env bash
set -euo pipefail
UPDATER="$(cd "$(dirname "$0")" && pwd)"
[[ "$(uname -s)" == Darwin ]] || { echo 'Sparkle requires macOS.' >&2; exit 1; }
APP="${1:?usage: build.sh polterware|notes|vitals}"
ROOT="$(cd "$UPDATER/../.." && pwd)"
DESKTOP="$ROOT/$(node "$ROOT/tooling/release/apps.cjs" "$APP" desktop)"
VERSION="$(node -p 'require(process.argv[1]).version' "$DESKTOP/node_modules/electron/package.json")"
EXPECTED="$(node -p 'require(process.argv[1]).electron' "$ROOT/tooling/release/apps.cjs")"
[[ "$VERSION" == "$EXPECTED" ]] || { echo 'Unexpected Electron version.' >&2; exit 1; }
bash "$UPDATER/fetch.sh"
mkdir -p "$UPDATER/build/headers"
HEADERS="node-v$VERSION-headers.tar.gz"
curl --fail --location --retry 3 "https://electronjs.org/headers/v$VERSION/$HEADERS" -o "$UPDATER/build/$HEADERS"
curl --fail --location --retry 3 "https://electronjs.org/headers/v$VERSION/SHASUMS256.txt" -o "$UPDATER/build/SHASUMS256.txt"
node - "$UPDATER/build" "$HEADERS" <<'JS'
const fs = require('node:fs'), crypto = require('node:crypto'), path = require('node:path');
const [directory, name] = process.argv.slice(2);
const expected = fs.readFileSync(path.join(directory, 'SHASUMS256.txt'), 'utf8').split('\n').find(line => line.trim().endsWith(' ' + name))?.split(/\s+/)[0];
const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex');
if (!expected || expected !== actual) throw Error('Electron headers checksum mismatch');
JS
tar -xzf "$UPDATER/build/$HEADERS" --strip-components=1 -C "$UPDATER/build/headers"
xcrun clang++ -std=c++17 -O2 -arch arm64 -fobjc-arc -fblocks -mmacosx-version-min=12.0 -DNAPI_VERSION=8 \
  -I "$UPDATER/build/headers/include/node" -F "$UPDATER/vendor" \
  -bundle -undefined dynamic_lookup -framework AppKit -framework Sparkle \
  -Wl,-rpath,@loader_path/../../Frameworks "$UPDATER/updater.mm" -o "$UPDATER/build/updater.node"
