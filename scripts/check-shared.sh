#!/usr/bin/env bash
# Checks that the shared files are the same in every mod that has them. A mod installs alone and
# cannot import another's code, so hooks/ui.tsx and its test are copies: change one, copy it to
# the others, and run this.
set -euo pipefail
cd "$(dirname "$0")/.."
status=0
for file in hooks/ui.tsx tests/ui.test.ts; do
  copies=(*/"$file")
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
