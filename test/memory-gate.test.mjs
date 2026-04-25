// test/memory-gate.test.mjs
import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isMemoryFile, checkMemoryWrite } from "../src/memory-gate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

test("isMemoryFile recognizes common memory filenames", () => {
  ok(isMemoryFile("/home/x/MEMORY.md"));
  ok(isMemoryFile("./NOTES.md"));
  ok(isMemoryFile("project/LEARNINGS.md"));
  ok(isMemoryFile(".claude/memory/something.md"));
  ok(!isMemoryFile("README.md"));
  ok(!isMemoryFile("src/code.js"));
});

test("checkMemoryWrite: content without claims is allowed", () => {
  const r = checkMemoryWrite({
    content: "Investigated the parser; found that line splitting handles CRLF correctly.",
  });
  strictEqual(r.allowed, true);
});

test("checkMemoryWrite: claim without transcript is blocked", () => {
  const r = checkMemoryWrite({
    content: "I've implemented the retry logic. Ready for review.",
  });
  strictEqual(r.allowed, false);
  ok(r.claims.length >= 1);
});

test("checkMemoryWrite: claim with verified transcript is allowed", () => {
  const r = checkMemoryWrite({
    content: "I've implemented the retry logic.",
    transcriptPath: join(FIXTURES, "verified-claim.jsonl"),
  });
  strictEqual(r.allowed, true);
  ok(r.verifications.length >= 1);
});

test("checkMemoryWrite: claim with unverified transcript is blocked", () => {
  const r = checkMemoryWrite({
    content: "I've implemented the retry logic.",
    transcriptPath: join(FIXTURES, "unverified-claim.jsonl"),
  });
  strictEqual(r.allowed, false);
});
