#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$PATH:$(go env GOPATH 2>/dev/null)/bin:${HOME}/go/bin"
cd "$ROOT"
if [[ -f schemas/buf.yaml ]]; then
  (cd schemas && buf lint && buf generate)
  if [[ -f schemas/.buf/baseline.binpb ]]; then
    (cd schemas && buf breaking --against .buf/baseline.binpb) || {
      echo "buf breaking reported changes — update schemas/.buf/baseline.binpb intentionally"
      exit 1
    }
  fi
fi
# The TS plugin writes a trailing blank line. Drop that line when it is the
# only change, so `git diff --check` stays clean for files committed without it.
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  numstat=$(git diff --numstat -- "$file")
  added=${numstat%%$'\t'*}
  rest=${numstat#*$'\t'}
  removed=${rest%%$'\t'*}
  check=$(git diff --check -- "$file" 2>&1 || true)
  if [[ "$added" == "1" && "$removed" == "0" && "$check" == *"new blank line at EOF"* ]]; then
    git checkout -- "$file"
  fi
done < <(git diff --name-only --diff-filter=M)
echo "generate done"
