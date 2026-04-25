// test/audit.test.mjs
import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { auditSession, auditSessions } from "../src/audit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

test("auditSession flags unverified-claim fixture", () => {
  const r = auditSession(join(FIXTURES, "unverified-claim.jsonl"));
  ok(r.findings.length >= 1, `expected findings, got ${r.findings.length}`);
  const first = r.findings[0];
  ok(first.claim.toLowerCase().includes("implemented") || first.claim.toLowerCase().includes("complete") || first.claim.toLowerCase().includes("ready"));
});

test("auditSession clears verified-claim fixture", () => {
  const r = auditSession(join(FIXTURES, "verified-claim.jsonl"));
  strictEqual(r.findings.length, 0, `expected no findings, got ${JSON.stringify(r.findings, null, 2)}`);
  ok(r.verified >= 1);
});

test("auditSession: false-positives fixture produces zero findings", () => {
  const r = auditSession(join(FIXTURES, "false-positives.jsonl"));
  strictEqual(r.findings.length, 0, `false positives triggered: ${JSON.stringify(r.findings, null, 2)}`);
});

test("auditSession: terse closer 'Fixed.' after an edit is flagged", () => {
  const r = auditSession(join(FIXTURES, "terse-closer.jsonl"));
  ok(r.findings.length >= 1);
});

test("auditSession: checklist with past-tense items is flagged", () => {
  const r = auditSession(join(FIXTURES, "checklist.jsonl"));
  ok(r.findings.length >= 1);
});

test("auditSession: code-block fixture does not flag contents of fenced block", () => {
  const r = auditSession(join(FIXTURES, "code-block.jsonl"));
  strictEqual(r.findings.length, 0);
});

test("auditSession: non-code paper-writing fixture is suppressed by default", () => {
  const r = auditSession(join(FIXTURES, "non-code-paper-writing.jsonl"));
  strictEqual(r.findings.length, 0, `expected suppression, got ${JSON.stringify(r.findings)}`);
  ok(r.suppressed_non_code >= 1, `expected non-code suppression, got ${r.suppressed_non_code}`);
});

test("auditSession: non-code paper-writing fixture is reported with includeNonCode=true", () => {
  const r = auditSession(join(FIXTURES, "non-code-paper-writing.jsonl"), { includeNonCode: true });
  ok(r.findings.length >= 3, `expected several findings, got ${r.findings.length}`);
});

test("auditSessions aggregates across multiple files", () => {
  const files = [
    join(FIXTURES, "unverified-claim.jsonl"),
    join(FIXTURES, "verified-claim.jsonl"),
    join(FIXTURES, "false-positives.jsonl"),
  ];
  const r = auditSessions(files);
  strictEqual(r.files_scanned, 3);
  ok(r.findings.length >= 1);
  ok(r.verified >= 1);
});
