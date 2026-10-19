#!/usr/bin/env bash
set -euo pipefail
NATIVE="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$(cd "$NATIVE/.." && pwd)"
[[ "$(uname -s)" == Darwin ]] || { echo 'Native notifications require macOS' >&2; exit 1; }
VERSION="$(node -p "require(process.argv[1]).version" "$DESKTOP/node_modules/electron/package.json")"
[[ "$VERSION" == 44.4.5 ]] || { echo "Expected Electron 44.4.5, got $VERSION" >&2; exit 1; }
ARCH="${PWNOTES_NATIVE_ARCH:-$(uname -m)}"
case "$ARCH" in arm64|x86_64) ;; *) echo "Unsupported native architecture: $ARCH" >&2; exit 1;; esac
pnpm --dir "$NATIVE" install --ignore-workspace --ignore-scripts --frozen-lockfile
mkdir -p "$NATIVE/build/headers"
if [[ ! -f "$NATIVE/build/headers/include/node/node_api.h" ]]; then
  curl --fail --location "https://electronjs.org/headers/v$VERSION/node-v$VERSION-headers.tar.gz" -o "$NATIVE/build/headers.tar.gz"
  curl --fail --location "https://electronjs.org/headers/v$VERSION/SHASUMS256.txt" -o "$NATIVE/build/SHASUMS256.txt"
  (cd "$NATIVE/build" && node -e '
    const fs=require("node:fs"), crypto=require("node:crypto");
    const name=`node-v${process.argv[1]}-headers.tar.gz`;
    const expected=fs.readFileSync("SHASUMS256.txt","utf8").split(/\n/).find(x=>x.trim().endsWith(" "+name))?.split(/\s+/)[0];
    const actual=crypto.createHash("sha256").update(fs.readFileSync("headers.tar.gz")).digest("hex");
    if (!expected || expected!==actual) throw Error("Electron headers checksum mismatch");
  ' "$VERSION")
  tar -xzf "$NATIVE/build/headers.tar.gz" --strip-components=1 -C "$NATIVE/build/headers"
fi
xcrun clang++ -std=c++17 -O2 -arch "$ARCH" -fobjc-arc -fblocks -mmacosx-version-min=15.0 -DNAPI_VERSION=8 \
  -I "$NATIVE/build/headers/include/node" -I "$NATIVE/node_modules/node-addon-api" \
  -bundle -undefined dynamic_lookup -framework AppKit -framework UserNotifications \
  "$NATIVE/notify.mm" -o "$NATIVE/build/notify.node"
printf 'Built native/notify.node: Electron %s, N-API 8, %s, macOS 15+\n' "$VERSION" "$ARCH"
