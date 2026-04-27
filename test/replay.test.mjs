// test/replay.test.mjs
import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { replaySession, renderReplayText } from "../src/replay.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

test("replay on unverified-claim fixture marks the turn would-have-blocked", () => {
  const events = replaySession(join(FIXTURES, "unverified-claim.jsonl"));
  ok(events.length >= 1);
  ok(events.some((e) => e.outcome === "would-have-blocked"));
});

test("replay on verified-claim fixture marks the turn verified", () => {
  const events = replaySession(join(FIXTURES, "verified-claim.jsonl"));
  ok(events.some((e) => e.outcome === "verified"));
  strictEqual(events.filter((e) => e.outcome === "would-have-blocked").length, 0);
});

test("replay on non-code paper-writing fixture marks turns suppressed-non-code or no-claim", () => {
  const events = replaySession(join(FIXTURES, "non-code-paper-writing.jsonl"));
  ok(events.length >= 1);
  ok(events.every((e) => e.outcome === "suppressed-non-code" || e.outcome === "no-claim"));
});

test("replay on false-positives fixture marks every turn no-claim", () => {
  const events = replaySession(join(FIXTURES, "false-positives.jsonl"));
  ok(events.every((e) => e.outcome === "no-claim"));
});

test("renderReplayText includes summary counts", () => {
  const events = replaySession(join(FIXTURES, "unverified-claim.jsonl"));
  const out = renderReplayText(events, "x.jsonl");
  ok(out.includes("would-have-blocked"));
  ok(out.includes("summary"));
});

test("each replay event carries turn index, outcome, code_context", () => {
  const events = replaySession(join(FIXTURES, "verified-claim.jsonl"));
  for (const e of events) {
    ok(typeof e.turn === "number");
    ok(typeof e.outcome === "string");
    ok(typeof e.code_context === "boolean");
  }
});
