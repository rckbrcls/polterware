#!/usr/bin/env bash
# Builds the ad-hoc signed macOS arm64 DMG and ZIP of one desktop app:
#   bash tooling/release/dist-mac.sh polterware|notes|vitals
# RELEASE_VERSION overrides the package.json version; the release workflow
# passes the version from the <app>-v<version> tag.
set -euo pipefail
APP_KEY="${1:?usage: dist-mac.sh polterware|notes|vitals}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RELEASE="$ROOT/tooling/release"
meta() { node "$RELEASE/apps.cjs" "$APP_KEY" "$1"; }
PRODUCT="$(meta product)"
# Release artifacts use hyphens where the product name has spaces.
ARTIFACT="${PRODUCT// /-}"
DESKTOP="$ROOT/$(meta desktop)"
ELECTRON="$(node -p 'require(process.argv[1]).electron' "$RELEASE/apps.cjs")"

[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'Desktop releases require a macOS arm64 host.' >&2; exit 1; }
# Never discover or load signing certificates, even if CI/user environment supplies them.
unset CSC_LINK CSC_KEY_PASSWORD CSC_NAME CSC_KEYCHAIN CSC_INSTALLER_LINK CSC_INSTALLER_KEY_PASSWORD
export CSC_IDENTITY_AUTO_DISCOVERY=false
export NODE_ENV=production
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git -C "$ROOT" log -1 --format=%ct)}"
VERSION="${RELEASE_VERSION:-$(node -p "require(process.argv[1]).version" "$DESKTOP/package.json")}"
node -e 'if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(process.argv[1])) throw Error("Invalid release version")' "$VERSION"
[[ "$(node -p "require(process.argv[1]).version" "$DESKTOP/node_modules/electron/package.json")" == "$ELECTRON" ]] || { echo "Install the frozen lockfile with Electron $ELECTRON." >&2; exit 1; }
OUTPUT="$DESKTOP/release/$VERSION"
[[ ! -e "$OUTPUT" ]] || { echo "Release output already exists: $OUTPUT (move it before rebuilding)." >&2; exit 1; }

# Builds a Go core into dist/ and pins its mtime to the commit time, because the
# Desktop supervisor uses the binary's mtime in its build handshake.
build_core() {
  mkdir -p "$ROOT/dist"
  (cd "$1" && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -mod=readonly -trimpath -buildvcs=false -ldflags='-s -w -buildid=' -o "$ROOT/dist/$2" ./runtimes/cli)
  node -e 'require("node:fs").utimesSync(process.argv[1], Number(process.env.SOURCE_DATE_EPOCH), Number(process.env.SOURCE_DATE_EPOCH))' "$ROOT/dist/$2"
}

case "$APP_KEY" in
  polterware) build_core "$ROOT/backend" polterware ;;
  notes)
    build_core "$ROOT/notes/backend" pwnotes
    PWNOTES_NATIVE_ARCH=arm64 bash "$DESKTOP/native/scripts/build.sh"
    ;;
  vitals) bash "$DESKTOP/agent/build.sh" ;;
esac

bash "$ROOT/tooling/updater/build.sh" "$APP_KEY"

pnpm --dir "$DESKTOP" exec electron-vite build --mode production
pnpm --dir "$DESKTOP" exec electron-builder --mac dmg zip --arm64 --publish never \
  "--config.extraMetadata.version=$VERSION" "--config.directories.output=$OUTPUT"
APP="$OUTPUT/mac-arm64/$PRODUCT.app"
node "$RELEASE/verify-bundle.cjs" "$APP_KEY" "$APP" > "$OUTPUT/bundle-verification.txt"
cat "$OUTPUT/bundle-verification.txt"
# Rejection is expected: ad-hoc is not Developer ID signing/notarization.
set +e
spctl --assess --type execute --verbose=4 "$APP" > "$OUTPUT/gatekeeper.txt" 2>&1
ASSESSMENT=$?
set -e
printf '\nspctl exit: %s (ad-hoc rejection expected)\n' "$ASSESSMENT" >> "$OUTPUT/gatekeeper.txt"
cat "$OUTPUT/gatekeeper.txt"
(cd "$OUTPUT" && shasum -a 256 "$ARTIFACT-$VERSION-arm64.dmg" "$ARTIFACT-$VERSION-arm64.zip" > SHA256SUMS)
node - "$APP_KEY" "$OUTPUT" "$VERSION" "$ROOT" <<'JS'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const [key, directory, version, root] = process.argv.slice(2);
const { electron, releaseApp } = require(path.join(root, 'tooling/release/apps.cjs'));
const release = releaseApp(key);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const command = (name, args) => execFileSync(name, args, { encoding: 'utf8' }).trim();
const resources = path.join(directory, `mac-arm64/${release.product}.app/Contents/Resources`);
const nativeLock = path.join(root, release.desktop, 'native/pnpm-lock.yaml');
const report = { app: key, version, arch: 'arm64', electron, sourceDateEpoch: process.env.SOURCE_DATE_EPOCH,
  commit: command('git', ['-C', root, 'rev-parse', 'HEAD']),
  tools: { node: process.version, pnpm: command('pnpm', ['--version']), go: command('go', ['version']), sdk: command('xcrun', ['--show-sdk-version']) },
  lockSha256: hash(path.join(root, 'pnpm-lock.yaml')),
  ...(fs.existsSync(nativeLock) ? { nativeLockSha256: hash(nativeLock) } : {}),
  payloadSha256: Object.fromEntries([...release.binaries.map(binary => binary.path), 'app.asar'].map(file => [file, hash(path.join(resources, file))])),
  artifacts: ['dmg', 'zip'].map(ext => { const file = `${release.product.replace(/ /g, '-')}-${version}-arm64.${ext}`; return { file, bytes: fs.statSync(path.join(directory, file)).size }; }) };
fs.writeFileSync(path.join(directory, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
JS

node "$ROOT/tooling/updater/appcast.cjs" "$APP_KEY" "$OUTPUT" "$VERSION"
