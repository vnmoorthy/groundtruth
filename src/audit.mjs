// src/audit.mjs
//
// Audit pass over one or more Claude Code session JSONL files.
// Prints a human-readable report of every unverified completion claim.

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { parseSessionFile, observationsForTurn } from "./session.mjs";
import { detectClaims } from "./detector.mjs";
import { detectVerifications } from "./verifier.mjs";
import { hasCodeContext } from "./code-context.mjs";
import { loadConfig, pathIsExcluded } from "./config.mjs";

/** @typedef {{
 *   file: string,
 *   turn: number,
 *   timestamp?: string,
 *   line_start?: number,
 *   line_end?: number,
 *   claim: string,
 *   word: string,
 *   pattern: string,
 *   pattern_source?: string,
 *   match?: string
 * }} Finding
 */

/** @typedef {{
 *   findings: Finding[],
 *   verified: number,
 *   suppressed_non_code: number,
 *   total_turns: number,
 *   files_scanned: number
 * }} AuditReport
 */

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function useColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
}

function c(color, text) {
  return useColor() ? `${COLORS[color]}${text}${COLORS.reset}` : text;
}

/**
 * Default discovery. If no path is given, walk ~/.claude/projects and
 * collect the most recent N session files.
 */
export function defaultSessionFiles(limit = 20) {
  const root = join(homedir(), ".claude", "projects");
  if (!existsSync(root)) return [];
  const all = [];
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    let st;
    try {
      st = statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const full = join(dir, f);
      try {
        const s = statSync(full);
        all.push({ path: full, mtime: s.mtimeMs });
      } catch {
        // skip unreadable
      }
    }
  }
  all.sort((a, b) => b.mtime - a.mtime);
  return all.slice(0, limit).map((x) => x.path);
}

/**
 * Audit a single session file.
 *
 * Default behavior applies the code-context filter: a turn whose claim
 * is not in a code-shaped context is suppressed, on the grounds that
 * groundtruth's scope per CLAUDE.md is code work, not general task
 * completion. Pass { includeNonCode: true } to bypass the filter and
 * see every claim regardless of context (useful for tuning).
 *
 * @param {string} filePath
 * @param {{ includeNonCode?: boolean }} [opts]
 */
export function auditSession(filePath, opts = {}) {
  const config = opts.config || loadConfig();
  if (pathIsExcluded(filePath, config.exclude_paths)) {
    return {
      findings: [],
      verified: 0,
      suppressed_non_code: 0,
      total_turns: 0,
      files_scanned: 1,
      excluded_by_config: true,
    };
  }
  const turns = parseSessionFile(filePath);
  /** @type {Finding[]} */
  const findings = [];
  let verifiedCount = 0;
  let suppressedCount = 0;
  for (const turn of turns) {
    if (turn.kind !== "assistant") continue;
    const claims = detectClaims(turn.text, { extraExclusions: config.exclude_patterns });
    if (claims.length === 0) continue;
    const obs = observationsForTurn(turn);
    const verifs = detectVerifications(obs);
    if (verifs.length > 0) {
      verifiedCount += 1;
      continue;
    }
    if (!opts.includeNonCode && !hasCodeContext(turn.text, obs)) {
      suppressedCount += 1;
      continue;
    }
    for (const claim of claims) {
      findings.push({
        file: filePath,
        turn: turn.index,
        timestamp: turn.timestamp,
        line_start: turn.line_start,
        line_end: turn.line_end,
        claim: claim.sentence,
        word: claim.word,
        pattern: claim.pattern,
        pattern_source: claim.pattern_source,
        match: claim.match,
      });
    }
  }
  return {
    findings,
    verified: verifiedCount,
    suppressed_non_code: suppressedCount,
    total_turns: turns.length,
  };
}

/**
 * Audit multiple files.
 * @param {string[]} files
 * @param {{ includeNonCode?: boolean }} [opts]
 */
export function auditSessions(files, opts = {}) {
  // Load config once and pass into every per-file call so we don't re-parse
  // the user's .groundtruthrc.json N times.
  const config = opts.config || loadConfig();
  /** @type {AuditReport} */
  const report = {
    findings: [],
    verified: 0,
    suppressed_non_code: 0,
    total_turns: 0,
    files_scanned: 0,
    excluded_by_config: 0,
    config_loaded_from: config.loaded_from,
  };
  for (const f of files) {
    try {
      const r = auditSession(f, { ...opts, config });
      if (r.excluded_by_config) {
        report.excluded_by_config += 1;
        continue;
      }
      report.findings.push(...r.findings);
      report.verified += r.verified;
      report.suppressed_non_code += r.suppressed_non_code || 0;
      report.total_turns += r.total_turns;
      report.files_scanned += 1;
    } catch (err) {
      process.stderr.write(`groundtruth: failed to audit ${f}: ${err.message}\n`);
    }
  }
  return report;
}

/**
 * Render a report as a human-readable string for a terminal.
 */
