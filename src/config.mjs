// src/config.mjs
//
// User-config loader for groundtruth.
//
// Looks for `.groundtruthrc.json` in this order, first hit wins:
//   1. $GROUNDTRUTH_CONFIG (explicit path)
//   2. ./.groundtruthrc.json (current directory)
//   3. ~/.groundtruthrc.json (user home)
//
// Schema (all fields optional):
//   {
//     "exclude_patterns": [
//       "regex source 1",
//       "regex source 2"
//     ],
//     "exclude_paths": [
//       "**/observer-sessions/**",
//       "/path/to/exclude"
//     ],
//     "extra_test_commands": [
//       "my-custom-test-runner",
//       "tap"
//     ],
//     "extra_build_commands": [
//       "deno task build"
//     ]
//   }
//
// Per-user calibration: every user's prose has its own false-positive shapes.
// This file lets users add exclusions without forking. Loaded once per CLI
// invocation; safe if missing (returns empty config).

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

/** @typedef {{
 *   exclude_patterns: RegExp[],
 *   exclude_paths: string[],
 *   extra_test_commands: RegExp[],
 *   extra_build_commands: RegExp[],
 *   loaded_from: string | null
 * }} UserConfig
 */

const EMPTY = {
  exclude_patterns: [],
  exclude_paths: [],
  extra_test_commands: [],
  extra_build_commands: [],
  loaded_from: null,
};

function compileRegex(source, flags = "i") {
  // Tolerant compile: skip patterns that don't compile, warn to stderr.
  try {
    return new RegExp(source, flags);
  } catch (err) {
    process.stderr.write(
      `groundtruth config: skipping invalid regex /${source}/: ${err.message}\n`,
    );
    return null;
  }
}

function compileMany(arr, flags) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => compileRegex(s, flags)).filter(Boolean);
}

/**
 * Resolve which config file to load.
 */
export function findConfigPath() {
  if (process.env.GROUNDTRUTH_CONFIG) {
    const p = resolve(process.env.GROUNDTRUTH_CONFIG);
    if (existsSync(p)) return p;
  }
  const cwdPath = resolve(".groundtruthrc.json");
  if (existsSync(cwdPath)) return cwdPath;
  const homePath = join(homedir(), ".groundtruthrc.json");
  if (existsSync(homePath)) return homePath;
  return null;
}

/**
 * Load and parse the user config. Returns EMPTY config if none found.
 * Never throws; logs to stderr on parse errors.
 */
export function loadConfig() {
  const path = findConfigPath();
  if (!path) return { ...EMPTY };
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    process.stderr.write(`groundtruth config: cannot read ${path}: ${err.message}\n`);
    return { ...EMPTY };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(
      `groundtruth config: ${path} is not valid JSON: ${err.message}\n`,
    );
    return { ...EMPTY };
  }
  return {
    exclude_patterns: compileMany(parsed.exclude_patterns, "i"),
    exclude_paths: Array.isArray(parsed.exclude_paths) ? parsed.exclude_paths : [],
    extra_test_commands: compileMany(parsed.extra_test_commands, ""),
    extra_build_commands: compileMany(parsed.extra_build_commands, ""),
    loaded_from: path,
  };
}

/**
 * Check whether a session-file path matches any of the user's
 * `exclude_paths` glob-ish patterns. Supports basic `**` and `*` globs
 * and exact path prefixes.
 */
export function pathIsExcluded(filePath, excludePatterns) {
  if (!Array.isArray(excludePatterns) || excludePatterns.length === 0) return false;
  for (const pattern of excludePatterns) {
    if (typeof pattern !== "string") continue;
    if (filePath.startsWith(pattern)) return true;
    // Convert simple **/glob/* patterns to regex
    const re = globToRegex(pattern);
    if (re && re.test(filePath)) return true;
  }
  return false;
}

function globToRegex(glob) {
  try {
    let re = "";
    let i = 0;
    while (i < glob.length) {
      const c = glob[i];
      if (c === "*") {
        if (glob[i + 1] === "*") {
          re += ".*";
          i += 2;
          if (glob[i] === "/") i++;
          continue;
        }
        re += "[^/]*";
      } else if (c === "?") {
        re += "[^/]";
      } else if (".+()|^$[]{}".includes(c)) {
        re += `\\${c}`;
      } else {
        re += c;
      }
      i++;
    }
    return new RegExp(`^${re}$`);
  } catch {
    return null;
  }
}

export const _internals = { compileRegex, globToRegex };
