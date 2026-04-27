// test/perf.test.mjs
//
// Performance budget. Audit must complete in well under one second per
// thousand turns on a recent CPU. We synthesize a 1,000-turn fixture in
// memory, run the audit, and assert the wall-clock duration is under a
// generous ceiling. The intent is to catch a 10× regression, not to
// micro-bench.

import { test } from "node:test";
import { ok } from "node:assert";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditSession } from "../src/audit.mjs";

function generateSyntheticSession(numTurns) {
  const lines = [];
  // Half of turns have a code claim, half have non-code prose.
  for (let i = 0; i < numTurns; i++) {
    const isCodeClaim = i % 2 === 0;
    const text = isCodeClaim
      ? "I've implemented the feature in src/handler.mjs. The tests pass and everything is working."
      : "Made some progress on the analysis. Will continue tomorrow.";
    lines.push(JSON.stringify({
      type: "user",
      message: { role: "user", content: `Step ${i}` },
      timestamp: new Date(2026, 3, 20 + (i % 5), i % 24).toISOString(),
    }));
    lines.push(JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text },
          ...(isCodeClaim
            ? [
                {
                  type: "tool_use",
                  id: `t${i}`,
                  name: "Write",
                  input: { file_path: "/tmp/x.mjs", content: "x" },
                },
              ]
            : []),
        ],
      },
      timestamp: new Date(2026, 3, 20 + (i % 5), i % 24).toISOString(),
    }));
    if (isCodeClaim) {
      lines.push(JSON.stringify({
        type: "user",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "ok" }] },
      }));
    }
  }
  return lines.join("\n");
}

test("audit 1,000 synthetic turns under 5 seconds", () => {
  const dir = mkdtempSync(join(tmpdir(), "gt-perf-"));
  const file = join(dir, "synthetic.jsonl");
  try {
    writeFileSync(file, generateSyntheticSession(1000));
    const start = process.hrtime.bigint();
    const r = auditSession(file);
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    process.stdout.write(`\n  perf: 1000-turn audit took ${ms.toFixed(0)}ms — findings: ${r.findings.length}, verified: ${r.verified}\n`);
    // Generous ceiling. Real machines should do this in <500ms.
    ok(ms < 5000, `audit took ${ms.toFixed(0)}ms, budget is 5000ms`);
    // Sanity on output shape
    ok(r.total_turns > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("audit 100 synthetic turns under 500ms (cold)", () => {
  const dir = mkdtempSync(join(tmpdir(), "gt-perf2-"));
  const file = join(dir, "small.jsonl");
  try {
    writeFileSync(file, generateSyntheticSession(100));
    const start = process.hrtime.bigint();
    auditSession(file);
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    process.stdout.write(`\n  perf: 100-turn audit took ${ms.toFixed(0)}ms\n`);
    ok(ms < 500, `audit took ${ms.toFixed(0)}ms, budget is 500ms`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
