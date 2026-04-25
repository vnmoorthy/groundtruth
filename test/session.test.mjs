// test/session.test.mjs
import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSessionFile, parseSessionText, observationsForTurn } from "../src/session.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

test("parses unverified-claim fixture (1 user + 1 merged assistant response)", () => {
  const turns = parseSessionFile(join(FIXTURES, "unverified-claim.jsonl"));
  // Fixture has: user, assistant+tool_use, user(tool_result), assistant
  // My parser groups the logical response into one assistant turn object.
  ok(turns.length >= 2, `expected >=2 logical turns, got ${turns.length}`);
  const assistants = turns.filter((t) => t.kind === "assistant");
  ok(assistants.length >= 1);
  // The merged assistant turn should contain the completion claim text
  // AND the Write tool use from earlier in the response.
  const a = assistants[0];
  ok(a.text.includes("implemented"), `assistant text missing claim: ${a.text.slice(0, 200)}`);
  ok(a.tool_uses.some((u) => u.tool === "Write"));
  ok(a.tool_results.length >= 1);
});

test("parses verified-claim fixture (merged response contains Bash tool_result)", () => {
  const turns = parseSessionFile(join(FIXTURES, "verified-claim.jsonl"));
  const assistants = turns.filter((t) => t.kind === "assistant");
  ok(assistants.length >= 1);
  const a = assistants[0];
  ok(a.tool_uses.some((u) => u.tool === "Bash" && /node\s+--test/.test(u.input.command || "")));
  ok(a.tool_results.some((r) => (r.content || "").includes("# pass 1")));
});

test("observationsForTurn correlates tool_use with tool_result by id", () => {
  const turns = parseSessionFile(join(FIXTURES, "verified-claim.jsonl"));
  const assistants = turns.filter((t) => t.kind === "assistant");
  const testTurn = assistants.find((t) =>
    t.tool_uses.some((u) => u.tool === "Bash" && /node\s+--test/.test(u.input.command || "")),
  );
  ok(testTurn, "expected to find a turn with node --test");
  const obs = observationsForTurn(testTurn);
  const bash = obs.find((o) => o.tool === "Bash");
  ok(bash);
  ok(bash.output.includes("# pass 1"));
});

test("skips isMeta records", () => {
  const text = `{"type":"user","isMeta":true,"message":{"role":"user","content":"IGNORE"}}
{"type":"user","message":{"role":"user","content":"hello"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}`;
  const turns = parseSessionText(text);
  strictEqual(turns.length, 2);
  strictEqual(turns[0].kind, "user");
  strictEqual(turns[0].text, "hello");
});

test("tolerates corrupt lines without crashing", () => {
  const text = `not-json-at-all
{"type":"user","message":{"role":"user","content":"a"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"b"}]}}`;
  const turns = parseSessionText(text);
  strictEqual(turns.length, 2);
});

test("multiple assistant text blocks concatenate", () => {
  const text = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"one"},{"type":"text","text":"two"}]}}`;
  const turns = parseSessionText(text);
  strictEqual(turns.length, 1);
  ok(turns[0].text.includes("one"));
  ok(turns[0].text.includes("two"));
});
