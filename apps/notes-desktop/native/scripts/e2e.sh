#!/usr/bin/env bash
# Real-core, real-notification gate. Uses a TEMP database and TEMP Electron
# --user-data-dir. Never touches ~/Library/Application Support/Polterware Notes.
set -euo pipefail
NATIVE="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$(cd "$NATIVE/.." && pwd)"
ROOT="$(cd "$DESKTOP/../.." && pwd)"
[[ "$(uname -s)" == Darwin ]] || { echo 'FAIL: native E2E requires macOS' >&2; exit 1; }
pkill -f '/tmp/notes-w1-native-notify-c.' 2>/dev/null || true

WORKDIR="$(mktemp -d /tmp/notes-w1-native-notify-c.XXXXXX)"
DB="$WORKDIR/db/notes.db"
USERDATA="$WORKDIR/userdata"
BIN="$WORKDIR/bin/pwnotes"
CODE="$WORKDIR/app"
RESULT="$WORKDIR/inspect.json"
ELECTRON=""
ELECTRON_PID=""
CORE_PID=""
cleanup() {
  local code=$?
  set +e
  if [[ -f "$WORKDIR/electron.log" ]]; then
    echo '--- electron.log ---' >&2
    cat "$WORKDIR/electron.log" >&2 || true
    cp "$WORKDIR/electron.log" /tmp/notes-e2e-last-electron.log 2>/dev/null || true
  fi
  if [[ -f "$WORKDIR/db/run/notify.log" ]]; then
    echo '--- notify.log ---' >&2
    cat "$WORKDIR/db/run/notify.log" >&2 || true
    cp "$WORKDIR/db/run/notify.log" /tmp/notes-e2e-last-notify.log 2>/dev/null || true
  fi
  pkill -f "$CODE" 2>/dev/null || true
  sleep 0.3
  if [[ -f "$WORKDIR/db/run/core.json" ]]; then
    CORE_PID="$(node -e 'try{console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).pid||"")}catch{console.log("")}' "$WORKDIR/db/run/core.json")"
  fi
  if [[ -f "$WORKDIR/inspect-env.json" && -n "$ELECTRON" && -x "$ELECTRON" ]]; then
    perl -e 'alarm 20; exec @ARGV' "$ELECTRON" "$CODE" --user-data-dir="$WORKDIR/inspect-userdata" -- "--notes-e2e-env=$WORKDIR/inspect-env.json" >/dev/null 2>&1 || true
  fi
  if [[ -n "${CORE_PID}" ]] && kill -0 "$CORE_PID" 2>/dev/null; then
    local core_exe
    core_exe="$(ps -p "$CORE_PID" -o args= 2>/dev/null || true)"
    if [[ "$core_exe" == "$BIN"* ]]; then kill "$CORE_PID" 2>/dev/null; sleep 0.3; kill -9 "$CORE_PID" 2>/dev/null; fi
  fi
  rm -rf "$WORKDIR"
  exit "$code"
}
trap cleanup EXIT

mkdir -p "$WORKDIR/db" "$WORKDIR/bin" "$USERDATA" "$CODE/native/build" "$NATIVE/build"
bash "$NATIVE/scripts/build.sh"
(cd "$ROOT" && go build -o "$BIN" ./notes/backend/runtimes/cli)
BANNER="$("$BIN")"
if [[ "$BANNER" == *'(stub)'* ]]; then
  echo "BLOCKED: real core unavailable: $BANNER" >&2
  exit 2
fi
pnpm --dir "$DESKTOP" exec electron-vite build

ELECTRON_PKG="$(node -p "require('node:path').dirname(require.resolve('electron/package.json',{paths:[process.argv[1]]}))" "$DESKTOP")"
if [[ ! -d "$ELECTRON_PKG/dist/Electron.app" ]]; then
  node "$ELECTRON_PKG/install.js"
fi
ELECTRON="$ELECTRON_PKG/dist/Electron.app/Contents/MacOS/Electron"
cp "$DESKTOP/package.json" "$CODE/package.json"
ditto "$DESKTOP/out" "$CODE/out"
cp "$NATIVE/scripts/e2e-main.cjs" "$CODE/e2e-main.cjs"
node -e 'const fs=require("node:fs"); const p=process.argv[1]; const j=JSON.parse(fs.readFileSync(p,"utf8")); j.main="e2e-main.cjs"; delete j.type; fs.writeFileSync(p, JSON.stringify(j));' "$CODE/package.json"
cp "$NATIVE/build/notify.node" "$CODE/native/build/notify.node"
ln -sfn "$DESKTOP/node_modules" "$CODE/node_modules"

ENVFILE="$WORKDIR/e2e-env.json"
INSPECT_ENV="$WORKDIR/inspect-env.json"
write_env() {
  node -e 'const fs=require("node:fs"); const [out, bin, db, notify, inspect, result]=process.argv.slice(1); const env={PWNOTES_CORE_BIN:bin,PWNOTES_CORE_DB:db,PWNOTES_NOTIFY_E2E:"1",PWNOTES_NOTIFY_MODULE:notify}; if(inspect){env.PWNOTES_NOTIFY_INSPECT=inspect;env.PWNOTES_NOTIFY_INSPECT_RESULT=result;} fs.writeFileSync(out, JSON.stringify(env));' "$@"
}
write_env "$ENVFILE" "$BIN" "$DB" "$CODE/native/build/notify.node"
write_env "$INSPECT_ENV" "$BIN" "$DB" "$CODE/native/build/notify.node" cleanup "$RESULT"

"$ELECTRON" "$CODE" --user-data-dir="$USERDATA" -- "--notes-e2e-env=$ENVFILE" >"$WORKDIR/electron.log" 2>&1 &
ELECTRON_PID=$!
for _ in $(seq 1 40); do
  [[ -f "$WORKDIR/main-boot.txt" ]] && break
  sleep 0.25
done
if [[ ! -f "$WORKDIR/main-boot.txt" ]]; then
  echo "FAIL: CJS trampoline did not start" >&2
  cat "$WORKDIR/electron.log" >&2 || true
  exit 1
fi
if grep -q boot-failed "$WORKDIR/main-boot.txt"; then
  echo "FAIL: Main did not load" >&2
  cat "$WORKDIR/main-boot.txt" >&2
  exit 1
fi

node "$NATIVE/scripts/e2e-driver.mjs" \
  --workdir "$WORKDIR" \
  --db "$DB" \
  --bin "$BIN" \
  --app "$ELECTRON" \
  --code "$CODE" \
  --userdata "$USERDATA" \
  --electron-pid "$ELECTRON_PID" \
  --notify "$CODE/native/build/notify.node" \
  --inspect "$NATIVE/scripts/e2e-inspect.cjs" \
  --result "$RESULT"
CORE_PID="$(node -e 'try{console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).pid||"")}catch{console.log("")}' "$WORKDIR/db/run/core.json")"
echo "PASS: real-core native notification e2e ($WORKDIR)"
