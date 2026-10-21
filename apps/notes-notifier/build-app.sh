#!/usr/bin/env bash
# Build an ad-hoc signed NotesNotifier.app (codesign -s -).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/dist/NotesNotifier.app"
BIN="$ROOT/.build/release/NotesNotifier"

cd "$ROOT"
swift build -c release

# SwiftPM adds an rpath into the Xcode toolchain. launchd rejects that when it
# spawns the helper. Keep the system Swift runtime only.
while read -r rpath; do
  case "$rpath" in
    /usr/lib/swift|"") ;;
    *) install_name_tool -delete_rpath "$rpath" "$BIN" || true ;;
  esac
done < <(otool -l "$BIN" | awk '/LC_RPATH/{p=1} p && /path /{print $2; p=0}')

rm -rf "$OUT"
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources" "$OUT/Contents/Library/LaunchAgents"
cp "$BIN" "$OUT/Contents/MacOS/NotesNotifier"
chmod +x "$OUT/Contents/MacOS/NotesNotifier"
cp "$ROOT/LaunchAgents/com.polterware.notes.notifier.plist" \
  "$OUT/Contents/Library/LaunchAgents/com.polterware.notes.notifier.plist"

cat > "$OUT/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>Polterware Notes</string>
  <key>CFBundleExecutable</key>
  <string>NotesNotifier</string>
  <key>CFBundleIdentifier</key>
  <string>com.polterware.notes.notifier</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Polterware Notes</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>15.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
EOF

# Ad-hoc signature. Stable identifier so Launch Services and notifyd see this bundle.
codesign --force --sign - --identifier "com.polterware.notes.notifier" "$OUT"
echo "Built $OUT"
