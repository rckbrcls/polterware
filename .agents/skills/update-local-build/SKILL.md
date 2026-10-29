---
name: update-local-build
description: >-
  Rebuild a desktop app of this repo (polterware, notes, vitals) from the
  current working tree and install it over the copy in /Applications on the
  user's Mac, so it can be tested before a real release. Use when the user asks
  to update, refresh, rebuild or reinstall the local build / installed app
  ("atualize a build local", "atualiza o app do macbook", "instala a versão de
  hoje", "quero testar o Notes instalado").
---

# Update local build

Installs an unreleased, ad-hoc signed build of one app over its installed copy. Running it is an explicit request, so building is allowed (see AGENTS.md). Do not open the app or start previews afterwards unless asked.

## Apps

| key | product (= /Applications name) | package script |
| --- | --- | --- |
| `polterware` | Polterware | `pnpm dist:polterware:mac` |
| `notes` | Polterware Notes | `pnpm dist:notes:mac` |
| `vitals` | Polterware Vitals | `pnpm dist:vitals:mac` |

Metadata lives in `tooling/release/apps.cjs`. If the user names no app, infer it from the changed files (`git status`) or ask; "all" means run the steps for each app in turn.

## Steps

1. **Pick the version.** `dist-mac.sh` refuses to reuse an output folder, and the package.json version is the real release version, so use `RELEASE_VERSION=<n>-local`. Take the highest `0.1.N-local` under `<desktop>/release/` (desktop path from `apps.cjs`) and use N+1; with none, use the installed version's patch + 1.
2. **Build** (arm64 macOS only; takes minutes, so redirect the log to the scratchpad):
   ```bash
   RELEASE_VERSION=0.1.N-local bash tooling/release/dist-mac.sh <key> > <scratchpad>/dist-<key>.log 2>&1; echo $?
   ```
   On failure, read the tail of the log and fix or report; never install a failed build. The tail ends with `Signed update feed ...` on success. The build includes uncommitted changes; do not commit or stash for it.
3. **Quit the running app** gracefully: `osascript -e 'tell application "<Product>" to quit'`, wait a few seconds, then `pgrep -f '/Applications/<Product>.app'` must be empty. If it is still running, ask before killing it.
4. **Replace.** Look at the target first (`PlistBuddy -c 'Print CFBundleShortVersionString' /Applications/<Product>.app/Contents/Info.plist`). Move the old app to `~/.Trash/<Product>-<old version>.app` (never `rm`), then:
   ```bash
   ditto <desktop>/release/<version>/mac-arm64/<Product>.app "/Applications/<Product>.app"
   xattr -dr com.apple.quarantine "/Applications/<Product>.app"
   ```
5. **Verify** the installed version reads back as the new one.

## Report (in Portuguese)

Say: the version installed, which commit the build is based on plus that uncommitted changes were included, that the old app is in the Trash, and that the app was not opened or tested.

## Notes

- Notes also builds `pwnotes` and a native module; Vitals builds its agents. All handled by `dist-mac.sh`.
- Local builds are ad-hoc signed; Gatekeeper rejection in `gatekeeper.txt` is expected.
- Older `release/*-local` folders can be left alone; mention them only if disk usage matters.
