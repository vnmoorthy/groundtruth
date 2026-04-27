// src/demo.mjs
//
// `groundtruth demo` — simulates the live hook flow against an in-memory
// fixture and prints, step by step, what the gate would do. Time-to-first-
// block goes from "wait until you happen to make an unverified claim in a
// real Claude Code session" to ~5 seconds after install.
//
// This is a teaching command, not a hook. It does not need a Claude Code
// process. It uses the same code paths as the production Stop hook so the
// output is honest about what the real gate does.

import { setTimeout as wait } from "node:timers/promises";
import { detectClaims } from "./detector.mjs";
import { detectVerifications } from "./verifier.mjs";
import { hasCodeContext, explainCodeContext } from "./code-context.mjs";

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
};
function useColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
}
function c(color, text) {
  return useColor() ? `${COLORS[color]}${text}${COLORS.reset}` : text;
}

const FIXTURE_TURN_TEXT = `I've added the retry to src/client.mjs. The handler now wraps the fetch in a 3-attempt loop with exponential backoff. Done.`;
const FIXTURE_TOOL_OBSERVATIONS = [
  {
    tool: "Edit",
    input: { file_path: "/tmp/demo/src/client.mjs", old_string: "fetch(", new_string: "retry(() => fetch(" },
    output: "Edit applied.",
  },
];

const VERIFIED_TURN_TEXT = `I've added the retry to src/client.mjs. Tests pass: 1 passed, 0 failed.`;
const VERIFIED_TOOL_OBSERVATIONS = [
  {
    tool: "Edit",
    input: { file_path: "/tmp/demo/src/client.mjs", old_string: "fetch(", new_string: "retry(() => fetch(" },
    output: "Edit applied.",
  },
  {
    tool: "Bash",
    input: { command: "node --test test/client.test.mjs" },
    output: "ok 1 - retry retries on 5xx\n# tests 1\n# pass 1\n# fail 0\nexit code 0",
  },
];

async function pause(ms) {
  if (process.env.GROUNDTRUTH_DEMO_FAST) return;
  await wait(ms);
}

async function runScene1() {
  process.stdout.write(c("bold", "\n[1/2] Unverified claim — gate fires") + "\n\n");
  await pause(400);
  process.stdout.write(`  Simulated user prompt: ${c("dim", "\"add a retry to the API call in src/client.mjs\"")}` + "\n");
  await pause(500);
  process.stdout.write(`  Agent (turn 1) text:\n    ${c("yellow", `"${FIXTURE_TURN_TEXT}"`)}` + "\n");
  await pause(700);
  process.stdout.write(`  Tool observations in same turn:\n`);
  for (const o of FIXTURE_TOOL_OBSERVATIONS) {
    process.stdout.write(`    ${c("dim", `→ ${o.tool}(${JSON.stringify(o.input).slice(0, 60)}…)`)} \n`);
  }
  await pause(600);
  const claims = detectClaims(FIXTURE_TURN_TEXT);
  const verifs = detectVerifications(FIXTURE_TOOL_OBSERVATIONS);
  const codeCtx = hasCodeContext(FIXTURE_TURN_TEXT, FIXTURE_TOOL_OBSERVATIONS);
  const ctxExplain = explainCodeContext(FIXTURE_TURN_TEXT, FIXTURE_TOOL_OBSERVATIONS);
  process.stdout.write(`\n  ${c("bold", "Stop hook fires.")}\n`);
  process.stdout.write(`    claims detected:        ${c("yellow", String(claims.length))} (${claims.map((cl) => `${cl.pattern}/${cl.word}`).join(", ")})\n`);
  process.stdout.write(`    verification artifacts: ${c("red", String(verifs.length))}\n`);
  process.stdout.write(`    code context:           ${codeCtx ? c("green", "yes") : c("red", "no")} (${ctxExplain ? `${ctxExplain.reason}: ${ctxExplain.detail}` : "—"})\n`);
  await pause(700);
  process.stdout.write(`\n  ${c("red", "→ DECISION: BLOCK")} — agent forced into another turn with this reason:\n`);
  await pause(400);
  process.stdout.write(c("dim", "\n    \"groundtruth: your response asserts work is complete but this turn\n    contains no verification evidence. Before you end your turn, produce one\n    of: a passing test command, a successful type check, a successful build,\n    a curl with 2xx, or a Read/Grep showing the symbol you wrote exists.\"\n"));
  await pause(800);
}

async function runScene2() {
  process.stdout.write(c("bold", "\n[2/2] Same claim, with a test run — gate stays silent") + "\n\n");
  await pause(400);
  process.stdout.write(`  Agent (turn 1) text:\n    ${c("yellow", `"${VERIFIED_TURN_TEXT}"`)}` + "\n");
  await pause(500);
  process.stdout.write(`  Tool observations in same turn:\n`);
  for (const o of VERIFIED_TOOL_OBSERVATIONS) {
    process.stdout.write(`    ${c("dim", `→ ${o.tool}(${(o.input.command || JSON.stringify(o.input).slice(0, 60))})`)}\n`);
  }
  await pause(600);
  const claims = detectClaims(VERIFIED_TURN_TEXT);
  const verifs = detectVerifications(VERIFIED_TOOL_OBSERVATIONS);
  process.stdout.write(`\n  ${c("bold", "Stop hook fires.")}\n`);
  process.stdout.write(`    claims detected:        ${c("yellow", String(claims.length))}\n`);
  process.stdout.write(`    verification artifacts: ${c("green", String(verifs.length))} (${verifs.map((v) => v.kind).join(", ")})\n`);
  await pause(500);
  process.stdout.write(`\n  ${c("green", "→ DECISION: ALLOW")} — claim has matching evidence in same turn. Turn ends.\n`);
  await pause(400);
}

export async function runDemo() {
  process.stdout.write(c("bold", "groundtruth demo") + "\n");
  process.stdout.write(c("dim", "  simulates the gate firing on a real-shaped session. ~5 seconds.\n"));
  process.stdout.write(c("dim", "  set GROUNDTRUTH_DEMO_FAST=1 to skip the typing pauses.\n"));
  await runScene1();
  await runScene2();
  process.stdout.write(`\n${c("bold", "summary")}\n`);
  process.stdout.write(`  Without groundtruth, both turns end on \"Done.\" — one truthful, one not.\n`);
  process.stdout.write(`  With groundtruth, scene 1 is blocked into a retraction or a test run; scene 2 passes.\n`);
  process.stdout.write(`\n${c("dim", "Try it on your own data: groundtruth audit ~/.claude/projects")}\n`);
  process.stdout.write(`${c("dim", "See what every regex catches: groundtruth list-patterns")}\n\n`);
  process.exit(0);
}
