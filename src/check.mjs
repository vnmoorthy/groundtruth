// src/check.mjs
//
// Per-turn check. Given an assistant turn (text + observations), decide:
//   - Does the text contain a completion claim?
//   - If yes, is there a matching verification artifact in the same turn?
//   - If the claim has no verification, return a block payload with a
//     reason the hook can feed back to Claude.
//
// We also apply a code-context filter: groundtruth's scope per CLAUDE.md
// is code work, not arbitrary task completion. A turn that says "the
// paper is ready" with no code-related signals should not be blocked.
// A turn that says "the parser is fixed" alongside an Edit on parser.mjs
// is exactly what we want to gate. The filter is in src/code-context.mjs.

import { detectClaims } from "./detector.mjs";
import { detectVerifications } from "./verifier.mjs";
import { hasCodeContext } from "./code-context.mjs";

/** @typedef {{
 *   blocked: boolean,
 *   reason?: string,
 *   suppressed?: string,
 *   claims: import("./detector.mjs").Claim[],
 *   verifications: import("./verifier.mjs").Verification[]
 * }} CheckResult
 */

const FEEDBACK_TEMPLATE = (claims, suggestion) => `groundtruth: your response asserts work is complete but this turn contains no verification evidence.

Unverified claim(s):
${claims.map((c, i) => `  ${i + 1}. "${c.sentence}" (trigger: ${c.word})`).join("\n")}

Before you end your turn, produce one of:
  - A passing test command and its output (e.g. \`node --test\`, \`bun test\`, \`pytest\`)
  - A successful type-check (\`tsc --noEmit\`, \`mypy\`, \`pyright\`)
  - A successful build (\`npm run build\`, \`cargo build\`, \`go build\`)
  - A curl response with expected 2xx status
  - A Read or Grep showing the symbol you claim to have written actually exists

${suggestion ? `Suggested next step: ${suggestion}` : ""}

If the work truly is not verifiable in this context, say so explicitly: "I attempted X. I have not verified it. To verify I would need to Y." Do not round up.`;

/**
 * Check a single assistant turn.
 * @param {string} text  The assistant text for this turn.
 * @param {import("./verifier.mjs").ToolObservation[]} observations  Tool obs for same turn.
 * @returns {CheckResult}
 */
export function checkTurn(text, observations) {
  const claims = detectClaims(text || "");
  const verifs = detectVerifications(observations || []);
  if (claims.length === 0) {
    return { blocked: false, claims, verifications: verifs };
  }
  if (verifs.length > 0) {
    return { blocked: false, claims, verifications: verifs };
  }
  // Scope filter: only gate code-work claims. A claim made in a turn with
  // no code signals (no code-extension file paths, no fenced code blocks,
  // no code-shape vocabulary, no Bash/Write/Edit tool calls) is out of
  // scope for groundtruth.
  if (!hasCodeContext(text || "", observations || [])) {
    return {
      blocked: false,
      claims,
      verifications: verifs,
      suppressed: "no-code-context",
    };
  }
  const suggestion = suggestFromClaims(claims);
  return {
    blocked: true,
    reason: FEEDBACK_TEMPLATE(claims, suggestion),
    claims,
    verifications: verifs,
  };
}

function suggestFromClaims(claims) {
  const words = claims.map((c) => c.word.toLowerCase()).join(" ");
  if (/test|pass/.test(words)) {
    return "Run the test command you would use to verify this and paste its output.";
  }
  if (/implement|wire|hook|integrat/.test(words)) {
    return "Grep for the new symbol to show it was written, then run the tests that exercise it.";
  }
  if (/fix|resolv|patch|debug/.test(words)) {
    return "Run the test that previously demonstrated the failure and show it now passes.";
  }
  if (/build|compil|migrat|deploy/.test(words)) {
    return "Run the build or typecheck command and show a successful exit.";
  }
  return "Produce at least one machine-checkable artifact (test, build, typecheck, curl, or grep).";
}

export const _internals = { FEEDBACK_TEMPLATE, suggestFromClaims };
