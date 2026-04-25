// test/check.test.mjs
import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { checkTurn } from "../src/check.mjs";

test("checkTurn blocks on claim with code context and no verification", () => {
  // After 0.1.2: a claim alone (no code context) is suppressed. The
  // original test from 0.1.0 passed naked text. Now we add a Write to a
  // .mjs file as a code signal.
  const r = checkTurn("I've implemented the hello function.", [
    { tool: "Write", input: { file_path: "/tmp/demo/hello.mjs" }, output: "" },
  ]);
  strictEqual(r.blocked, true);
  ok(r.reason.includes("verification"));
  ok(r.claims.length >= 1);
});

test("checkTurn suppresses (does NOT block) a claim with no code context", () => {
  const r = checkTurn("I've implemented the hello function.", []);
  strictEqual(r.blocked, false);
  strictEqual(r.suppressed, "no-code-context");
  ok(r.claims.length >= 1);
});

test("checkTurn allows when claim has test verification", () => {
  const r = checkTurn("All tests pass now.", [
    { tool: "Bash", input: { command: "node --test" }, output: "# pass 1\n# fail 0" },
  ]);
  strictEqual(r.blocked, false);
  ok(r.verifications.length >= 1);
});

test("checkTurn allows when no claim present", () => {
  const r = checkTurn("I am reviewing the code now.", []);
  strictEqual(r.blocked, false);
  strictEqual(r.claims.length, 0);
});

test("checkTurn allows when text has only false-positive-looking language", () => {
  const r = checkTurn("I'm ready to continue. The existing code is working as expected.", []);
  strictEqual(r.blocked, false);
});

test("checkTurn does NOT block paper-writing claim (academic exclusions kill it)", () => {
  // 0.1.3+: academic-subject exclusions drop paper-writing phrasings at
  // the detector layer, so claims.length is 0 and the code-context
  // filter never has to fire. Both layers leave checkTurn unblocked.
  const r = checkTurn(
    "Paper editing and optimization work is complete. All citations resolved.",
    [],
  );
  strictEqual(r.blocked, false);
  strictEqual(r.claims.length, 0);
});

test("checkTurn DOES block code claim with code context (Write tool, no verification)", () => {
  const r = checkTurn("I've implemented the parser.", [
    { tool: "Write", input: { file_path: "/tmp/parser.mjs" }, output: "" },
  ]);
  strictEqual(r.blocked, true);
});

test("checkTurn DOES block code claim with fenced code in text (no verification)", () => {
  const r = checkTurn(
    "I've implemented the function:\n```js\nfunction f() { return 1; }\n```\nDone.",
    [],
  );
  strictEqual(r.blocked, true);
});
