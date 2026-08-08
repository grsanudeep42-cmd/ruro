#!/usr/bin/env bash
# Fail if any commit reachable from HEAD has Cursor co-author or non-sir committer.
set -euo pipefail
bad=0
while IFS= read -r line; do
  echo "error: $line" >&2
  bad=1
done < <(git log --format='%H%n%an <%ae>%n%cn <%ce>%n%B%n---' | awk '
  BEGIN{sha=""; auth=""; comm=""; body=""}
  /^---$/{
    if (body ~ /Co-authored-by: Cursor/ || body ~ /cursoragent@cursor.com/) {
      print sha " has Cursor co-author trailer"
    }
    if (comm !~ /Anudeep GRS <grsanudeep42@gmail.com>/ && comm !~ /grsanudeep42-cmd/) {
      # allow only sir identities
      if (comm ~ /cursoragent|github-actions|Cursor/) {
        print sha " committer is not sir: " comm
      }
    }
    body=""
    next
  }
  sha==""{sha=$0; next}
  auth==""{auth=$0; next}
  comm==""{comm=$0; next}
  {body=body $0 "\n"}
')
# simpler explicit checks
if git log --format='%B' | grep -F 'Co-authored-by: Cursor' >/dev/null; then
  echo "error: Cursor co-author trailer present in history" >&2
  bad=1
fi
if git log --format='%cn' | grep -Eic 'cursor|github-actions' >/dev/null; then
  echo "error: forbidden committer name in history" >&2
  git log --format='%h %cn <%ce> %s' | grep -Ei 'cursor|github-actions' >&2 || true
  bad=1
fi
if [[ "$bad" -ne 0 ]]; then
  exit 1
fi
echo "ok: authorship clean (sir only)"
