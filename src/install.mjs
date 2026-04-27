// src/install.mjs
//
// Install, uninstall, and status commands.
//
// install:    Register the Stop hook in ~/.claude/settings.json and copy the skill
// uninstall:  Remove the hook entry and the skill
// status:     Report whether the hook is registered and whether gstack/superpowers
//             are present so the user knows about composition.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";

const CLAUDE_HOME = join(homedir(), ".claude");
const SETTINGS_PATH = join(CLAUDE_HOME, "settings.json");
const SKILL_INSTALL_DIR = join(CLAUDE_HOME, "skills", "groundtruth");

const HOOK_MARKER = "groundtruth:stop";
const MEMORY_HOOK_MARKER = "groundtruth:memory";

function readSettings() {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `failed to read ${SETTINGS_PATH}: ${err.message}. Fix or remove the file and retry.`,
    );
  }
}

function writeSettings(obj) {
  if (!existsSync(CLAUDE_HOME)) mkdirSync(CLAUDE_HOME, { recursive: true });
  const text = JSON.stringify(obj, null, 2) + "\n";
  writeFileSync(SETTINGS_PATH, text, "utf8");
}

function backup(path) {
  if (!existsSync(path)) return null;
  const backupPath = `${path}.groundtruth-backup-${Date.now()}`;
  copyFileSync(path, backupPath);
  return backupPath;
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function hookCommandFor(repoRoot) {
  const hookPath = resolve(repoRoot, "bin", "groundtruth.mjs");
  return `node "${hookPath}" hook`;
}

function memoryHookCommandFor(repoRoot) {
  const hookPath = resolve(repoRoot, "bin", "groundtruth.mjs");
  return `node "${hookPath}" memory-hook`;
}

function ensureStopHookArray(settings) {
  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = [];
  return settings.hooks.Stop;
}

function ensurePreToolUseArray(settings) {
  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];
  return settings.hooks.PreToolUse;
}

function alreadyInstalled(stopArray, command) {
  for (const entry of stopArray) {
    if (!entry || typeof entry !== "object") continue;
    if (!Array.isArray(entry.hooks)) continue;
    for (const h of entry.hooks) {
      if (h && h.command && h.command.includes("groundtruth") && h.command.includes("hook")) {
        return true;
      }
    }
  }
  return false;
}

