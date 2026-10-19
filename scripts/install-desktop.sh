#!/bin/bash
# Installs or updates a Polterware desktop app (Polterware, Polterware Vitals, Polterware Notes) on macOS
# from the newest <app>-v<version> GitHub release. Run it again to update.
#
#   curl -fsSL https://raw.githubusercontent.com/polterware/polterware/main/scripts/install-desktop.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/polterware/polterware/main/scripts/install-desktop.sh | APP=polterware bash
set -euo pipefail

REPO="polterware/polterware"
GITHUB_API="https://api.github.com/repos/${REPO}/releases"

usage() {
  cat << EOF
Usage: install-desktop.sh [--app vitals|polterware|notes] [--version <version>] [--force]

Installs the newest release of the app, or updates an installed copy.

Options:
  --app <app>          App to install (default: \$APP or vitals)
  --version <version>  Install a specific version (ex: 0.1.0-alpha.1)
  --force              Reinstall even when the installed version matches
  -h, --help           Show this help
EOF
}

APP="${APP:-vitals}"
VERSION=""
FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      APP="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

case "$APP" in
  vitals) PRODUCT="Polterware Vitals" ;;
  polterware) PRODUCT="Polterware" ;;
  notes) PRODUCT="Polterware Notes" ;;
  *)
    echo "Unknown app: $APP (expected vitals, polterware or notes)"
    exit 1
    ;;
esac

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer only supports macOS."
  exit 1
fi
if [ "$(uname -m)" != "arm64" ]; then
  echo "$PRODUCT is only built for Apple Silicon (arm64)."
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required to parse GitHub API responses."
  exit 1
fi

TMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# Optional token, only to raise the GitHub API rate limit.
# bash 3.2 + set -u cannot expand empty arrays, so branch instead of building args.
TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
curl_gh() {
  if [ -n "$TOKEN" ]; then
    curl -H "Authorization: Bearer ${TOKEN}" "$@"
  else
    curl "$@"
  fi
}
gh_api() {
  curl_gh -fsSL -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$1"
}

echo "Fetching $PRODUCT release metadata..."
if [ -n "$VERSION" ]; then
  VERSION="${VERSION#v}"
  RELEASE_JSON=$(gh_api "${GITHUB_API}/tags/${APP}-v${VERSION}") || {
    echo "Release ${APP}-v${VERSION} not found."
    exit 1
  }
else
  RELEASES_JSON=$(gh_api "${GITHUB_API}?per_page=50") || {
    echo "Failed to fetch releases from GitHub."
    exit 1
  }
  # Newest published release of this app; alpha prereleases count.
  RELEASE_JSON=$(printf '%s' "$RELEASES_JSON" | python3 -c '
import json, sys
prefix = sys.argv[1] + "-v"
for rel in json.load(sys.stdin):
    if rel.get("draft") or not rel.get("tag_name", "").startswith(prefix):
        continue
    print(json.dumps(rel))
    sys.exit(0)
sys.exit(3)
' "$APP") || {
    echo "No published $PRODUCT release found."
    exit 1
  }
fi

# Prints: tag, version, zip name, zip url, SHA256SUMS url (one per line).
RELEASE_INFO=$(printf '%s' "$RELEASE_JSON" | python3 -c '
import json, sys
app, product = sys.argv[1], sys.argv[2]
rel = json.load(sys.stdin)
tag = rel["tag_name"]
version = tag[len(app) + 2:]
assets = {a["name"]: a["browser_download_url"] for a in rel.get("assets", [])}
zip_name = f"{product.replace(' ', '-')}-{version}-arm64.zip"
if zip_name not in assets or "SHA256SUMS" not in assets:
    print(f"Release {tag} is missing {zip_name} or SHA256SUMS.", file=sys.stderr)
    sys.exit(3)
print(tag, version, zip_name, assets[zip_name], assets["SHA256SUMS"], sep="\n")
' "$APP" "$PRODUCT")
TAG=$(sed -n 1p <<< "$RELEASE_INFO")
RELEASE_VERSION=$(sed -n 2p <<< "$RELEASE_INFO")
ZIP_NAME=$(sed -n 3p <<< "$RELEASE_INFO")
ZIP_URL=$(sed -n 4p <<< "$RELEASE_INFO")
SUMS_URL=$(sed -n 5p <<< "$RELEASE_INFO")

# An existing install, wherever it lives, is the one to update.
TARGET_DIR="/Applications"
if [ ! -d "$TARGET_DIR/$PRODUCT.app" ] && [ -d "$HOME/Applications/$PRODUCT.app" ]; then
  TARGET_DIR="$HOME/Applications"
elif [ ! -w "$TARGET_DIR" ]; then
  TARGET_DIR="$HOME/Applications"
fi
TARGET_PATH="$TARGET_DIR/$PRODUCT.app"

INSTALLED_VERSION=""
if [ -d "$TARGET_PATH" ]; then
  INSTALLED_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$TARGET_PATH/Contents/Info.plist" 2>/dev/null || true)
fi
if [ "$INSTALLED_VERSION" = "$RELEASE_VERSION" ] && [ "$FORCE" -eq 0 ]; then
  echo "$PRODUCT $RELEASE_VERSION is already installed and up to date."
  exit 0
fi

echo "Using release $TAG"
echo "Downloading $ZIP_NAME..."
curl_gh -fL --progress-bar "$ZIP_URL" -o "$TMP_DIR/$ZIP_NAME"
curl_gh -fsSL "$SUMS_URL" -o "$TMP_DIR/SHA256SUMS"
EXPECTED=$(awk -v f="$ZIP_NAME" '$2 == f { print $1 }' "$TMP_DIR/SHA256SUMS")
ACTUAL=$(shasum -a 256 "$TMP_DIR/$ZIP_NAME" | awk '{ print $1 }')
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "Checksum mismatch for $ZIP_NAME; aborting."
  exit 1
fi

echo "Extracting..."
ditto -x -k "$TMP_DIR/$ZIP_NAME" "$TMP_DIR/extract"
APP_PATH="$TMP_DIR/extract/$PRODUCT.app"
if [ ! -d "$APP_PATH" ]; then
  echo "No $PRODUCT.app found in $ZIP_NAME."
  exit 1
fi

if pgrep -qf "/$PRODUCT.app/Contents/MacOS/"; then
  echo "Quitting $PRODUCT..."
  osascript -e "quit app \"$PRODUCT\"" >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    pgrep -qf "/$PRODUCT.app/Contents/MacOS/" || break
    sleep 0.5
  done
  if pgrep -qf "/$PRODUCT.app/Contents/MacOS/"; then
    echo "$PRODUCT is still running; quit it and run the installer again."
    exit 1
  fi
fi

mkdir -p "$TARGET_DIR"
rm -rf "$TARGET_PATH"
ditto "$APP_PATH" "$TARGET_PATH"
xattr -dr com.apple.quarantine "$TARGET_PATH" 2>/dev/null || true

if [ -n "$INSTALLED_VERSION" ]; then
  echo "Updated $PRODUCT $INSTALLED_VERSION -> $RELEASE_VERSION at $TARGET_PATH"
else
  echo "Installed $PRODUCT $RELEASE_VERSION at $TARGET_PATH"
fi
echo "Open with: open \"$TARGET_PATH\""
echo "To update later, run this installer again."
