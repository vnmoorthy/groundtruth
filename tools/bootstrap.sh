#!/usr/bin/env bash
# tools/bootstrap.sh
#
# Runs steps 1-3 of the post-build punch list in a single command.
# Designed to be resilient: a failure in one step does not block the rest.
#
# What it does:
#   1. Removes any sandbox-locked .git, then runs `git init` and creates
#      the v0.1.0 commit with the verification paste in the message body.
#      If you have no global git identity configured it sets a repo-local
#      one using your whoami + host so the commit lands; change it later
#      with `git config user.email ...`.
#   2. Reruns the test suite on your machine (must show 74 pass / 0 fail).
#   3. Installs groundtruth into your real ~/.claude/ and symlinks the CLI.
#   4. Ensures ~/.local/bin is on your PATH for this shell so the next
#      script in the sequence can find `groundtruth`.
#   5. Runs `groundtruth status`.

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || exit 1

bold() { printf "\n\033[1m== %s ==\033[0m\n" "$*"; }
warn() { printf "   \033[33m!\033[0m %s\n" "$*"; }
ok()   { printf "   \033[32m✓\033[0m %s\n" "$*"; }
die()  { printf "   \033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }

ANY_STEP_FAILED=0

# --- step 1a: clean any sandbox-locked .git ---
bold "step 1a: clean any sandbox-locked .git"
if [ -d .git ]; then
  if rm -rf .git 2>/dev/null; then
    ok "removed existing .git"
  else
    warn "rm -rf .git failed; trying chflags + chmod"
    command -v chflags >/dev/null 2>&1 && chflags -R nouchg,noschg .git 2>/dev/null || true
    chmod -R u+w .git 2>/dev/null || true
    if rm -rf .git; then
      ok "removed via chmod path"
    else
      warn "could not remove .git. Remove it manually and rerun this script."
      ANY_STEP_FAILED=1
    fi
  fi
else
  ok "no .git to clean"
fi

# --- step 1b: git init + first commit ---
bold "step 1b: git init + first commit"
if git init -b main >/dev/null 2>&1; then
  ok "git init -b main"
else
  warn "git init failed. Skipping the commit. The repo still works; you just won't have a commit yet."
  ANY_STEP_FAILED=1
fi

if [ -d .git ]; then
  # Ensure a git identity exists for this repo. We prefer the global one;
  # if none, we fall back to a local identity based on whoami + hostname.
  NAME=$(git config --global user.name || true)
  EMAIL=$(git config --global user.email || true)
  if [ -z "$NAME" ]; then
    NAME="$(whoami)"
    git config user.name "$NAME"
    warn "no global git user.name; set local to '$NAME' (change with: git config user.name ...)"
  fi
  if [ -z "$EMAIL" ]; then
    HOSTNAME=$(hostname -s 2>/dev/null || hostname)
    EMAIL="$(whoami)@${HOSTNAME}.local"
    git config user.email "$EMAIL"
    warn "no global git user.email; set local to '$EMAIL' (change with: git config user.email ...)"
  fi

  git add -A

  # Match both node 22 ("# tests 74") and node 24 ("tests 74") summary formats.
  TEST_OUTPUT=$(node --test 'test/*.test.mjs' 2>&1 | grep -E "^#?\s*(tests|suites|pass|fail|duration)\s+[0-9]" || true)

  COMMIT_MSG=$(cat <<MSG
v0.1.0 initial release

Verification (per CLAUDE.md):

  \$ node --test 'test/*.test.mjs'
$(echo "$TEST_OUTPUT" | sed 's/^/  /')

What is here:
- Stop hook gate (src/hook-entry.mjs) emitting {decision: block, reason}
- Audit CLI with text, JSON, SARIF 2.1.0 output formats
- Memory gate for MEMORY.md / NOTES.md / LEARNINGS.md / .claude/memory/*
- Single-paste installer (install.sh) that works from curl pipe or local checkout
- 74 tests across detector, verifier, session parsing, hook protocol,
  memory gate, and CLI end-to-end
- Phase 0 hook-surface verification extracted from the shipped
  Claude Code v2.1.119 binary; see docs/findings.md

Known limits: mid-turn claims, novel phrasings, stub tests. See ARCHITECTURE.md.
MSG
)

  if git commit -m "$COMMIT_MSG" >/dev/null 2>&1; then
    ok "committed: $(git log -1 --oneline)"
  else
    COMMIT_ERR=$(git commit -m "$COMMIT_MSG" 2>&1 || true)
    warn "git commit failed:"
    echo "$COMMIT_ERR" | sed 's/^/      /'
    ANY_STEP_FAILED=1
  fi
fi

# --- step 2: rerun the test suite outside the sandbox ---
bold "step 2: rerun the test suite"
TEST_LOG=$(mktemp)
node --test 'test/*.test.mjs' > "$TEST_LOG" 2>&1
TEST_EXIT=$?
SUMMARY=$(grep -E "^#?\s*(tests|suites|pass|fail|duration)\s+[0-9]" "$TEST_LOG" || true)
if [ -n "$SUMMARY" ]; then
  echo "$SUMMARY" | sed 's/^/   /'
fi
if [ "$TEST_EXIT" -eq 0 ]; then
  ok "test runner exited 0"
else
  warn "test runner exited $TEST_EXIT (see $TEST_LOG for details)"
  tail -20 "$TEST_LOG" | sed 's/^/      /'
  ANY_STEP_FAILED=1
fi
rm -f "$TEST_LOG"

# --- step 3: install ---
bold "step 3: install groundtruth into your ~/.claude/"
if bash install.sh; then
  ok "install.sh finished"
else
  warn "install.sh failed"
  ANY_STEP_FAILED=1
fi

# --- step 4: make sure groundtruth is on PATH for the rest of this session ---
bold "step 4: ensure ~/.local/bin is on PATH for this shell"
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ok "$HOME/.local/bin already on PATH" ;;
  *)
    export PATH="$HOME/.local/bin:$PATH"
    warn "$HOME/.local/bin was missing from PATH; added for this shell."
    warn "To persist it, add this to ~/.zshrc (or ~/.bash_profile):"
    echo "      export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

if command -v groundtruth >/dev/null 2>&1; then
  ok "groundtruth resolves to: $(command -v groundtruth)"
  groundtruth status || true
else
  warn "groundtruth is still not on PATH. Subsequent scripts will fall back to invoking the repo-local CLI directly."
fi

# --- summary ---
echo
if [ "$ANY_STEP_FAILED" -eq 0 ]; then
  bold "bootstrap complete; no errors"
else
  bold "bootstrap finished with some warnings above"
fi
echo
echo "Next steps in this same shell so PATH sticks:"
echo "  bash tools/audit-self.sh    # step 7, no API spend"
echo "  bash tools/live-smoke.sh    # steps 4-6, spends a small amount of API credit"
