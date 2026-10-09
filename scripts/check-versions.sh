#!/usr/bin/env bash
# Checks that every mod changed since a base commit raised its version: Claude Code updates an
# installed plugin only when the version moves, so a change without a bump never reaches anyone.
# README and test changes alone count too: they ship with the plugin.
#
# Usage: scripts/check-versions.sh <base ref>    (a pull request's base, e.g. origin/main)
set -euo pipefail
cd "$(dirname "$0")/.."
base=${1:?usage: check-versions.sh <base ref>}
version() { python3 -c 'import json,sys; print(json.load(sys.stdin).get("version", ""))'; }
status=0
for manifest in */.claude-plugin/plugin.json; do
  mod=${manifest%%/*}
  if git diff --quiet "$base"...HEAD -- "$mod"; then continue; fi
  now=$(version < "$manifest")
  if ! was=$(git show "$base:$manifest" 2>/dev/null | version); then
    echo "$mod: new mod at $now"
    continue
  fi
  if [ "$now" = "$was" ]; then
    echo "error: $mod changed but its version is still $now"
    status=1
  elif [ "$(printf '%s\n%s\n' "$was" "$now" | sort -V | tail -1)" != "$now" ]; then
    echo "error: $mod version went down, $was to $now"
    status=1
  else
    echo "$mod: $was -> $now"
  fi
done
exit $status
