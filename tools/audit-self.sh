#!/usr/bin/env bash
# tools/audit-self.sh
#
# Step 7 of the punch list: audit your own Claude Code session history.
#
# Resilient to groundtruth not being on PATH: falls back to invoking the
# repo-local CLI directly. Run this from the repo root (or any subdir);
# the script resolves its own location.
#
# No API spend. Read-only over your local files.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bold() { printf "\n\033[1m== %s ==\033[0m\n" "$*"; }

# Resolve a groundtruth invocation. Prefer the one on PATH (installed),
# fall back to running the repo-local CLI via node.
if command -v groundtruth >/dev/null 2>&1; then
  GT=(groundtruth)
else
  GT=(node "$REPO_DIR/bin/groundtruth.mjs")
  printf "  (using repo-local CLI: %s)\n" "$REPO_DIR/bin/groundtruth.mjs"
fi

if [ ! -d "$HOME/.claude/projects" ]; then
  echo "  no ~/.claude/projects directory found. Have you used Claude Code on this machine?"
  exit 1
fi

OUT="/tmp/groundtruth-audit-$(date +%Y%m%dT%H%M%S).json"

bold "running groundtruth audit on ~/.claude/projects"
"${GT[@]}" audit --json --limit 50 "$HOME/.claude/projects" > "$OUT" 2>/dev/null || true

if [ ! -s "$OUT" ] || ! jq -e . "$OUT" >/dev/null 2>&1; then
  echo "  audit produced no JSON. Re-running verbosely to show errors:"
  "${GT[@]}" audit --limit 10 "$HOME/.claude/projects" | head -40
  exit 1
fi

SUMMARY=$(jq '{files_scanned: .files_scanned, turns: .total_turns, verified: .verified, findings: (.findings|length)}' "$OUT")
echo "$SUMMARY"
echo
echo "  full report saved to $OUT"

bold "top 10 findings (hand-judge these to calibrate)"
TOP=$(jq -r '.findings[:10][] | "\(.file)\t\(.line_start)\t\(.pattern)\t\(.word)\t\(.claim)"' "$OUT")
if [ -z "$TOP" ]; then
  echo "  zero findings across your session history. Either your sessions are"
  echo "  well-verified, or the detector is missing claims. Run a few turns with"
  echo "  an intentional unverified 'Done.' and re-audit to sanity-check."
else
  echo "$TOP" | awk -F'\t' '
    {
      printf "  %s:%s\n", $1, $2;
      printf "    pattern: %s    trigger: %s\n", $3, $4;
      # Truncate long claims for readability.
      claim = $5;
      if (length(claim) > 180) claim = substr(claim, 1, 180) "...";
      printf "    \"%s\"\n\n", claim;
    }'
fi

bold "what to do next"
cat <<'NEXT'
  Read the top findings above. For each one decide:
    - true positive (agent really did claim done without evidence) → leave it
    - false positive (phrasing was not actually a completion claim) → add the
      sentence to test/fixtures/false-positives.jsonl, add a regex exclusion
      to src/detector.mjs EXCLUSION_PATTERNS, then rerun the tests:
          node --test 'test/*.test.mjs'
      Loop until precision is acceptable.

  When the top 10 look mostly like real issues, the detector is calibrated.
  Commit the new exclusions, bump the patch version (e.g. 0.1.x -> 0.1.x+1),
  and tag the release.
NEXT
