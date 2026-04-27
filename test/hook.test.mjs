// test/hook.test.mjs
//
// Integration tests for the Stop hook entry point. We don't actually exec
// the CLI: we call runHook() with a stub stdin reader so we can simulate
// the Claude Code payload.

import { test } from "node:test";
import { ok, strictEqual } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runHook } from "../src/hook-entry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

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
  // Replace process.exit with a throw so we can catch and continue.
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

class _ExitError extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

test("hook blocks on unverified-claim fixture", async () => {
  const payload = {
    session_id: "test-1",
    transcript_path: join(FIXTURES, "unverified-claim.jsonl"),
    cwd: "/tmp/demo",
    permission_mode: "default",
    hook_event_name: "Stop",
    stop_hook_active: false,
    last_assistant_message: "I've implemented the hello() function. The work is complete and ready to use.",
  };
  const result = await captureStdio(() => runHook(async () => JSON.stringify(payload)));
  const parsed = JSON.parse(result.stdout);
  strictEqual(parsed.decision, "block");
  ok(parsed.reason.length > 0);
  strictEqual(result.exitCode, 0);
});

test("hook allows on verified-claim fixture", async () => {
  const payload = {
    session_id: "test-2",
    transcript_path: join(FIXTURES, "verified-claim.jsonl"),
    cwd: "/tmp/demo",
    permission_mode: "default",
    hook_event_name: "Stop",
    stop_hook_active: false,
    last_assistant_message: "The hello() function is implemented and tests pass: 1 passed, 0 failed.",
  };
  const result = await captureStdio(() => runHook(async () => JSON.stringify(payload)));
  strictEqual(result.stdout, "");
  strictEqual(result.exitCode, 0);
});

test("hook allows when stop_hook_active is true (no infinite loop)", async () => {
  const payload = {
    session_id: "test-3",
    transcript_path: join(FIXTURES, "unverified-claim.jsonl"),
    cwd: "/tmp/demo",
    permission_mode: "default",
    hook_event_name: "Stop",
    stop_hook_active: true,
    last_assistant_message: "I've implemented the hello() function. Ready to ship.",
  };
  const result = await captureStdio(() => runHook(async () => JSON.stringify(payload)));
  strictEqual(result.stdout, "");
  strictEqual(result.exitCode, 0);
});

test("hook with missing transcript and no code-context prose: allows (suppressed)", async () => {
  const payload = {
    session_id: "test-4",
    transcript_path: "/nonexistent/path.jsonl",
    cwd: "/tmp/demo",
    permission_mode: "default",
    hook_event_name: "Stop",
    stop_hook_active: false,
    last_assistant_message: "I've implemented the function. Ready to go.",
  };
  const result = await captureStdio(() => runHook(async () => JSON.stringify(payload)));
  // No transcript means no tool observations; the prose alone has no
  // triple-backtick fenced block, so the code-context filter suppresses
  // and the hook allows. This is the safe-default in 0.1.2.
  strictEqual(result.stdout, "");
  strictEqual(result.exitCode, 0);
});

test("hook with missing transcript but fenced code in prose: blocks", async () => {
  const payload = {
    session_id: "test-4b",
    transcript_path: "/nonexistent/path.jsonl",
    cwd: "/tmp/demo",
    permission_mode: "default",
    hook_event_name: "Stop",
    stop_hook_active: false,
    last_assistant_message:
      "I've implemented the function:\n```js\nfunction f() { return 1; }\n```\nReady to go.",
  };
  const result = await captureStdio(() => runHook(async () => JSON.stringify(payload)));
  const parsed = JSON.parse(result.stdout);
  strictEqual(parsed.decision, "block");
});

test("hook survives garbage stdin", async () => {
  const result = await captureStdio(() => runHook(async () => "not-json"));
  strictEqual(result.exitCode, 1);
  ok(result.stderr.includes("groundtruth"));
});

// --- v0.1.11: surface schema drift instead of silently no-op'ing
//     (per /devex-review finding #5)

test("hook warns and allows when payload has neither last_assistant_message nor transcript_path", async () => {
  const payload = {
    session_id: "test-schema-drift",
    cwd: "/tmp/demo",
    permission_mode: "default",
    hook_event_name: "Stop",
    stop_hook_active: false,
    // Note: no last_assistant_message, no transcript_path. Simulates a future
    // Claude Code release that renames or restructures the payload fields.
  };
  const result = await captureStdio(() => runHook(async () => JSON.stringify(payload)));
  strictEqual(result.stdout, "", "must allow (no block JSON on stdout)");
  strictEqual(result.exitCode, 0, "fail-safe: empty payload allows the turn");
  ok(
    result.stderr.includes("schema may have changed"),
    "must write a stderr warning so users notice the degradation",
  );
});

test("hook does NOT warn when only transcript_path is present (last_assistant_message can be empty)", async () => {
  const payload = {
    session_id: "test-transcript-only",
    transcript_path: "/nonexistent/path.jsonl",
    cwd: "/tmp/demo",
    permission_mode: "default",
    hook_event_name: "Stop",
    stop_hook_active: false,
    // last_assistant_message intentionally omitted; transcript_path alone
    // is enough for the hook to attempt parsing.
  };
  const result = await captureStdio(() => runHook(async () => JSON.stringify(payload)));
  ok(
    !result.stderr.includes("schema may have changed"),
    "transcript_path alone is a complete payload; should not warn",
  );
  strictEqual(result.exitCode, 0);
});
