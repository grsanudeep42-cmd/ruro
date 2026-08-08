#!/usr/bin/env bash
# Create a commit as sir only — bypasses Cursor co-author injection.
# Usage: scripts/commit-as-sir.sh "subject" "body"
set -euo pipefail
subject="${1:?subject required}"
body="${2:-}"
export GIT_AUTHOR_NAME="Anudeep GRS"
export GIT_AUTHOR_EMAIL="grsanudeep42@gmail.com"
export GIT_COMMITTER_NAME="Anudeep GRS"
export GIT_COMMITTER_EMAIL="grsanudeep42@gmail.com"
tree=$(git write-tree)
parents=()
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  parents=(-p HEAD)
fi
if [[ -n "$body" ]]; then
  msg="${subject}"$'\n\n'"${body}"
else
  msg="$subject"
fi
commit=$(printf '%s\n' "$msg" | git commit-tree "$tree" "${parents[@]}")
git reset --hard "$commit" >/dev/null
echo "$commit"
