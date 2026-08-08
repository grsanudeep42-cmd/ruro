#!/usr/bin/env bash
# Strip Cursor auto co-author trailers from commit messages on HEAD history.
# Run before every push so GitHub never lists cursoragent as a contributor.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
if git log --format='%B' | grep -q 'Co-authored-by: Cursor <cursoragent@cursor.com>'; then
  FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f \
    --msg-filter 'sed "/^Co-authored-by: Cursor <cursoragent@cursor.com>\$/d"' \
    HEAD
  rm -rf .git/refs/original
fi
if git log --format='%B' | grep -q 'Co-authored-by: Cursor <cursoragent@cursor.com>'; then
  echo "error: Cursor co-author trailer still present" >&2
  exit 1
fi
echo "ok: no Cursor co-author trailers"
