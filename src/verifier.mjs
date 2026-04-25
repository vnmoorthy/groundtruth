// src/verifier.mjs
//
// Verification-artifact detector.
//
// Given a set of tool uses and their results from the same turn (or the
// recent tail of a session), decide whether the agent produced evidence
// that qualifies as "verification". Verification means running code or
// reading back committed state in a way a reader could independently
// reproduce.

/** @typedef {{
 *   tool: string,
 *   input: object,
 *   output: string,
 *   exit_code?: number
 * }} ToolObservation
 */

/** @typedef {{
 *   kind: "test" | "typecheck" | "build" | "lint" | "http" | "grep" | "read-written-file" | "screenshot",
 *   tool: string,
 *   evidence: string
 * }} Verification
 */

// Command fragments that, when present in a Bash invocation, count as a
// test run. We match on fragments so that flags and paths do not break
// detection.
const TEST_COMMAND_FRAGMENTS = [
  /\bnpm\s+(?:run\s+)?test\b/,
  /\bpnpm\s+(?:run\s+)?test\b/,
  /\byarn\s+(?:run\s+)?test\b/,
  /\bbun\s+test\b/,
  /\bnode\s+--test\b/,
  /\bdeno\s+test\b/,
  /\bjest\b/,
  /\bvitest\b/,
  /\bmocha\b/,
  /\btap\b/,
  /\bpytest\b/,
  /\bpython\s+-m\s+pytest\b/,
  /\bpython\s+-m\s+unittest\b/,
  /\bcargo\s+test\b/,
  /\bgo\s+test\b/,
  /\bphpunit\b/,
  /\brspec\b/,
  /\brake\s+test\b/,
  /\bmix\s+test\b/,
  /\bdotnet\s+test\b/,
  /\bgradle\s+test\b/,
  /\bmvn\s+test\b/,
  /\bctest\b/,
];

const TYPECHECK_COMMAND_FRAGMENTS = [
  /\btsc\s+--noEmit\b/,
  /\btsc\s+--no-emit\b/,
  /\btsc\b(?!\s*-p)/, // plain tsc
  /\bmypy\b/,
  /\bpyright\b/,
  /\bflow\s+check\b/,
  /\bnpm\s+(?:run\s+)?typecheck\b/,
  /\bpnpm\s+(?:run\s+)?typecheck\b/,
  /\byarn\s+(?:run\s+)?typecheck\b/,
];

const BUILD_COMMAND_FRAGMENTS = [
  /\bnpm\s+(?:run\s+)?build\b/,
  /\bpnpm\s+(?:run\s+)?build\b/,
  /\byarn\s+(?:run\s+)?build\b/,
  /\bbun\s+build\b/,
  /\bcargo\s+build\b/,
  /\bgo\s+build\b/,
  /\bmake\b(?!\s+clean)/,
  /\bcmake\s+--build\b/,
  /\bgradle\s+build\b/,
  /\bmvn\s+package\b/,
];

const LINT_COMMAND_FRAGMENTS = [
  /\beslint\b/,
  /\bruff\s+check\b/,
  /\bruff\b/,
  /\bclippy\b/,
  /\bgolangci-lint\b/,
  /\brubocop\b/,
  /\bphpcs\b/,
  /\bnpm\s+(?:run\s+)?lint\b/,
  /\bpnpm\s+(?:run\s+)?lint\b/,
  /\byarn\s+(?:run\s+)?lint\b/,
  /\bbiome\s+(?:check|ci)\b/,
  /\bprettier\s+--check\b/,
];

const HTTP_COMMAND_FRAGMENTS = [
  /\bcurl\b/,
  /\bwget\b/,
  /\bhttpie\b/,
  /\bhttp\s+(?:GET|POST|PUT|DELETE|HEAD)\b/,
];

// Output signals that suggest a successful run. We do a weak check: if
// the output contains any of these and has no strong failure signal,
// the artifact counts.
//
// Covers: plain English ("All tests passed"), Jest/Vitest/Mocha style
// ("Tests: 12 passed"), TAP ("ok 1 - test name"), node --test headers
// ("# pass 5", "# fail 0"), cargo ("test result: ok"), go ("PASS"/"ok"),
// pytest ("1 passed"), and a handful of exit-zero confirmations.
const SUCCESS_SIGNALS = [
  /\ball tests? pass(?:ed)?\b/i,
  /\btest pass(?:ed|es|ing)\b/i,
  /\b\d+\s+pass(?:ed|es|ing)\b/i,
  /\b\d+\s+passing\b/i,
  /\btest(?:s)?\s*:\s*\d+\s+pass(?:ed)?\b/i,
  // node --test TAP summary lines like "# pass 5" / "# pass 1"
  /^\s*#\s*pass(?:ed)?\s+[1-9]\d*\b/im,
  // node --test "# fail 0" (zero failures is a positive signal; a real
  // failure will also add a non-zero fail line which the failure patterns
  // below will match and veto this).
  /^\s*#\s*fail(?:ed)?\s+0\b/im,
  // TAP "ok N - desc"
  /^\s*ok\s+\d+(?:\s|-|$)/m,
  /\btap\s+version\b/i,
  // cargo / rust
  /\btest result:\s*ok\.\s+\d+\s+passed\b/i,
  // pytest summary
  /\b\d+\s+passed(?:\s+in\s+[\d.]+s)?\b/i,
  // go test
  /^PASS\b/m,
  /^ok\s+\S+\s+[\d.]+s/m,
  /\bPASS\b/,
  /✓/,
  /^OK\s*$/m,
  /\bexit(?:\s+code)?\s*[:=]?\s*0\b/i,
  /\bBuild succeeded\b/i,
  /\bBuild successful\b/i,
  /\bCompiled successfully\b/i,
  /\bcompilation successful\b/i,
  /\bno issues? found\b/i,
  /\bno errors? found\b/i,
  /\bSuccess!\b/,
  /\bTests Ran:\s*\d+,\s*Pass:\s*\d+/i,
];

