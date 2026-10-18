#!/usr/bin/env bash
# Genesis's tests. Server tests run Genesis's Durable Object under Node (node:sqlite stands in for its storage, a fake
# Workers AI answers); browser tests drive the app in Chromium against that same object. Needs Node 22+, and for the
# browser tests Playwright (PLAYWRIGHT=path to the package if it isn't installed here) and python3 for a static server.
#   tests/run.sh            everything        tests/run.sh --server   server tests only
set -u; cd "$(dirname "$0")/.."; ROOT=$PWD; fail=0
run() { local out; out=$(timeout 600 node "$@" 2>&1); if [ $? -eq 0 ]; then echo "ok    $*"; else echo "FAIL  $*"; echo "$out" | grep -v "ExperimentalWarning\|trace-warnings" | tail -25; fail=1; fi; }
for t in tests/gtest/test*.mjs tests/gtest/agent-test.mjs; do run "$t" "$ROOT"; done
if [ "${1:-}" != "--server" ]; then
  python3 -m http.server 8099 --directory "$ROOT" >/dev/null 2>&1 & SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT; sleep 1
  for t in tests/ui/*.mjs; do for d in desktop mobile; do run "$t" "$ROOT" "$d"; done; done
fi
[ $fail = 0 ] && echo "all green" || echo "something failed"; exit $fail
