// test/memory-hook.test.mjs
//
// Tests for the PreToolUse memory-hook entry point. Same approach as
// hook.test.mjs: drive runMemoryHook with a stub stdin function, capture
// the JSON it writes to stdout, assert on permissionDecision.

import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runMemoryHook } from "../src/memory-hook-entry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

class _ExitError extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

function captureStdio(fn) {
  const stdout = [];
  const stderr = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let exitCode = 0;
  const origExit = process.exit;
  process.stdout.write = (chunk) => {
    stdout.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };
  process.exit = (code) => {
    exitCode = code ?? 0;
    throw new _ExitError(exitCode);
  };
  const restore = () => {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    process.exit = origExit;
  };
  return fn().then(
    () => {
      restore();
      return { stdout: stdout.join(""), stderr: stderr.join(""), exitCode };
    },
    (err) => {
      restore();
      if (err instanceof _ExitError) {
        return { stdout: stdout.join(""), stderr: stderr.join(""), exitCode };
      }
      throw err;
    },
  );
}

test("memory-hook allows non-memory file writes (e.g. src/parser.mjs)", async () => {
  const payload = {
    tool_name: "Write",
    tool_input: { file_path: "/tmp/code/src/parser.mjs", content: "function f(){}" },
    transcript_path: join(FIXTURES, "verified-claim.jsonl"),
  };
  const r = await captureStdio(() => runMemoryHook(async () => JSON.stringify(payload)));
  strictEqual(r.stdout, "");
  strictEqual(r.exitCode, 0);
});

test("memory-hook allows non-memory tools (Bash, Read)", async () => {
  const payload = {
    tool_name: "Bash",
    tool_input: { command: "ls" },
    transcript_path: join(FIXTURES, "verified-claim.jsonl"),
  };
  const r = await captureStdio(() => runMemoryHook(async () => JSON.stringify(payload)));
  strictEqual(r.stdout, "");
});

test("memory-hook allows memory write with no completion claim in content", async () => {
  const payload = {
    tool_name: "Write",
    tool_input: {
      file_path: "/tmp/proj/MEMORY.md",
      content: "Investigated the parser today. No conclusions yet.",
    },
    transcript_path: join(FIXTURES, "verified-claim.jsonl"),
  };
  const r = await captureStdio(() => runMemoryHook(async () => JSON.stringify(payload)));
  strictEqual(r.stdout, "");
});

test("memory-hook denies memory write with unverified claim and no transcript", async () => {
  const payload = {
    tool_name: "Write",
    tool_input: {
      file_path: "/tmp/proj/MEMORY.md",
      content: "I've implemented the retry logic. Done.",
    },
    transcript_path: "/nonexistent.jsonl",
  };
  const r = await captureStdio(() => runMemoryHook(async () => JSON.stringify(payload)));
  ok(r.stdout.length > 0, "expected a deny payload on stdout");
  const parsed = JSON.parse(r.stdout);
  strictEqual(parsed.hookSpecificOutput.permissionDecision, "deny");
  ok(parsed.hookSpecificOutput.permissionDecisionReason.length > 0);
});

test("memory-hook allows memory write when transcript has matching verification", async () => {
  const payload = {
    tool_name: "Write",
    tool_input: {
      file_path: "/tmp/proj/NOTES.md",
      content: "I've implemented the hello function. Done.",
    },
    transcript_path: join(FIXTURES, "verified-claim.jsonl"),
  };
  const r = await captureStdio(() => runMemoryHook(async () => JSON.stringify(payload)));
  strictEqual(r.stdout, "");
});

test("memory-hook handles MultiEdit with multiple edits", async () => {
  const payload = {
    tool_name: "MultiEdit",
    tool_input: {
      file_path: "/tmp/proj/MEMORY.md",
      edits: [
        { old_string: "x", new_string: "Investigated the area." },
        { old_string: "y", new_string: "I've implemented the feature." },
      ],
    },
    transcript_path: "/nonexistent.jsonl",
  };
  const r = await captureStdio(() => runMemoryHook(async () => JSON.stringify(payload)));
  ok(r.stdout.length > 0);
  const parsed = JSON.parse(r.stdout);
  strictEqual(parsed.hookSpecificOutput.permissionDecision, "deny");
});
