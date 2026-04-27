// src/replay.mjs
//
// `groundtruth replay <session.jsonl>` — runs a past session through the
// gate as if groundtruth had been live during it, and prints what would
// have happened at each turn boundary.
//
// Useful for:
//   - Retros: "if I had had this gate yesterday, where would it have fired?"
//   - Onboarding: showing new users what the gate actually does, on their data.
//   - Calibration: comparing v0.1.x against the same session over time.

import { parseSessionFile, observationsForTurn } from "./session.mjs";
import { detectClaims } from "./detector.mjs";
import { detectVerifications } from "./verifier.mjs";
import { hasCodeContext } from "./code-context.mjs";
import { loadConfig } from "./config.mjs";

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function useColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
}

function c(color, text) {
  return useColor() ? `${COLORS[color]}${text}${COLORS.reset}` : text;
}

/**
 * Replay a single session JSONL.
 * Returns an array of per-turn events suitable for printing or piping to JSON.
 */
export function replaySession(filePath, opts = {}) {
  const config = opts.config || loadConfig();
  const turns = parseSessionFile(filePath);
  const events = [];
  for (const turn of turns) {
    if (turn.kind !== "assistant") continue;
    const claims = detectClaims(turn.text || "", {
      extraExclusions: config.exclude_patterns,
    });
    const obs = observationsForTurn(turn);
    const verifs = detectVerifications(obs);
    const codeCtx = hasCodeContext(turn.text || "", obs);

    let outcome;
    if (claims.length === 0) {
      outcome = "no-claim";
    } else if (verifs.length > 0) {
      outcome = "verified";
    } else if (!codeCtx) {
      outcome = "suppressed-non-code";
    } else {
      outcome = "would-have-blocked";
    }

    events.push({
      turn: turn.index,
      timestamp: turn.timestamp,
      line_start: turn.line_start,
      line_end: turn.line_end,
      claims_count: claims.length,
      verifications_count: verifs.length,
      code_context: codeCtx,
      outcome,
      first_claim: claims[0]
        ? { word: claims[0].word, sentence: claims[0].sentence, pattern: claims[0].pattern }
        : null,
    });
  }
  return events;
}

export function renderReplayText(events, filePath) {
  const lines = [];
  lines.push(c("bold", `replay: ${filePath}`));
  lines.push(`${events.length} assistant turns`);
  lines.push("");
  for (const e of events) {
    const tag =
      e.outcome === "would-have-blocked"
        ? c("red", "BLOCK")
        : e.outcome === "verified"
          ? c("green", "OK   ")
          : e.outcome === "suppressed-non-code"
            ? c("dim", "SKIP ")
            : c("dim", "----");
    const ts = e.timestamp ? ` ${c("dim", e.timestamp.slice(0, 19))}` : "";
    lines.push(`  ${tag}  turn ${String(e.turn).padStart(3)}${ts}  ${e.outcome}`);
    if (e.first_claim) {
      const claim =
        e.first_claim.sentence.length > 100
          ? `${e.first_claim.sentence.slice(0, 100)}…`
          : e.first_claim.sentence;
      lines.push(`         ${c("dim", `[${e.first_claim.pattern}/${e.first_claim.word}]`)} ${claim}`);
    }
  }
  lines.push("");
  const counts = events.reduce((acc, e) => {
    acc[e.outcome] = (acc[e.outcome] || 0) + 1;
    return acc;
  }, {});
  lines.push(c("bold", "summary"));
  lines.push(`  would-have-blocked:    ${counts["would-have-blocked"] || 0}`);
  lines.push(`  verified-in-same-turn: ${counts["verified"] || 0}`);
  lines.push(`  suppressed (non-code): ${counts["suppressed-non-code"] || 0}`);
  lines.push(`  no claim in turn:      ${counts["no-claim"] || 0}`);
  return lines.join("\n");
}

export async function runReplay(args) {
  const flags = { json: false };
  const positional = [];
  for (const a of args) {
    if (a === "--json") flags.json = true;
    else if (!a.startsWith("--")) positional.push(a);
  }
  if (positional.length === 0) {
    process.stderr.write(
      "groundtruth replay: provide a path to a session JSONL file\n" +
        "  example: groundtruth replay ~/.claude/projects/<hash>/<session>.jsonl\n",
    );
    process.exit(2);
  }
  const filePath = positional[0];
  let events;
  try {
    events = replaySession(filePath);
  } catch (err) {
    process.stderr.write(
      `groundtruth replay: ${err.message}\n` +
        "  Why: the file could not be parsed as a Claude Code session JSONL.\n" +
        "  Fix: confirm the path with `groundtruth audit <path>` first; if audit\n" +
        "       parses 0 turns, the file is the wrong format.\n",
    );
    process.exit(1);
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify({ file: filePath, events }, null, 2) + "\n");
  } else {
    process.stdout.write(renderReplayText(events, filePath) + "\n");
  }
  const blocked = events.filter((e) => e.outcome === "would-have-blocked").length;
  process.exit(blocked > 0 ? 1 : 0);
}
