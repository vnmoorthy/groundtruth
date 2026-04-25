// test/check.test.mjs
import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { checkTurn } from "../src/check.mjs";

test("checkTurn blocks on claim with no verification", () => {
  const r = checkTurn("I've implemented the hello function.", []);
  strictEqual(r.blocked, true);
  ok(r.reason.includes("verification"));
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
