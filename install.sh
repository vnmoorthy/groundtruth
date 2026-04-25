#!/usr/bin/env bash
# install.sh — single-paste installer for groundtruth.
#
# The canonical one-liner is:
#
#   curl -fsSL https://raw.githubusercontent.com/vnmoorthy/groundtruth/main/install.sh | bash
#
# What this does:
#   1. Clones (or updates) the repo into ~/.groundtruth
#   2. Verifies node >= 18 is available
#   3. Runs `node bin/groundtruth.mjs install` which:
#        - copies the skill into ~/.claude/skills/groundtruth
#        - registers a Stop hook in ~/.claude/settings.json
#   4. Symlinks `groundtruth` into ~/.local/bin (if writable) so the CLI is on PATH
#   5. Runs `groundtruth status` so you can see what happened
#
# Runs in under 30 seconds on a typical machine. Prints every step.
# Safe to re-run: detects existing install and updates in place.

set -euo pipefail

REPO_URL="${GROUNDTRUTH_REPO:-https://github.com/vnmoorthy/groundtruth.git}"
INSTALL_DIR="${GROUNDTRUTH_INSTALL_DIR:-$HOME/.groundtruth}"
BIN_TARGET="${GROUNDTRUTH_BIN_TARGET:-$HOME/.local/bin}"
BRANCH="${GROUNDTRUTH_BRANCH:-main}"

_bold() { printf "\033[1m%s\033[0m\n" "$*"; }
_dim()  { printf "\033[2m%s\033[0m\n" "$*"; }
_ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
_info() { printf "  \033[36m→\033[0m %s\n" "$*"; }
_warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }
_err()  { printf "  \033[31m✗\033[0m %s\n" "$*" >&2; }

_require() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    _err "required command '$cmd' not found on PATH"
    exit 1
  fi
}

_bold "groundtruth installer"
echo

# Detect whether we're being run from inside an existing checkout
# (e.g. user did `git clone ... && cd groundtruth && bash install.sh`).
# In that case we skip the remote clone and install from the checkout.
SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
if [ -f "$SCRIPT_SOURCE" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" && pwd)"
else
  SCRIPT_DIR=""
fi

LOCAL_MODE=0
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/bin/groundtruth.mjs" ] && [ -d "$SCRIPT_DIR/skills/groundtruth" ]; then
  LOCAL_MODE=1
  INSTALL_DIR="$SCRIPT_DIR"
  _info "installing from local checkout: $INSTALL_DIR"
fi

# 1. Sanity checks
_info "checking prerequisites"
_require node
if [ "$LOCAL_MODE" -eq 0 ]; then
  _require git
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  _err "node >= 18 is required (found $(node --version))"
  exit 1
fi
_ok "node $(node --version)"
if [ "$LOCAL_MODE" -eq 0 ]; then
  _ok "git $(git --version | awk '{print $3}')"
fi
echo

# 2. Clone or update (skipped in local mode)
if [ "$LOCAL_MODE" -eq 0 ]; then
  if [ -d "$INSTALL_DIR/.git" ]; then
    _info "updating existing install at $INSTALL_DIR"
    ( cd "$INSTALL_DIR" && git fetch --quiet origin "$BRANCH" && git reset --hard --quiet "origin/$BRANCH" )
    _ok "updated"
  elif [ -d "$INSTALL_DIR" ]; then
    _warn "$INSTALL_DIR exists but is not a git checkout"
    _warn "moving it aside to $INSTALL_DIR.bak.$(date +%s)"
    mv "$INSTALL_DIR" "$INSTALL_DIR.bak.$(date +%s)"
    _info "cloning $REPO_URL"
    git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    _ok "cloned"
  else
    _info "cloning $REPO_URL → $INSTALL_DIR"
    git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    _ok "cloned"
  fi
  echo
fi

# 3. Run the in-tree installer to register the Stop hook and copy the skill.
_info "registering Stop hook and installing skill"
( cd "$INSTALL_DIR" && node bin/groundtruth.mjs install )
echo

# 4. Symlink into PATH if possible.
mkdir -p "$BIN_TARGET"
SYMLINK="$BIN_TARGET/groundtruth"
SCRIPT="$INSTALL_DIR/bin/groundtruth.mjs"

if [ -L "$SYMLINK" ] || [ -e "$SYMLINK" ]; then
  _info "refreshing symlink at $SYMLINK"
  rm -f "$SYMLINK"
fi
ln -s "$SCRIPT" "$SYMLINK"
chmod +x "$SCRIPT"
_ok "symlinked $SYMLINK → $SCRIPT"

case ":$PATH:" in
  *":$BIN_TARGET:"*)
    _ok "$BIN_TARGET is already on PATH"
    ;;
  *)
    _warn "$BIN_TARGET is not on your PATH"
    _warn "add this to your shell rc file:"
    echo '    export PATH="$HOME/.local/bin:$PATH"'
    ;;
esac
echo

# 5. Show status.
_bold "status"
( cd "$INSTALL_DIR" && node bin/groundtruth.mjs status )
echo
_bold "next step"
echo "  Open a new Claude Code session. On the first turn that ends with an"
echo "  unverified completion claim, the Stop hook will block and explain why."
echo
echo "  Run \`groundtruth audit\` to scan past sessions for unverified claims."
echo
