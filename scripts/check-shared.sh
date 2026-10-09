#!/usr/bin/env bash
# Checks that the shared files are the same in every mod that has them. A mod installs alone and
# cannot import another's code, so hooks/ui.tsx, hooks/phrases.ts and their tests are copies:
# change one, copy it to the others, and run this. ui.tsx is in every mod; phrases.ts only in the
# mods that name tool calls.
set -euo pipefail
cd "$(dirname "$0")/.."
shopt -s nullglob
status=0
for file in hooks/ui.tsx tests/ui.test.ts hooks/phrases.ts tests/phrases.test.ts; do
  copies=(*/"$file")
  if [ ${#copies[@]} -eq 0 ]; then
    echo "missing: no mod has $file"
    status=1
    continue
  fi
  first=${copies[0]}
  for copy in "${copies[@]:1}"; do
    if ! cmp -s "$first" "$copy"; then
      echo "differs: $copy (from $first)"
      status=1
    fi
  done
  echo "$file: ${#copies[@]} copies checked"
done
exit $status
