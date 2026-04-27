// test/doctor-init.test.mjs
import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runDoctorChecks } from "../src/doctor.mjs";

test("doctor runs without crashing and returns lines + hasFailures", () => {
  const r = runDoctorChecks();
  ok(Array.isArray(r.lines));
  ok(r.lines.length > 0);
  ok(typeof r.hasFailures === "boolean");
  ok(r.lines.some((l) => l.includes("node")));
});

test("doctor reports the running node version as a PASS line", () => {
  const r = runDoctorChecks();
  ok(r.lines.some((l) => /node v\d+/.test(l)));
});

test("doctor warns about missing groundtruthrc when none exists in $HOME or cwd", () => {
  const oldHome = process.env.HOME;
  const oldCwd = process.cwd();
  const fakeHome = mkdtempSync(join(tmpdir(), "gt-fake-home-"));
  const cwdDir = mkdtempSync(join(tmpdir(), "gt-cwd-"));
  process.env.HOME = fakeHome;
  process.chdir(cwdDir);
  delete process.env.GROUNDTRUTH_CONFIG;
  try {
    const r = runDoctorChecks();
    ok(r.lines.some((l) => l.includes(".groundtruthrc.json")));
  } finally {
    process.chdir(oldCwd);
    if (oldHome) process.env.HOME = oldHome;
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(cwdDir, { recursive: true, force: true });
  }
});

test("init writes a config file with expected fields", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gt-init-"));
  const target = join(dir, ".groundtruthrc.json");
  const oldHome = process.env.HOME;
  process.env.HOME = dir;
  // Stub process.exit so the tests don't actually exit
  const origExit = process.exit;
  process.exit = () => {};
  try {
    const { runInit } = await import("../src/init.mjs");
    await runInit([]);
    ok(existsSync(target));
    const parsed = JSON.parse(readFileSync(target, "utf8"));
    ok(Array.isArray(parsed.exclude_patterns));
    ok(Array.isArray(parsed.exclude_paths));
  } finally {
    process.exit = origExit;
    if (oldHome) process.env.HOME = oldHome;
    rmSync(dir, { recursive: true, force: true });
  }
});
