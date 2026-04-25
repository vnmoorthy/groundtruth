// test/detector.test.mjs
import { test } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { detectClaims, _internals } from "../src/detector.mjs";

test("flags first-person-perfect claim 'I've implemented X'", () => {
  const claims = detectClaims("I've implemented the hello function in src/greet.mjs.");
  strictEqual(claims.length, 1);
  strictEqual(claims[0].pattern, "first-person-perfect");
});

test("flags first-person-perfect with 'I have'", () => {
  const claims = detectClaims("I have fixed the regression in the auth flow.");
  strictEqual(claims.length, 1);
  strictEqual(claims[0].word.toLowerCase(), "fixed");
});

test("flags 'The bug is fixed'", () => {
  const claims = detectClaims("The bug is fixed and the tests now pass.");
  ok(claims.length >= 1);
  const words = claims.map((c) => c.word.toLowerCase());
  ok(words.some((w) => w.includes("fixed") || w.includes("pass")));
});

test("flags terse closer 'Fixed.'", () => {
  const claims = detectClaims("Fixed.\n");
  strictEqual(claims.length, 1);
  strictEqual(claims[0].pattern, "terse-closer");
});

test("flags terse closer 'Done.'", () => {
  const claims = detectClaims("\nDone.\n");
  strictEqual(claims.length, 1);
});

test("flags checklist line '- [x] Implemented X'", () => {
  const claims = detectClaims("\n- [x] Implemented the new schema\n");
  strictEqual(claims.length, 1);
  strictEqual(claims[0].pattern, "checklist-past-tense");
});

test("flags 'Successfully implemented'", () => {
  const claims = detectClaims("Successfully implemented the retry logic.");
  strictEqual(claims.length, 1);
  strictEqual(claims[0].pattern, "successfully-verbed");
});

test("flags 'tests pass'", () => {
  const claims = detectClaims("All tests pass now.");
  ok(claims.length >= 1);
});

// False positives — these MUST NOT trigger.

test("no claim for 'I'm working on it'", () => {
  const claims = detectClaims("I'm working on it right now.");
  strictEqual(claims.length, 0);
});

test("no claim for 'working as expected'", () => {
  const claims = detectClaims("The existing code is working as expected.");
  strictEqual(claims.length, 0);
});

test("no claim for 'ready to continue'", () => {
  const claims = detectClaims("I'm ready to continue once you review.");
  strictEqual(claims.length, 0);
});

test("no claim for 'working example'", () => {
  const claims = detectClaims("Here is a working example you can reference.");
  strictEqual(claims.length, 0);
});

test("no claim for 'complete with' (adjectival)", () => {
  const claims = detectClaims("A complete with-tests rewrite would be ideal.");
  strictEqual(claims.length, 0);
});

test("no claim for question form", () => {
  const claims = detectClaims("Is the feature ready?");
  strictEqual(claims.length, 0);
});

test("no claim for 'previously fixed'", () => {
  const claims = detectClaims("This was previously fixed in another branch.");
  strictEqual(claims.length, 0);
});

test("no claim for 'if it works'", () => {
  const claims = detectClaims("If it works, we can move on.");
  strictEqual(claims.length, 0);
});

test("no claim for 'Bun's test runner works well'", () => {
  const claims = detectClaims("Bun's test runner works well for this case.");
  strictEqual(claims.length, 0);
});

test("no claim for code block contents", () => {
  const text = "Here is a snippet:\n```\nThe feature is implemented.\nAll tests pass.\n```\nThat was just an example.";
  const claims = detectClaims(text);
  strictEqual(claims.length, 0);
});

test("empty input returns empty", () => {
  deepStrictEqual(detectClaims(""), []);
  deepStrictEqual(detectClaims(null), []);
  deepStrictEqual(detectClaims(undefined), []);
});

test("multiple claims in one text", () => {
  const text = "I've implemented the handler. I've added the tests. All tests pass.";
  const claims = detectClaims(text);
  ok(claims.length >= 2);
});

// Edge cases: longer text without any claim words
test("prose without trigger words has no findings", () => {
  const text = `Here is my plan. First I will read the existing files. Then I will think about the structure. Finally I will write a short draft for your review.`;
  strictEqual(detectClaims(text).length, 0);
});

// Code-block stripping integrity
test("code block stripping preserves text offsets", () => {
  const text = "before ```inside``` after";
  const stripped = _internals.stripCodeBlocks(text);
  strictEqual(stripped.length, text.length);
  ok(stripped.startsWith("before "));
  ok(stripped.endsWith(" after"));
});

test("no claim for 'almost done'", () => {
  strictEqual(detectClaims("We are almost done here.").length, 0);
});
