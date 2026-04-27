// src/bench.mjs
//
// `groundtruth bench` — runs the full audit against the user's actual
// ~/.claude/projects/ history and reports per-thousand-turn timing.
// The number this command prints is the one users will paste into
// tweets and threads. Encourages sharing because the user owns the
// number on their hardware.

import { defaultSessionFiles, auditSession } from "./audit.mjs";

export async function runBench(args) {
  const flags = { json: false, limit: 50 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") flags.json = true;
    else if (a === "--limit") {
      const n = parseInt(args[++i], 10);
      if (!Number.isNaN(n) && n > 0) flags.limit = n;
    }
  }
  const files = defaultSessionFiles(flags.limit);
  if (files.length === 0) {
    process.stderr.write(
      "groundtruth bench: no session files found at ~/.claude/projects.\n" +
        "Use Claude Code at least once, then re-run.\n",
    );
    process.exit(1);
  }

  const results = [];
  let totalTurns = 0;
  let totalFindings = 0;
  let totalMs = 0;

  for (const f of files) {
    const start = process.hrtime.bigint();
    let r;
    try {
      r = auditSession(f);
    } catch {
      continue;
    }
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    results.push({ file: f, turns: r.total_turns, findings: r.findings.length, ms });
    totalTurns += r.total_turns;
    totalFindings += r.findings.length;
    totalMs += ms;
  }

  const perThousand = totalTurns > 0 ? (totalMs / totalTurns) * 1000 : 0;
  const summary = {
    files_scanned: results.length,
    total_turns: totalTurns,
    total_findings: totalFindings,
    total_ms: Number(totalMs.toFixed(2)),
    ms_per_thousand_turns: Number(perThousand.toFixed(2)),
    machine: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: (await import("node:os")).cpus().length,
    },
  };

  if (flags.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    process.stdout.write(`groundtruth bench
  files scanned:     ${summary.files_scanned}
  total turns:       ${summary.total_turns}
  total findings:    ${summary.total_findings}
  total time:        ${summary.total_ms}ms
  per 1k turns:      ${summary.ms_per_thousand_turns}ms
  machine:           ${summary.machine.platform}-${summary.machine.arch}, node ${summary.machine.node}, ${summary.machine.cpus} cpus

share this number on your launch tweet:
  "groundtruth audit: ${summary.total_turns} turns in ${Math.round(summary.total_ms)}ms (${Math.round(summary.ms_per_thousand_turns)}ms / 1k turns) on my ${summary.machine.platform}"
`);
  }
  process.exit(0);
}
