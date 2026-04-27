// test/stats.test.mjs
import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeStats, renderStatsText } from "../src/stats.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

test("computeStats on the unverified+verified fixture pair", () => {
  const r = computeStats([
    join(FIXTURES, "unverified-claim.jsonl"),
    join(FIXTURES, "verified-claim.jsonl"),
  ]);
  strictEqual(r.files_scanned, 2);
  ok(r.assistant_turns >= 2);
  ok(r.claims_total >= 1);
  ok(r.claims_verified >= 1);
  ok(r.claims_unverified >= 1);
  ok(r.verification_rate > 0 && r.verification_rate < 1);
});

test("computeStats on a fixture with no claims yields all-zero claim counts", () => {
  const r = computeStats([join(FIXTURES, "false-positives.jsonl")]);
  strictEqual(r.files_scanned, 1);
  strictEqual(r.claims_total, 0);
  strictEqual(r.claims_verified, 0);
  strictEqual(r.claims_unverified, 0);
});

test("computeStats divides per-day correctly", () => {
  const r = computeStats([
    join(FIXTURES, "unverified-claim.jsonl"),
    join(FIXTURES, "verified-claim.jsonl"),
  ]);
  ok(Array.isArray(r.per_day));
  for (const day of r.per_day) {
    ok(/^\d{4}-\d{2}-\d{2}$/.test(day.date) || day.date === "unknown");
    ok(day.claims === day.verified + day.unverified);
  }
});

test("renderStatsText produces a string with key labels", () => {
  const r = computeStats([join(FIXTURES, "verified-claim.jsonl")]);
  const out = renderStatsText(r);
  ok(out.includes("verification rate"));
  ok(out.includes("block rate"));
  ok(out.includes("files scanned"));
});

test("computeStats returns 0 verification_rate when no claims", () => {
  const r = computeStats([join(FIXTURES, "false-positives.jsonl")]);
  strictEqual(r.verification_rate, 0);
});
