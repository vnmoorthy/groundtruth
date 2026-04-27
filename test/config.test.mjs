// test/config.test.mjs
import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, pathIsExcluded, _internals } from "../src/config.mjs";

function tempConfig(content) {
  const dir = mkdtempSync(join(tmpdir(), "gt-cfg-"));
  const path = join(dir, ".groundtruthrc.json");
  writeFileSync(path, content);
  return { dir, path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("loadConfig returns empty when no file present", () => {
  const prev = process.env.GROUNDTRUTH_CONFIG;
  delete process.env.GROUNDTRUTH_CONFIG;
  // Point HOME at an empty dir so the home-dir lookup also misses
  const oldHome = process.env.HOME;
  process.env.HOME = mkdtempSync(join(tmpdir(), "gt-empty-"));
  // Run from a temp dir too
  const cwdDir = mkdtempSync(join(tmpdir(), "gt-cwd-"));
  const oldCwd = process.cwd();
  process.chdir(cwdDir);
  try {
    const c = loadConfig();
    strictEqual(c.loaded_from, null);
    strictEqual(c.exclude_patterns.length, 0);
    strictEqual(c.exclude_paths.length, 0);
  } finally {
    process.chdir(oldCwd);
    if (prev) process.env.GROUNDTRUTH_CONFIG = prev;
    if (oldHome) process.env.HOME = oldHome;
    rmSync(cwdDir, { recursive: true, force: true });
  }
});

test("loadConfig from $GROUNDTRUTH_CONFIG path compiles patterns", () => {
  const { path, cleanup } = tempConfig(
    JSON.stringify({
      exclude_patterns: ["custom (?:test|exclusion)", "another\\b"],
      exclude_paths: ["**/observer/**"],
    }),
  );
  const prev = process.env.GROUNDTRUTH_CONFIG;
  process.env.GROUNDTRUTH_CONFIG = path;
  try {
    const c = loadConfig();
    strictEqual(c.loaded_from, path);
    strictEqual(c.exclude_patterns.length, 2);
    ok(c.exclude_patterns[0].test("This is a custom test"));
    strictEqual(c.exclude_paths.length, 1);
  } finally {
    if (prev) process.env.GROUNDTRUTH_CONFIG = prev;
    else delete process.env.GROUNDTRUTH_CONFIG;
    cleanup();
  }
});

test("loadConfig skips invalid regex without crashing", () => {
  const { path, cleanup } = tempConfig(
    JSON.stringify({
      exclude_patterns: ["[unclosed", "valid\\b"],
    }),
  );
  process.env.GROUNDTRUTH_CONFIG = path;
  try {
    const c = loadConfig();
    strictEqual(c.exclude_patterns.length, 1);
  } finally {
    delete process.env.GROUNDTRUTH_CONFIG;
    cleanup();
  }
});

test("loadConfig tolerates malformed JSON", () => {
  const { path, cleanup } = tempConfig("not-json");
  process.env.GROUNDTRUTH_CONFIG = path;
  try {
    const c = loadConfig();
    strictEqual(c.exclude_patterns.length, 0);
  } finally {
    delete process.env.GROUNDTRUTH_CONFIG;
    cleanup();
  }
});

test("pathIsExcluded matches glob and prefix patterns", () => {
  ok(pathIsExcluded("/home/u/.claude/projects/observer/foo.jsonl", ["**/observer/**"]));
  ok(pathIsExcluded("/tmp/exclude/me.jsonl", ["/tmp/exclude"]));
  strictEqual(pathIsExcluded("/home/u/code/foo.jsonl", ["**/observer/**"]), false);
  strictEqual(pathIsExcluded("/anywhere", []), false);
});

test("globToRegex handles ** and *", () => {
  const re = _internals.globToRegex("src/**/*.mjs");
  ok(re);
  ok(re.test("src/a/b/c.mjs"));
  ok(re.test("src/foo.mjs"));
  strictEqual(re.test("src/a.txt"), false);
});
