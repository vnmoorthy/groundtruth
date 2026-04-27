// src/stats.mjs
//
// `groundtruth stats` — aggregate signal across your Claude Code session
// history. Answers the questions every user asks within a week of installing:
//   - "Is groundtruth actually catching things?"
//   - "How often is the agent claiming completion?"
//   - "What % of those claims are verified?"
//   - "Is the rate trending up or down?"
//
// Output is a small text table. JSON output is also supported for piping.

import { defaultSessionFiles, auditSession } from "./audit.mjs";
import { parseSessionFile, observationsForTurn } from "./session.mjs";
import { detectClaims } from "./detector.mjs";
import { detectVerifications } from "./verifier.mjs";
import { hasCodeContext } from "./code-context.mjs";
import { loadConfig } from "./config.mjs";

/** @typedef {{
 *   files_scanned: number,
 *   total_turns: number,
 *   assistant_turns: number,
 *   claims_total: number,
 *   claims_verified: number,
 *   claims_unverified: number,
 *   claims_suppressed_non_code: number,
 *   would_have_blocked: number,
 *   verification_rate: number,
 *   block_rate: number,
 *   per_day: { date: string, claims: number, verified: number, unverified: number }[]
 * }} StatsReport
 */

function dateKey(timestamp) {
  if (!timestamp) return "unknown";
  // YYYY-MM-DD from a wide range of timestamp shapes
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10);
}

/**
 * Compute statistics across N session files.
 */
export function computeStats(files, opts = {}) {
  const config = opts.config || loadConfig();
  /** @type {StatsReport} */
  const report = {
    files_scanned: 0,
    total_turns: 0,
    assistant_turns: 0,
    claims_total: 0,
    claims_verified: 0,
    claims_unverified: 0,
    claims_suppressed_non_code: 0,
    would_have_blocked: 0,
    verification_rate: 0,
    block_rate: 0,
    per_day: [],
  };
  /** @type {Map<string, {claims:number, verified:number, unverified:number}>} */
  const byDay = new Map();

  for (const filePath of files) {
    let turns;
    try {
      turns = parseSessionFile(filePath);
    } catch {
      continue;
    }
    report.files_scanned += 1;
    report.total_turns += turns.length;
    for (const turn of turns) {
      if (turn.kind !== "assistant") continue;
      report.assistant_turns += 1;
      const claims = detectClaims(turn.text || "", {
        extraExclusions: config.exclude_patterns,
      });
      if (claims.length === 0) continue;

      const obs = observationsForTurn(turn);
      const verifs = detectVerifications(obs);

      const codeCtx = hasCodeContext(turn.text || "", obs);
      if (!codeCtx) {
        report.claims_suppressed_non_code += claims.length;
        continue;
      }

      report.claims_total += claims.length;
      const day = dateKey(turn.timestamp);
      const bucket =
        byDay.get(day) || { claims: 0, verified: 0, unverified: 0 };
      bucket.claims += claims.length;

      if (verifs.length > 0) {
        report.claims_verified += claims.length;
        bucket.verified += claims.length;
      } else {
        report.claims_unverified += claims.length;
        report.would_have_blocked += 1; // turn-level
        bucket.unverified += claims.length;
      }
      byDay.set(day, bucket);
    }
  }

  report.verification_rate =
    report.claims_total > 0
      ? report.claims_verified / report.claims_total
      : 0;
  report.block_rate =
    report.assistant_turns > 0
      ? report.would_have_blocked / report.assistant_turns
      : 0;

  report.per_day = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({ date, ...v }));

  return report;
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

export function renderStatsText(r) {
  const lines = [];
  lines.push("groundtruth stats");
  lines.push("");
  lines.push(`  files scanned:                  ${r.files_scanned}`);
  lines.push(`  assistant turns inspected:      ${r.assistant_turns}`);
  lines.push(`  claims detected (in code ctx):  ${r.claims_total}`);
  lines.push(`    verified in same turn:        ${r.claims_verified}`);
  lines.push(`    unverified:                   ${r.claims_unverified}`);
  lines.push(`  claims suppressed (non-code):   ${r.claims_suppressed_non_code}`);
  lines.push(`  would-have-blocked turns:       ${r.would_have_blocked}`);
  lines.push("");
  lines.push(`  verification rate:              ${pct(r.verification_rate)}`);
  lines.push(`  block rate (per assistant turn): ${pct(r.block_rate)}`);
  lines.push("");
  if (r.per_day.length > 0) {
    lines.push("  per-day breakdown (most recent last):");
    lines.push("    date         claims  verified  unverified");
    for (const d of r.per_day.slice(-14)) {
      lines.push(
        `    ${d.date}   ${String(d.claims).padStart(6)}  ${String(d.verified).padStart(8)}  ${String(d.unverified).padStart(10)}`,
      );
    }
  }
  return lines.join("\n");
}

export async function runStats(args) {
  const flags = { json: false, limit: 50 };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") flags.json = true;
    else if (a === "--limit") {
      const n = parseInt(args[++i], 10);
      if (!Number.isNaN(n) && n > 0) flags.limit = n;
    } else if (!a.startsWith("--")) positional.push(a);
  }
  const files =
    positional.length > 0
      ? positional
      : defaultSessionFiles(flags.limit);
  const report = computeStats(files);
  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(renderStatsText(report) + "\n");
  }
  process.exit(0);
}
