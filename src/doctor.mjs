// src/doctor.mjs
//
// `groundtruth doctor` — diagnostic. Walks the user's environment and
// reports anything that would prevent groundtruth from working: wrong
// Node version, missing skill, missing or misshapen Stop hook in
// settings.json, missing PATH, missing claude binary, ~/.config/gh
// permission issues (we hit one in this session), config file syntax
// errors, etc.
//
// Output is a list of checks with PASS / WARN / FAIL each. Exits 0 if
// no FAILs (warnings are OK), 1 if any FAIL.

import { readFileSync, existsSync, accessSync, constants } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { findConfigPath, loadConfig } from "./config.mjs";

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
};
function useColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
}
function pass(msg) {
  return `  ${useColor() ? COLORS.green + "✓" + COLORS.reset : "[PASS]"} ${msg}`;
}
function warn(msg) {
  return `  ${useColor() ? COLORS.yellow + "!" + COLORS.reset : "[WARN]"} ${msg}`;
}
function fail(msg) {
  return `  ${useColor() ? COLORS.red + "✗" + COLORS.reset : "[FAIL]"} ${msg}`;
}

function nodeMajor() {
  const m = process.versions.node.match(/^(\d+)\./);
  return m ? parseInt(m[1], 10) : 0;
}

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim();
  } catch {
    return null;
  }
}

function isWritableDir(path) {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the diagnostic. Returns { lines: string[], hasFailures: boolean }.
 */
export function runDoctorChecks(opts = {}) {
  const lines = [];
  let hasFailures = false;
  const claudeHome = join(homedir(), ".claude");
  const settingsPath = join(claudeHome, "settings.json");
  const skillPath = join(claudeHome, "skills", "groundtruth", "SKILL.md");

  lines.push("groundtruth doctor");
  lines.push("");

  // Node version
  const major = nodeMajor();
  if (major >= 18) {
    lines.push(pass(`node ${process.version} (>= 18 required)`));
  } else {
    lines.push(fail(`node ${process.version} is too old; install Node >= 18`));
    hasFailures = true;
  }

  // Claude Code present
  const claudeVer = safeExec("claude --version");
  if (claudeVer) {
    lines.push(pass(`claude binary on PATH: ${claudeVer.split("\n")[0]}`));
  } else {
    lines.push(warn("claude binary not on PATH; install with: npm i -g @anthropic-ai/claude-code"));
  }

  // ~/.claude exists
  if (existsSync(claudeHome)) {
    lines.push(pass(`~/.claude exists at ${claudeHome}`));
  } else {
    lines.push(fail("~/.claude does not exist; have you used Claude Code on this machine?"));
    hasFailures = true;
  }

  // settings.json present and parseable
  if (existsSync(settingsPath)) {
    let settings;
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      lines.push(pass(`~/.claude/settings.json present and valid JSON`));
    } catch (err) {
      lines.push(fail(`~/.claude/settings.json is not valid JSON: ${err.message}`));
      hasFailures = true;
      settings = null;
    }
    // Stop hook present?
    if (settings) {
      const stopArr = settings.hooks?.Stop;
      if (Array.isArray(stopArr)) {
        const hasGt = stopArr.some((entry) =>
          (entry?.hooks || []).some(
            (h) => h?.command && h.command.includes("groundtruth") && h.command.includes("hook"),
          ),
        );
        if (hasGt) {
          lines.push(pass("Stop hook for groundtruth is registered"));
        } else {
          lines.push(warn("Stop hook is configured but no groundtruth entry — run `groundtruth install`"));
        }
      } else {
        lines.push(warn("no Stop hook configured — run `groundtruth install`"));
      }
      // PreToolUse memory hook?
      const preArr = settings.hooks?.PreToolUse;
      if (Array.isArray(preArr) && preArr.some((entry) =>
        (entry?.hooks || []).some(
          (h) => h?.command && h.command.includes("groundtruth") && h.command.includes("memory-hook"),
        ),
      )) {
        lines.push(pass("PreToolUse memory hook is registered"));
      } else {
        lines.push(warn("PreToolUse memory hook NOT registered (opt-in: install with --with-memory-gate)"));
      }
    }
  } else {
    lines.push(warn(`no ~/.claude/settings.json — run \`groundtruth install\``));
  }

  // Skill installed
  if (existsSync(skillPath)) {
    lines.push(pass(`skill installed at ${skillPath}`));
  } else {
    lines.push(warn(`skill not installed — run \`groundtruth install\``));
  }

  // ~/.local/bin on PATH
  const localBin = join(homedir(), ".local", "bin");
  if ((process.env.PATH || "").split(":").includes(localBin)) {
    lines.push(pass(`${localBin} is on PATH`));
  } else if (existsSync(join(localBin, "groundtruth"))) {
    lines.push(warn(`${localBin} is NOT on PATH (groundtruth symlink exists; add 'export PATH="$HOME/.local/bin:$PATH"' to your shell rc)`));
  } else {
    lines.push(warn(`${localBin} is not on PATH and no groundtruth symlink found`));
  }

  // ~/.config/gh write permission (we hit a permission issue here in this session; warn early)
  const ghConfigDir = join(homedir(), ".config", "gh");
  if (existsSync(ghConfigDir)) {
    if (isWritableDir(ghConfigDir)) {
      lines.push(pass(`~/.config/gh is writable`));
    } else {
      lines.push(warn(`~/.config/gh is not writable by current user — gh auth/refresh may fail. Fix: sudo chown -R $(whoami) ~/.config`));
    }
  }

  // .groundtruthrc.json
  const cfgPath = findConfigPath();
  if (cfgPath) {
    const cfg = loadConfig();
    lines.push(pass(`config loaded from ${cfgPath}: ${cfg.exclude_patterns.length} exclude pattern(s), ${cfg.exclude_paths.length} exclude path(s)`));
  } else {
    lines.push(warn("no .groundtruthrc.json found (optional; run `groundtruth init` to create one)"));
  }

  // Tests reachable from repo root if invoked from inside the repo
  const repoRoot = opts.repoRoot;
  if (repoRoot && existsSync(join(repoRoot, "test"))) {
    lines.push(pass(`test directory present in repo at ${repoRoot}`));
  }

  // Final summary
  lines.push("");
  if (hasFailures) {
    lines.push(useColor() ? `${COLORS.red}One or more failures.${COLORS.reset} Fix the FAIL items above and re-run.` : "One or more failures. Fix the FAIL items above and re-run.");
  } else {
    lines.push(useColor() ? `${COLORS.green}No failures.${COLORS.reset} ${lines.filter((l) => l.includes("WARN") || l.includes("!")).length} warning(s). groundtruth should work.` : `No failures. groundtruth should work.`);
  }

  return { lines, hasFailures };
}

export async function runDoctor(args, opts = {}) {
  const flags = { json: false };
  for (const a of args) {
    if (a === "--json") flags.json = true;
  }
  const result = runDoctorChecks(opts);
  if (flags.json) {
    process.stdout.write(JSON.stringify({ has_failures: result.hasFailures, lines: result.lines.map((l) => l.replace(/\x1b\[\d+m/g, "")) }, null, 2) + "\n");
  } else {
    process.stdout.write(result.lines.join("\n") + "\n");
  }
  process.exit(result.hasFailures ? 1 : 0);
}
