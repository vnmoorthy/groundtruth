// src/memory-gate.mjs
//
// Memory gate.
//
// Rule 3 of the groundtruth design: you do not write to any MEMORY.md,
// NOTES.md, or persistent memory file unless the fact you are recording
// was verified in the current session.
//
// This module checks a proposed memory file write. It's invoked from
// the CLI as `groundtruth memory-check <path> [--content <text>]` and
// can be wired to a PreToolUse hook on Write/Edit for matching paths.
//
// The check runs detectClaims over the proposed new content. If a claim
// is detected, we block the write unless the current session has a
// matching verification artifact nearby (within the last N turns of the
// session transcript, if one is supplied).

import { readFileSync, existsSync } from "node:fs";
import { detectClaims } from "./detector.mjs";
import { parseSessionFile, observationsForTurn } from "./session.mjs";
import { detectVerifications } from "./verifier.mjs";

const MEMORY_FILENAMES = [
  /(?:^|\/)MEMORY\.md$/i,
  /(?:^|\/)NOTES\.md$/i,
  /(?:^|\/)LEARNINGS\.md$/i,
  /(?:^|\/)JOURNAL\.md$/i,
  /(?:^|\/)DECISIONS\.md$/i,
  /(?:^|\/)\.claude\/memory\b/i,
];

/**
 * True if a path looks like a persistent memory file.
 */
export function isMemoryFile(path) {
  if (!path || typeof path !== "string") return false;
  for (const p of MEMORY_FILENAMES) if (p.test(path)) return true;
  return false;
}

/**
 * Check a proposed memory write. Returns { allowed, reason, claims }.
 * If a transcriptPath is given, we also examine the last few assistant
 * turns of that session for matching verification.
 *
 * @param {{
 *   content: string,
 *   transcriptPath?: string,
 *   sessionLookback?: number
 * }} opts
 */
export function checkMemoryWrite({ content, transcriptPath, sessionLookback = 5 }) {
  const claims = detectClaims(content || "");
  if (claims.length === 0) {
    return { allowed: true, reason: "", claims: [], verifications: [] };
  }

  // If no transcript is given, we cannot verify — block.
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return {
      allowed: false,
      reason:
        "groundtruth memory gate: the content being written contains completion claims but no session transcript is available to verify them in. " +
        "Either provide --transcript <path> when invoking, or remove the completion claim from the memory file.",
      claims,
      verifications: [],
    };
  }

  try {
    const turns = parseSessionFile(transcriptPath);
    const assistants = turns.filter((t) => t.kind === "assistant");
    const recent = assistants.slice(-Math.max(1, sessionLookback));
    let verifs = [];
    for (const t of recent) {
      verifs = verifs.concat(detectVerifications(observationsForTurn(t)));
    }
    if (verifs.length > 0) {
      return { allowed: true, reason: "", claims, verifications: verifs };
    }
    return {
      allowed: false,
      reason:
        `groundtruth memory gate: the content being written contains completion claims, ` +
        `but the last ${sessionLookback} assistant turns produced no verification artifacts. ` +
        `Either (a) run a test/build/typecheck so the claim is grounded in the current session, ` +
        `or (b) rewrite the memory entry to say what was attempted, not what was completed.`,
      claims,
      verifications: [],
    };
  } catch (err) {
    return {
      allowed: false,
      reason: `groundtruth memory gate: failed to read transcript ${transcriptPath}: ${err.message}`,
      claims,
      verifications: [],
    };
  }
}

/**
 * CLI entry for `groundtruth memory-check`.
 */
export async function runMemoryCheck(args) {
  let path = null;
  let contentFromFlag = null;
  let transcript = null;
  let lookback = 5;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--content") contentFromFlag = args[++i];
    else if (a === "--transcript") transcript = args[++i];
    else if (a === "--lookback") lookback = parseInt(args[++i], 10) || 5;
    else if (!a.startsWith("--") && !path) path = a;
  }
  if (!path && contentFromFlag === null) {
    process.stderr.write(
      "groundtruth memory-check: provide a file path, or pass --content <text>\n",
    );
    process.exit(2);
  }
  const content =
    contentFromFlag !== null ? contentFromFlag : readFileSync(path, "utf8");
  const result = checkMemoryWrite({
    content,
    transcriptPath: transcript,
    sessionLookback: lookback,
  });
  if (result.allowed) {
    process.stdout.write("groundtruth memory-check: OK\n");
    if (result.claims.length > 0) {
      process.stdout.write(
        `  ${result.claims.length} claim(s) found, ${result.verifications.length} verification(s) in session context\n`,
      );
    }
    process.exit(0);
  } else {
    process.stderr.write(`${result.reason}\n\n`);
    for (const c of result.claims) {
      process.stderr.write(`  unverified claim: "${c.sentence}" [trigger: ${c.word}]\n`);
    }
    process.exit(2);
  }
}
