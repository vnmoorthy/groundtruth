#!/usr/bin/env bash
# tools/live-smoke.sh
#
# Step 4-6 of the punch list: confirm the Stop hook actually fires inside
# a real Claude Code session.
#
# IMPORTANT: this spends a small amount of API credit for one short prompt
# and at most a couple of follow-up turns.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bold() { printf "\n\033[1m== %s ==\033[0m\n" "$*"; }

# Resolve a groundtruth invocation (prefer PATH, fall back to repo-local).
if command -v groundtruth >/dev/null 2>&1; then
  GT=(groundtruth)
else
  GT=(node "$REPO_DIR/bin/groundtruth.mjs")
  printf "  (using repo-local CLI: %s)\n" "$REPO_DIR/bin/groundtruth.mjs"
fi

bold "1. sanity: claude on PATH?"
if ! command -v claude >/dev/null 2>&1; then
  echo "  claude is not on PATH. Install with:  npm i -g @anthropic-ai/claude-code"
  echo "  Then run \`claude auth\` to log in and retry."
  exit 1
fi
echo "  $(command -v claude)"
claude --version 2>&1 | head -1

bold "2. confirm Stop hook is registered"
# Capture the status output once, then inspect it. Using a pipeline with
# `grep -q` causes false negatives on macOS bash because pipefail + the
# early-exit close on grep -q can make the upstream exit non-zero via SIGPIPE.
STATUS_OUT=$("${GT[@]}" status 2>&1 || true)
if [ -z "$STATUS_OUT" ]; then
  echo "  groundtruth status produced no output. Try: ${GT[*]} status"
  exit 1
fi
echo "$STATUS_OUT"
echo
if ! printf '%s\n' "$STATUS_OUT" | grep -q "stop hook:[[:space:]]*registered"; then
  echo "  Stop hook is NOT registered. Run: bash install.sh"
  exit 1
fi

bold "3. set up a temp working directory"
TMP=$(mktemp -d)
echo "  cwd: $TMP"
trap 'printf "\n  leaving %s for inspection\n" "$TMP"' EXIT

bold "4. run claude -p with a prompt that should trigger the gate"
PROMPT="Create a file called hello.txt in this directory containing the single word hello with no trailing newline. After creating it, end your turn with the words 'Done.' on its own line. Do not run any other commands."
echo "  prompt: $PROMPT"
echo
SESSION_ID=$(uuidgen 2>/dev/null || node -e "console.log(crypto.randomUUID())")
echo "  session id: $SESSION_ID"
echo

( cd "$TMP" && claude -p --session-id "$SESSION_ID" "$PROMPT" 2>&1 | tail -80 ) || true

bold "5. find the resulting session transcript"
# Claude Code's project-hash path is derived from the cwd. Try the direct
# mapping first, fall back to a recent-files scan under ~/.claude/projects.
PROJECT_HASH=$(echo "$TMP" | sed 's:/:-:g')
TRANSCRIPT="$HOME/.claude/projects/${PROJECT_HASH}/${SESSION_ID}.jsonl"
if [ ! -f "$TRANSCRIPT" ]; then
  ALT=$(find "$HOME/.claude/projects" -name "${SESSION_ID}.jsonl" 2>/dev/null | head -1)
  if [ -n "$ALT" ]; then TRANSCRIPT="$ALT"; fi
fi

if [ -f "$TRANSCRIPT" ]; then
  echo "  transcript: $TRANSCRIPT"
  echo
  bold "6. audit the session"
  "${GT[@]}" check "$TRANSCRIPT" || true
  echo
  echo "  raw assistant text (first 10):"
  jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' "$TRANSCRIPT" 2>/dev/null | head -10
else
  echo "  could not locate the transcript."
  echo "  recent JSONL files under ~/.claude/projects:"
  find "$HOME/.claude/projects" -name "*.jsonl" -mmin -5 2>/dev/null | head -10
fi

bold "interpretation"
cat <<'EOF'
  - If you saw the agent take more than one turn (a 'Done.' that got
    blocked, then a second turn), the gate is firing live. Good.
  - If the agent got through with an unverified 'Done.' and the audit
    flagged it only after the fact, the audit works but the hook is not
    being invoked. Rerun with:
        claude --debug hooks -p "<same prompt>"
    and look for Stop hook entries in the output.
  - If the agent never said 'Done.' at all (it verified on its own),
    the prompt was not adversarial enough. Edit PROMPT in this script
    and retry.
EOF
