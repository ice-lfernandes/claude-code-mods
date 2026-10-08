#!/usr/bin/env bash
# Regenerates screenshots/*.svg from what each mod actually draws.
# Each <mod>.snap.tsx drives the mod through `claude plugin test` with sample data and prints the
# trees it drew; render.py turns them into terminal-style SVG images.
set -euo pipefail
cd "$(dirname "$0")/../.."
out=$(mktemp -d)
trap 'rm -rf "$out"; rm -f */tests/zz-snap.test.tsx' EXIT
for mod in limits-meter allowlist-coach agent-watch; do
  cp "scripts/screenshots/$mod.snap.tsx" "$mod/tests/zz-snap.test.tsx"
  claude plugin test "./$mod" 2>&1 | grep -E '^(TOAST|STATUS|TREE|BAND|PANE|NOTICE) ' > "$out/$mod.txt"
  rm "$mod/tests/zz-snap.test.tsx"
done
python3 scripts/screenshots/render.py "$out" screenshots
