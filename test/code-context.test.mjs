// test/code-context.test.mjs
//
// Filter behavior was tightened in 0.1.2 after a real-data audit showed
// the looser version firing on academic prose. The tests below match the
// new strict rules: only tool calls or triple-backtick fenced blocks.

import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { hasCodeContext, explainCodeContext } from "../src/code-context.mjs";

test("hasCodeContext: Bash tool call counts unconditionally", () => {
  ok(hasCodeContext("done", [{ tool: "Bash", input: { command: "ls" } }]));
});

test("hasCodeContext: Write to a code-extension file counts", () => {
  ok(hasCodeContext("done", [{ tool: "Write", input: { file_path: "/tmp/x.mjs" } }]));
});

test("hasCodeContext: Write to a non-code file does NOT count", () => {
  strictEqual(
    hasCodeContext("done", [{ tool: "Write", input: { file_path: "/tmp/notes.md" } }]),
    false,
  );
});

test("hasCodeContext: Read of a code-extension file counts", () => {
  ok(hasCodeContext("looking", [{ tool: "Read", input: { file_path: "/tmp/x.py" } }]));
});

test("hasCodeContext: Read of a markdown file does NOT count", () => {
  strictEqual(
    hasCodeContext("looking", [{ tool: "Read", input: { file_path: "/tmp/notes.md" } }]),
    false,
  );
});

test("hasCodeContext: triple-backtick code block counts", () => {
  ok(hasCodeContext("here:\n```js\nconsole.log(1)\n```\n", []));
});

test("hasCodeContext: single-backtick inline does NOT count alone", () => {
  // Single backticks are common in academic prose around technical phrases.
  strictEqual(hasCodeContext("we use the `argmax` operator over...", []), false);
});

test("hasCodeContext: paper-writing prose returns false", () => {
  const text =
    "Paper editing and optimization work is complete. The papers are ready for final review or submission. 51 citations successfully resolved and appear in the final bibliography.";
  strictEqual(hasCodeContext(text, []), false);
});

test("hasCodeContext: TMLR-style claim returns false", () => {
  const text =
    "The submission is live immediately upon clicking submit, though co-author confirmation may be required before reviewer assignment.";
  strictEqual(hasCodeContext(text, []), false);
});

test("hasCodeContext: text mentioning 'method' or 'class' alone does NOT count", () => {
  // These were in CODE_VOCAB in 0.1.1 and caused the filter to fire on
  // every academic paragraph. They are now excluded.
  strictEqual(hasCodeContext("This method extends the previous class of approaches.", []), false);
  strictEqual(hasCodeContext("We return to the argument in section 3.", []), false);
});

test("hasCodeContext: text mentioning 'package' alone does NOT count", () => {
  strictEqual(hasCodeContext("The package was delivered on time.", []), false);
});

test("hasCodeContext: empty input", () => {
  strictEqual(hasCodeContext("", []), false);
  strictEqual(hasCodeContext("", null), false);
});

test("explainCodeContext: returns the matched signal", () => {
  const r = explainCodeContext("done", [{ tool: "Bash", input: { command: "node --test" } }]);
  ok(r);
  strictEqual(r.reason, "tool:Bash");
});

test("explainCodeContext: returns null when no signal", () => {
  strictEqual(explainCodeContext("Just a paragraph of prose.", []), null);
});