const FAILURE_SIGNALS = [
  /^FAIL\b/m,
  /\bFAIL:\s+/,
  /\b[1-9]\d*\s+fail(?:ed|ing|ures?)\b/i,
  /^\s*#\s*fail(?:ed)?\s+[1-9]\d*\b/im,
  /\bAssertionError\b/,
  /\bSyntaxError\b/,
  /\bTypeError\b/,
  /^Error:\s+/m,
  /✗/,
  /✘/,
  /\bexit(?:\s+code)?\s*[:=]?\s*[1-9]\b/i,
  /\btest\s+failed\b/i,
  /\bbuild failed\b/i,
  /\bcompilation failed\b/i,
];

const HTTP_2XX = /\bHTTP\/[\d.]+\s+2\d{2}\b/;

function extractBashCommand(input) {
  // Claude Code's Bash tool input has shape { command: string, ... }
  if (!input || typeof input !== "object") return "";
  if (typeof input.command === "string") return input.command;
  return "";
}

function matchAny(text, patterns) {
  for (const p of patterns) {
    if (p.test(text)) return p.source;
  }
  return null;
}

function hasSuccessSignal(output) {
  if (!output) return false;
  // If there is any failure signal, do not count as success regardless.
  for (const f of FAILURE_SIGNALS) {
    if (f.test(output)) return false;
  }
  for (const s of SUCCESS_SIGNALS) {
    if (s.test(output)) return true;
  }
  return false;
}

function classifyBash(cmd, output) {
  if (matchAny(cmd, TEST_COMMAND_FRAGMENTS)) {
    return hasSuccessSignal(output)
      ? { kind: "test", ok: true }
      : { kind: "test", ok: false };
  }
  if (matchAny(cmd, TYPECHECK_COMMAND_FRAGMENTS)) {
    return hasSuccessSignal(output)
      ? { kind: "typecheck", ok: true }
      : { kind: "typecheck", ok: false };
  }
  if (matchAny(cmd, BUILD_COMMAND_FRAGMENTS)) {
    return hasSuccessSignal(output)
      ? { kind: "build", ok: true }
      : { kind: "build", ok: false };
  }
  if (matchAny(cmd, LINT_COMMAND_FRAGMENTS)) {
    return hasSuccessSignal(output)
      ? { kind: "lint", ok: true }
      : { kind: "lint", ok: false };
  }
  if (matchAny(cmd, HTTP_COMMAND_FRAGMENTS)) {
    const ok = HTTP_2XX.test(output) || hasSuccessSignal(output);
    return { kind: "http", ok };
  }
  return null;
}

/**
 * Given a list of tool observations (tool+input+output) from a single turn,
 * extract verification artifacts.
 * @param {ToolObservation[]} observations
 * @returns {Verification[]}
 */
export function detectVerifications(observations) {
  /** @type {Verification[]} */
  const verifs = [];
  // Gather files the agent wrote or edited earlier in this turn, so that
  // a later Read/Grep of those files can count as weak verification.
  const writtenPaths = new Set();
  for (const obs of observations) {
    if (obs.tool === "Write" || obs.tool === "Edit" || obs.tool === "MultiEdit" || obs.tool === "NotebookEdit") {
      const p = obs.input?.file_path || obs.input?.path;
      if (typeof p === "string") writtenPaths.add(p);
    }
  }
  for (const obs of observations) {
    if (obs.tool === "Bash" || obs.tool === "BashOutput") {
      const cmd = extractBashCommand(obs.input);
      if (!cmd) continue;
      const cls = classifyBash(cmd, obs.output || "");
      if (cls && cls.ok) {
        verifs.push({
          kind: cls.kind,
          tool: obs.tool,
          evidence: `${cmd.slice(0, 160)} → success signals in output`,
        });
      }
    } else if (obs.tool === "Grep") {
      // A grep whose pattern matches in a file the agent wrote this turn
      // is evidence the written symbol actually exists.
      const pattern = obs.input?.pattern;
      const matchedPath = writtenPaths.size > 0 ? [...writtenPaths][0] : null;
      const out = obs.output || "";
      if (pattern && matchedPath && out.includes(matchedPath)) {
        verifs.push({
          kind: "grep",
          tool: "Grep",
          evidence: `Grep '${pattern}' found match in ${matchedPath}`,
        });
      }
    } else if (obs.tool === "Read") {
      const p = obs.input?.file_path;
      if (typeof p === "string" && writtenPaths.has(p)) {
        verifs.push({
          kind: "read-written-file",
          tool: "Read",
          evidence: `Read back ${p} after writing it`,
        });
      }
    }
  }
  return verifs;
}

export const _internals = {
  TEST_COMMAND_FRAGMENTS,
  TYPECHECK_COMMAND_FRAGMENTS,
  BUILD_COMMAND_FRAGMENTS,
  LINT_COMMAND_FRAGMENTS,
  HTTP_COMMAND_FRAGMENTS,
  SUCCESS_SIGNALS,
  FAILURE_SIGNALS,
  classifyBash,
  hasSuccessSignal,
  extractBashCommand,
};
