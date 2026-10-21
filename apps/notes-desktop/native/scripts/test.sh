#!/usr/bin/env bash
set -euo pipefail
NATIVE="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$NATIVE/build"
xcrun clang++ -std=c++17 -fobjc-arc -mmacosx-version-min=15.0 -framework Foundation "$NATIVE/tests/calendar.mm" -o "$NATIVE/build/calendar-tests"
"$NATIVE/build/calendar-tests"