export function renderReport(report, opts = {}) {
  const lines = [];
  lines.push(c("bold", "groundtruth audit"));
  lines.push("");
  lines.push(`${c("dim", "files scanned:")} ${report.files_scanned}`);
  lines.push(`${c("dim", "assistant turns inspected:")} ${report.total_turns}`);
  lines.push(
    `${c("dim", "verified completion claims:")} ${c("green", String(report.verified))}`,
  );
  lines.push(
    `${c("dim", "unverified completion claims:")} ${
      report.findings.length > 0
        ? c("red", String(report.findings.length))
        : c("green", "0")
    }`,
  );
  if (report.suppressed_non_code > 0) {
    lines.push(
      `${c("dim", "suppressed (non-code context):")} ${c("dim", String(report.suppressed_non_code))} ${c("dim", "(rerun with --all to see)")}`,
    );
  }
  lines.push("");
  if (report.findings.length === 0) {
    lines.push(c("green", "No unverified completion claims found."));
    return lines.join("\n");
  }
  const byFile = new Map();
  for (const f of report.findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  for (const [file, finds] of byFile.entries()) {
    lines.push(c("bold", shortPath(file)));
    for (const f of finds) {
      const ts = f.timestamp ? ` at ${f.timestamp}` : "";
      const lineRange =
        f.line_start && f.line_end
          ? f.line_start === f.line_end
            ? `line ${f.line_start}`
            : `lines ${f.line_start}-${f.line_end}`
          : "line ?";
      lines.push(
        `  ${c("yellow", `turn ${f.turn}`)} ${c("cyan", lineRange)}${ts} ${c("dim", `[pattern: ${f.pattern}]`)}`,
      );
      const claim = f.claim.length > 160 ? `${f.claim.slice(0, 160)}…` : f.claim;
      lines.push(`    claim: ${c("red", `"${claim}"`)}`);
      lines.push(`    trigger: ${c("magenta", f.word)}`);
      if (opts.explain) {
        if (f.match) lines.push(`    matched: ${c("yellow", `"${f.match}"`)}`);
        if (f.pattern_source) {
          const truncated =
            f.pattern_source.length > 220
              ? `${f.pattern_source.slice(0, 220)}…`
              : f.pattern_source;
          lines.push(`    regex:   ${c("dim", `/${truncated}/i`)}`);
        }
        lines.push(
          `    fix:     add a sentence to test/fixtures/false-positives.jsonl, then a regex to EXCLUSION_PATTERNS in src/detector.mjs`,
        );
      }
    }
    lines.push("");
  }
  if (opts.footer !== false) {
    lines.push(
      c(
        "dim",
        "Tip: install the groundtruth Stop hook to block these at write-time instead of surfacing them after the fact.",
      ),
    );
  }
  return lines.join("\n");
}

function shortPath(p) {
  const home = homedir();
  if (p.startsWith(home)) return `~${p.slice(home.length)}`;
  return p;
}

/**
 * JSON renderer for machine consumers.
 */
export function renderReportJson(report) {
  return JSON.stringify(report, null, 2);
}

/**
 * SARIF 2.1.0 renderer. Usable by GitHub code scanning, GitLab, and
 * any CI system that consumes SARIF.
 * @param {AuditReport} report
 */
export function renderReportSarif(report) {
  const sarif = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "groundtruth",
            informationUri: "https://github.com/vnmoorthy/groundtruth",
            rules: [
              {
                id: "unverified-completion-claim",
                name: "UnverifiedCompletionClaim",
                shortDescription: {
                  text: "Assistant asserted completion without producing verification evidence in the same turn.",
                },
                fullDescription: {
                  text: "A Claude Code session turn contained a completion claim (done, fixed, implemented, etc.) but had no matching verification artifact such as a passing test, type check, build, or curl.",
                },
                defaultConfiguration: { level: "warning" },
              },
            ],
          },
        },
        results: report.findings.map((f) => ({
          ruleId: "unverified-completion-claim",
          level: "warning",
          message: {
            text: `Turn ${f.turn} contains an unverified completion claim: "${f.claim}" (trigger: ${f.word}, pattern: ${f.pattern})`,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.file },
                region: {
                  startLine: f.line_start || 1,
                  endLine: f.line_end || f.line_start || 1,
                },
              },
            },
          ],
          properties: {
            turn: f.turn,
            pattern: f.pattern,
            word: f.word,
          },
        })),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

/**
 * Discover files from CLI arguments. Accepts:
 *   - Specific .jsonl file paths
 *   - Directories (recursive one level for project-hash layout)
 *   - Nothing (then defaults to ~/.claude/projects most recent)
 */
export function discoverFromArgs(args) {
  if (args.length === 0) return defaultSessionFiles();
  const out = [];
  for (const a of args) {
    const p = resolve(a);
    if (!existsSync(p)) {
      process.stderr.write(
        `groundtruth: path not found: ${p}\n` +
          "  Why: the path does not resolve on this filesystem (typo or moved file?).\n" +
          "  Fix: pass an absolute path, or run from the directory that contains it.\n",
      );
      continue;
    }
    const st = statSync(p);
    if (st.isFile()) {
      out.push(p);
    } else if (st.isDirectory()) {
      for (const f of readdirSync(p)) {
        if (f.endsWith(".jsonl")) {
          out.push(join(p, f));
        } else {
          // One level deeper for project-hash/*.jsonl
          const subPath = join(p, f);
          try {
            if (statSync(subPath).isDirectory()) {
              for (const g of readdirSync(subPath)) {
                if (g.endsWith(".jsonl")) out.push(join(subPath, g));
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }
  }
  return out;
}

export const _internals = { shortPath, useColor };