function copyDirSync(src, dst) {
  if (!existsSync(dst)) mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    const st = statSync(s);
    if (st.isDirectory()) {
      copyDirSync(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}

export async function installHook({ repoRoot, opts = {} }) {
  const command = hookCommandFor(repoRoot);
  const memoryHookCmd = memoryHookCommandFor(repoRoot);
  log("groundtruth install");
  if (opts.dryRun) log("  (dry run — no files will be written)");
  log("");

  // 1. Copy the skill to ~/.claude/skills/groundtruth/
  const skillSrc = resolve(repoRoot, "skills", "groundtruth");
  if (opts.noSkill) {
    log("  --no-skill: skipping skill install");
  } else if (existsSync(skillSrc)) {
    if (existsSync(SKILL_INSTALL_DIR)) {
      log(`  skill dir already present at ${SKILL_INSTALL_DIR} — would overwrite SKILL.md`);
    }
    if (!opts.dryRun) {
      copyDirSync(skillSrc, SKILL_INSTALL_DIR);
      log(`  installed skill → ${SKILL_INSTALL_DIR}`);
    } else {
      log(`  would install skill → ${SKILL_INSTALL_DIR}`);
    }
  } else {
    log(`  warning: skill source missing at ${skillSrc}`);
  }

  // 2. Register the Stop hook in settings.json
  if (opts.noHook) {
    log("  --no-hook: skipping Stop hook registration");
  } else {
    const settings = readSettings();
    const stopArray = ensureStopHookArray(settings);
    if (alreadyInstalled(stopArray, command)) {
      log("  stop hook already registered — skipping");
    } else {
      if (!opts.dryRun) {
        const backupPath = backup(SETTINGS_PATH);
        if (backupPath) log(`  backed up settings → ${backupPath}`);
      }
      stopArray.push({
        matcher: "",
        hooks: [
          {
            type: "command",
            command,
            timeout: 10,
            statusMessage: "groundtruth: checking for unverified completion claims",
            // Marker so future installs/uninstalls can find us
            _marker: HOOK_MARKER,
          },
        ],
      });
      // Optionally register the PreToolUse memory hook if --with-memory-gate
      if (opts.withMemoryGate) {
        const preArr = ensurePreToolUseArray(settings);
        preArr.push({
          matcher: "Write|Edit|MultiEdit|NotebookEdit",
          hooks: [
            {
              type: "command",
              command: memoryHookCmd,
              timeout: 10,
              statusMessage: "groundtruth: checking memory file write",
              _marker: MEMORY_HOOK_MARKER,
            },
          ],
        });
        log("  registered PreToolUse memory hook (Write|Edit on memory paths)");
      }
      if (!opts.dryRun) {
        writeSettings(settings);
        log(`  registered stop hook → ${SETTINGS_PATH}`);
      } else {
        log(`  would register stop hook → ${SETTINGS_PATH}`);
      }
    }
  }

  // 3. Report composition
  const gstack = existsSync(join(CLAUDE_HOME, "skills", "gstack")) ||
    existsSync(join(CLAUDE_HOME, "commands", "ship.md")) ||
    existsSync(join(CLAUDE_HOME, "commands", "ship"));
  const superpowers = existsSync(join(CLAUDE_HOME, "skills", "superpowers")) ||
    existsSync(join(CLAUDE_HOME, "plugins", "superpowers"));
  log("");
  log("composition:");
  log(`  gstack:       ${gstack ? "detected" : "not detected"}`);
  log(`  superpowers:  ${superpowers ? "detected" : "not detected"}`);
  if (gstack || superpowers) {
    log("  note: groundtruth fires at Stop, before /ship or /review hand off.");
  }
  log("");
  log("done. Open a new Claude Code session to pick up the hook.");
}

export async function uninstallHook() {
  log("groundtruth uninstall");
  log("");
  // Remove hook from settings.json (Stop AND PreToolUse)
  if (existsSync(SETTINGS_PATH)) {
    const settings = readSettings();
    let stopBefore = 0, stopAfter = 0;
    if (settings.hooks && Array.isArray(settings.hooks.Stop)) {
      stopBefore = settings.hooks.Stop.length;
      settings.hooks.Stop = settings.hooks.Stop
        .map((entry) => {
          if (!entry || !Array.isArray(entry.hooks)) return entry;
          entry.hooks = entry.hooks.filter(
            (h) => !(h && h.command && h.command.includes("groundtruth") && (h.command.includes("hook") || h.command.includes("memory-hook"))),
          );
          return entry;
        })
        .filter((entry) => entry && Array.isArray(entry.hooks) && entry.hooks.length > 0);
      stopAfter = settings.hooks.Stop.length;
      if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
    }
    let preBefore = 0, preAfter = 0;
    if (settings.hooks && Array.isArray(settings.hooks.PreToolUse)) {
      preBefore = settings.hooks.PreToolUse.length;
      settings.hooks.PreToolUse = settings.hooks.PreToolUse
        .map((entry) => {
          if (!entry || !Array.isArray(entry.hooks)) return entry;
          entry.hooks = entry.hooks.filter(
            (h) => !(h && h.command && h.command.includes("groundtruth")),
          );
          return entry;
        })
        .filter((entry) => entry && Array.isArray(entry.hooks) && entry.hooks.length > 0);
      preAfter = settings.hooks.PreToolUse.length;
      if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
    }
    if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
    if (stopBefore || preBefore) {
      const backupPath = backup(SETTINGS_PATH);
      if (backupPath) log(`  backed up settings → ${backupPath}`);
      writeSettings(settings);
      const stopRemoved = stopBefore - stopAfter;
      const preRemoved = preBefore - preAfter;
      if (stopRemoved > 0) log(`  removed ${stopRemoved} stop hook entr${stopRemoved === 1 ? "y" : "ies"}`);
      if (preRemoved > 0) log(`  removed ${preRemoved} PreToolUse hook entr${preRemoved === 1 ? "y" : "ies"}`);
    } else {
      log("  no groundtruth hooks configured — nothing to remove");
    }
  } else {
    log(`  no settings at ${SETTINGS_PATH} — nothing to remove`);
  }
  // Remove installed skill dir
  if (existsSync(SKILL_INSTALL_DIR)) {
    rmSync(SKILL_INSTALL_DIR, { recursive: true, force: true });
    log(`  removed installed skill → ${SKILL_INSTALL_DIR}`);
  }
  log("");
  log("done.");
}

export async function showStatus({ repoRoot }) {
  log("groundtruth status");
  log("");
  log(`  repo:             ${repoRoot}`);
  log(`  claude home:      ${CLAUDE_HOME}`);
  log(`  settings.json:    ${existsSync(SETTINGS_PATH) ? "present" : "missing"}`);
  const settings = existsSync(SETTINGS_PATH) ? readSettings() : {};
  const stopArr = (settings.hooks && settings.hooks.Stop) || [];
  const installed = alreadyInstalled(stopArr, "");
  log(`  stop hook:        ${installed ? "registered" : "not registered"}`);
  log(`  skill installed:  ${existsSync(SKILL_INSTALL_DIR) ? "yes" : "no"}`);

  const gstack = existsSync(join(CLAUDE_HOME, "skills", "gstack"));
  const superpowers = existsSync(join(CLAUDE_HOME, "skills", "superpowers")) ||
    existsSync(join(CLAUDE_HOME, "plugins", "superpowers"));
  log("");
  log("composition:");
  log(`  gstack:       ${gstack ? "detected" : "not detected"}`);
  log(`  superpowers:  ${superpowers ? "detected" : "not detected"}`);
  log("");
  if (!installed) {
    log("run `groundtruth install` to enable the stop hook.");
  }
}

export const _internals = {
  CLAUDE_HOME,
  SETTINGS_PATH,
  SKILL_INSTALL_DIR,
  hookCommandFor,
  alreadyInstalled,
  ensureStopHookArray,
};
