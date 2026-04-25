// test/verifier.test.mjs
import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { detectVerifications, _internals } from "../src/verifier.mjs";

test("classifies `node --test` with passing output as test verification", () => {
  const cls = _internals.classifyBash("node --test test/", "# pass 3\n# fail 0\nexit code 0");
  strictEqual(cls.kind, "test");
  strictEqual(cls.ok, true);
});

test("classifies `npm test` with failing output as test but ok=false", () => {
  const cls = _internals.classifyBash("npm test", "Error: AssertionError: expected 1 to equal 2\n1 failing");
  strictEqual(cls.kind, "test");
  strictEqual(cls.ok, false);
});

test("classifies `tsc --noEmit` success", () => {
  const cls = _internals.classifyBash("tsc --noEmit", "exit code 0");
  strictEqual(cls.kind, "typecheck");
  ok(cls.ok);
});

test("classifies `cargo build` with 'Build succeeded'", () => {
  const cls = _internals.classifyBash("cargo build --release", "Compiling foo\nBuild succeeded");
  strictEqual(cls.kind, "build");
  strictEqual(cls.ok, true);
});

test("classifies `curl` with 2xx as http verification", () => {
  const cls = _internals.classifyBash("curl -i https://example.com", "HTTP/2 200 OK\n\nbody");
  strictEqual(cls.kind, "http");
  strictEqual(cls.ok, true);
});

test("non-matching command returns null", () => {
  strictEqual(_internals.classifyBash("ls -la", ""), null);
});

test("detectVerifications finds test from observations", () => {
  const obs = [
    { tool: "Bash", input: { command: "node --test" }, output: "# pass 1\n# fail 0" },
  ];
  const v = detectVerifications(obs);
  strictEqual(v.length, 1);
  strictEqual(v[0].kind, "test");
});

test("detectVerifications credits Read of a just-written file", () => {
  const obs = [
    { tool: "Write", input: { file_path: "/tmp/x.mjs" }, output: "written" },
    { tool: "Read", input: { file_path: "/tmp/x.mjs" }, output: "file contents" },
  ];
  const v = detectVerifications(obs);
  ok(v.some((x) => x.kind === "read-written-file"));
});

test("detectVerifications credits Grep that matches a just-written file", () => {
  const obs = [
    { tool: "Write", input: { file_path: "/tmp/x.mjs" }, output: "written" },
    { tool: "Grep", input: { pattern: "hello" }, output: "/tmp/x.mjs: export function hello" },
  ];
  const v = detectVerifications(obs);
  ok(v.some((x) => x.kind === "grep"));
});

test("detectVerifications returns empty for unrelated bash", () => {
  const obs = [
    { tool: "Bash", input: { command: "ls -la" }, output: "total 0" },
  ];
  const v = detectVerifications(obs);
  strictEqual(v.length, 0);
});

test("success signal requires no failure signal", () => {
  // Output has PASS but also has a later failure.
  const ok1 = _internals.hasSuccessSignal("PASS first test\nFAIL second test");
  strictEqual(ok1, false);
});

test("plain `exit code 0` counts as success", () => {
  ok(_internals.hasSuccessSignal("exit code 0"));
});
