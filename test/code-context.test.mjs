// test/code-context.test.mjs
import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { hasCodeContext } from "../src/code-context.mjs";

test("hasCodeContext: tool call to Write is a strong signal", () => {
  ok(hasCodeContext("done", [{ tool: "Write", input: { file_path: "/tmp/x.mjs" } }]));
});

test("hasCodeContext: tool call to Bash is a strong signal", () => {
  ok(hasCodeContext("ok", [{ tool: "Bash", input: { command: "ls" } }]));
});

test("hasCodeContext: Read of a code-extension file counts", () => {
  ok(hasCodeContext("looking", [{ tool: "Read", input: { file_path: "/tmp/x.py" } }]));
});

test("hasCodeContext: Read of a non-code file does not count alone", () => {
  strictEqual(hasCodeContext("looking", [{ tool: "Read", input: { file_path: "/tmp/notes.txt" } }]), false);
});

test("hasCodeContext: fenced code block in text", () => {
  ok(hasCodeContext("here it is:\n```js\nconsole.log(1)\n```\n", []));
});

test("hasCodeContext: code path mention", () => {
  ok(hasCodeContext("the change goes in src/parser.mjs at line 42", []));
});

test("hasCodeContext: code keyword", () => {
  ok(hasCodeContext("I added a new function called handle()", []));
});

test("hasCodeContext: shell command mention", () => {
  ok(hasCodeContext("now run npm test to see the failure", []));
});

test("hasCodeContext: paper-writing prose returns false", () => {
  const text = "Paper editing and optimization work is complete. The papers are ready for final review or submission. 51 citations successfully resolved and appear in the final bibliography.";
  strictEqual(hasCodeContext(text, []), false);
});

test("hasCodeContext: empty input", () => {
  strictEqual(hasCodeContext("", []), false);
  strictEqual(hasCodeContext("", null), false);
});

test("hasCodeContext: TMLR-style claim has no code context", () => {
  const text = "The submission is live immediately upon clicking submit, though co-author confirmation may be required before reviewer assignment.";
  strictEqual(hasCodeContext(text, []), false);
});
