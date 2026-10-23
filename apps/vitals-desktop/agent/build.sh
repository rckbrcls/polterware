#!/usr/bin/env bash
# Cross-compile the read-only vitals agent. Linux and Windows are pure Go
# (no CGO). macOS needs CGO for Mach, libproc and IOKit, so it only builds on
# a macOS host with the Xcode command line tools.
set -euo pipefail

cd "$(dirname "$0")"
out_dir="../resources/agent"
mkdir -p "${out_dir}"

for arch in amd64 arm64; do
  CGO_ENABLED=0 GOOS=linux GOARCH="${arch}" \
    go build -trimpath -ldflags "-s -w" \
    -o "${out_dir}/vitals-agent-linux-${arch}" .
  CGO_ENABLED=0 GOOS=windows GOARCH="${arch}" \
    go build -trimpath -ldflags "-s -w" \
    -o "${out_dir}/vitals-agent-windows-${arch}.exe" .
done

if [[ "$(uname -s)" == "Darwin" ]]; then
  for arch in amd64 arm64; do
    clang_arch="${arch}"
    [[ "${arch}" == "amd64" ]] && clang_arch="x86_64"
    CGO_ENABLED=1 GOOS=darwin GOARCH="${arch}" CC="clang -arch ${clang_arch}" \
      go build -trimpath -ldflags "-s -w" \
      -o "${out_dir}/vitals-agent-darwin-${arch}" .
  done
else
  echo "build.sh: skipping darwin agents (CGO needs a macOS host)" >&2
fi
