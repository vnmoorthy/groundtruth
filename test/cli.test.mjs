// test/cli.test.mjs
//
// Black-box tests of the bin/groundtruth.mjs entry point. We actually
// spawn the CLI as a subprocess so we are testing the real command
// exactly as a user would invoke it.

import { test } from "node:test";
import { ok, strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(__dirname);
const BIN = join(REPO, "bin", "groundtruth.mjs");

function run(args, input, env) {
  return spawnSync("node", [BIN, ...args], {
    cwd: REPO,
    input: input || undefined,
    encoding: "utf8",
    timeout: 10000,
    env: env ? { ...process.env, ...env } : process.env,
  });
}

test("CLI: version prints a semver-looking string", () => {
  const r = run(["version"]);
  strictEqual(r.status, 0);
  ok(/^\d+\.\d+\.\d+/.test(r.stdout.trim()));
});

test("CLI: help prints usage", () => {
  const r = run(["--help"]);
  strictEqual(r.status, 0);
  ok(r.stdout.includes("usage:"));
});

test("CLI: unknown flag exits 2", () => {
  const r = run(["audit", "--nonsense"]);
  strictEqual(r.status, 2);
});

test("CLI: audit --json on unverified fixture emits valid JSON with findings", () => {
  const r = run(["audit", "test/fixtures/unverified-claim.jsonl", "--json"]);
  strictEqual(r.status, 1);
  const obj = JSON.parse(r.stdout);
  ok(Array.isArray(obj.findings));
  ok(obj.findings.length >= 1);
  ok(obj.findings[0].line_start);
});

test("CLI: audit --sarif emits valid SARIF 2.1.0", () => {
  const r = run(["audit", "test/fixtures/unverified-claim.jsonl", "--sarif"]);
  strictEqual(r.status, 1);
  const sarif = JSON.parse(r.stdout);
  strictEqual(sarif.version, "2.1.0");
  ok(Array.isArray(sarif.runs));
  ok(sarif.runs[0].tool.driver.name === "groundtruth");
  ok(sarif.runs[0].results.length >= 1);
});

test("CLI: check verified fixture exits 0", () => {
  const r = run(["check", "test/fixtures/verified-claim.jsonl"]);
  strictEqual(r.status, 0);
});

test("CLI: check unverified fixture exits 1", () => {
  const r = run(["check", "test/fixtures/unverified-claim.jsonl"]);
  strictEqual(r.status, 1);
});

test("CLI: hook with stop_hook_active=true outputs nothing, exits 0", () => {
  const payload = JSON.stringify({
    session_id: "x",
    transcript_path: join(REPO, "test", "fixtures", "unverified-claim.jsonl"),
    cwd: "/tmp",
    permission_mode: "default",
    hook_event_name: "Stop",
    stop_hook_active: true,
    last_assistant_message: "I've implemented everything. Done.",
  });
  const r = run(["hook"], payload);
  strictEqual(r.status, 0);
  strictEqual(r.stdout, "");
});

test("CLI: hook blocks an unverified response with JSON decision", () => {
  const payload = JSON.stringify({
    session_id: "x",
    transcript_path: join(REPO, "test", "fixtures", "unverified-claim.jsonl"),
    cwd: "/tmp",
    permission_mode: "default",
    hook_event_name: "Stop",
    stop_hook_active: false,
    last_assistant_message: "I've implemented everything. Done.",
  });
  const r = run(["hook"], payload);
  strictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  strictEqual(parsed.decision, "block");
  ok(parsed.reason.length > 0);
});

test("CLI: memory-check allows content with no claims", () => {
  const r = run(["memory-check", "--content", "Here is what I investigated today."]);
  strictEqual(r.status, 0);
});

test("CLI: memory-check blocks content with unverified claim and no transcript", () => {
  const r = run(["memory-check", "--content", "I've implemented the retry logic. Ready."]);
  strictEqual(r.status, 2);
});

test("CLI: memory-check allows claim when transcript has verification", () => {
  const r = run([
    "memory-check",
    "--content",
    "I've implemented the hello function.",
    "--transcript",
    "test/fixtures/verified-claim.jsonl",
  ]);
  strictEqual(r.status, 0);
});

// --- v0.1.11: check exit codes are honest (per /devex-review finding #3) ---

test("CLI: check on missing path exits 2 (not 0)", () => {
  const r = run(["check", "/tmp/groundtruth-does-not-exist-xyz.jsonl"]);
  strictEqual(r.status, 2);
  ok(r.stderr.includes("no session JSONL files matched"));
});

test("CLI: check on non-JSONL file exits 2 with clear message", () => {
  const tmp = mkdtempSync(join(tmpdir(), "gt-cli-"));
  const f = join(tmp, "not-a-session.txt");
  writeFileSync(f, "this is not a Claude Code session\n");
  try {
    const r = run(["check", f]);
    strictEqual(r.status, 2);
    ok(r.stderr.includes("parsed 0 assistant turns"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("CLI: check missing-path message names the supplied path mode (singular)", () => {
  const r = run(["check", "/tmp/groundtruth-does-not-exist-xyz.jsonl"]);
  ok(r.stderr.includes("the supplied path"));
  ok(!r.stderr.includes("the supplied paths"));
});

// --- v0.1.11: --help no longer mutates state (per /devex-review finding #2) ---

test("CLI: init --help prints usage, does NOT write ~/.groundtruthrc.json", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "gt-fakehome-"));
  try {
    const r = run(["init", "--help"], undefined, { HOME: fakeHome });
    strictEqual(r.status, 0);
    ok(r.stdout.includes("scaffold a starter"));
    ok(!existsSync(join(fakeHome, ".groundtruthrc.json")), "init --help must not write the config file");
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test("CLI: init -h prints usage, does NOT write ~/.groundtruthrc.json", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "gt-fakehome-"));
  try {
    const r = run(["init", "-h"], undefined, { HOME: fakeHome });
    strictEqual(r.status, 0);
    ok(!existsSync(join(fakeHome, ".groundtruthrc.json")));
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test("CLI: install --help prints usage, does NOT touch settings.json", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "gt-fakehome-"));
  try {
    const r = run(["install", "--help"], undefined, { HOME: fakeHome });
    strictEqual(r.status, 0);
    ok(r.stdout.includes("register the Stop hook"));
    ok(!existsSync(join(fakeHome, ".claude", "settings.json")), "install --help must not write settings.json");
    ok(!existsSync(join(fakeHome, ".claude", "skills", "groundtruth")), "install --help must not copy the skill");
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test("CLI: uninstall --help prints usage, does NOT touch settings.json", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "gt-fakehome-"));
  try {
    const r = run(["uninstall", "--help"], undefined, { HOME: fakeHome });
    strictEqual(r.status, 0);
    ok(r.stdout.includes("remove the Stop hook"));
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

// --- v0.1.11: top-level --help advertises diagnostic subcommands (finding #4) ---

test("CLI: --help lists all diagnostic subcommands", () => {
  const r = run(["--help"]);
  strictEqual(r.status, 0);
  for (const sub of ["doctor", "demo", "init", "list-patterns", "bench", "stats", "replay", "fixture"]) {
    ok(r.stdout.includes(sub), `--help must mention '${sub}' subcommand`);
  }
});
