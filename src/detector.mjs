// src/detector.mjs
//
// Completion-claim detector.
//
// Given a string of assistant output, returns an array of claim records.
// A "claim" is a statement that a piece of code work has been finished,
// in a form that a reader would understand as an assertion of completion.
//
// The design target is precision, not recall. A false positive (flagging
// a non-claim like "I'm working on it") destroys user trust within one
// session and makes the whole tool feel like noise. A missed claim is
// recoverable via review. So the rules below are written to only fire on
// phrasings that unambiguously assert completion of work the agent did.
//
// The detector returns structured records so the audit CLI and the Stop
// hook can both consume them.

/** @typedef {{
 *   word: string,
 *   sentence: string,
 *   offset: number,
 *   pattern: string
 * }} Claim
 */

// Words that, in the right syntactic frame, assert completion.
// Kept short and lowercase. Variants like "fixed"/"fixes" handled in regexes.
const CLAIM_LEMMAS = [
  "done",
  "complete",
  "completed",
  "fixed",
  "ready",
  "shipped",
  "implemented",
  "implement",
  "working",
  "works",
  "passing",
  "passes",
  "resolved",
  "finished",
  "built",
  "wired up",
  "hooked up",
  "landed",
  "merged",
  "added",
];

// Syntactic frames that count as a completion claim about work the agent
// just performed. Each is a regex against a single sentence. The regex
// must match something the agent claims to have done.
//
// Groupings matter: group 1 of each regex is the claim verb/adjective for
// reporting. If a regex has no claim-word group, the whole match is used.
const CLAIM_FRAMES = [
  // "I've implemented", "I have fixed", "I've added"
  {
    name: "first-person-perfect",
    re: /\bI(?:'ve| have)\s+(?:now\s+|just\s+|already\s+)?(implemented|added|fixed|completed|finished|built|wired (?:it )?up|hooked (?:it )?up|landed|shipped|resolved|written|created|made|ensured|verified|tested|wired up|hooked up|updated|refactored|migrated|integrated|deployed|installed|configured|debugged|patched)\b/i,
  },
  // "The bug is fixed", "The feature is done", "Everything is working"
  {
    name: "subject-is-complete",
    re: /\b(?:the\s+\w+(?:\s+\w+){0,3}|everything|all\s+tests|the\s+tests|it|this|that)\s+(?:is|are|should be|looks)\s+(done|complete|completed|fixed|ready|shipped|resolved|finished|working(?!\s+on)|working now|passing|live|in place|set up|up and running|good to go|green)\b/i,
  },
  // "Successfully implemented"
  {
    name: "successfully-verbed",
    re: /\bsuccessfully\s+(implemented|added|fixed|completed|finished|built|merged|landed|deployed|shipped|resolved|integrated|tested|verified|refactored|migrated)\b/i,
  },
  // "Fix is complete", "Implementation is done"
  {
    name: "deverbal-is-done",
    re: /\b(?:fix|implementation|refactor|migration|change|patch|update|integration|work|task|feature)\s+is\s+(done|complete|completed|ready|shipped|finished|live|in place)\b/i,
  },
  // Terse closers at the start of a paragraph: "Done.", "Fixed!", "All set."
  {
    name: "terse-closer",
    re: /(?:^|\n)\s*(?:\*\*)?(Done|Fixed|Complete|Completed|Shipped|Ready|All\s+set|All\s+good|All\s+working|Works(?:!\s*)?|Passing|Green)(?:\*\*)?[.!\s]*(?:\n|$)/i,
  },
  // Checklist lines: "- [x] Implemented X", "* Fixed Y"
  {
    name: "checklist-past-tense",
    re: /(?:^|\n)\s*(?:[-*+]\s+(?:\[[xX]\]\s+)?|\d+\.\s+)(?:Implemented|Added|Fixed|Completed|Finished|Built|Shipped|Landed|Resolved|Wired up|Hooked up|Migrated|Integrated|Deployed|Configured|Refactored|Tested|Verified|Merged)\s+/,
  },
  // "The tests pass", "Tests pass now"
  {
    name: "tests-pass",
    re: /\b(?:the\s+)?tests?\s+(pass|passes|passing|are passing)\b/i,
  },
  // "You're all set", "You should be good"
  {
    name: "you-are-done",
    re: /\bYou(?:'re| are)\s+(all set|good to go|done|ready)\b/i,
  },
];

// Patterns that look like claims but are not. If one of these matches the
// sentence AND only a soft frame matched, we drop the claim.
// These are anchored enough to not bleed past the false-positive context.
const EXCLUSION_PATTERNS = [
  // "I'm working on", "currently working on"
  /\b(?:I'm|I am|currently|still|now)\s+working\s+on\b/i,
  // "ready to X" where X is a verb: "ready to continue", "ready to move"
  /\bready\s+to\s+(?:continue|proceed|move|go|start|begin|look|check|try|test|run|write|edit|implement|investigate|dig|see|hear|discuss|review|examine|explore|understand|learn|help|assist)\b/i,
  // "working as" (working as expected, working as intended)
  /\bworking\s+as\s+(?:expected|intended|designed|documented|specified)\b/i,
  // "working code" / "working example" / "working implementation" (adjectival)
  /\bworking\s+(?:example|code|implementation|copy|version|directory|tree|branch|state|setup|solution)\b/i,
  // "complete with" / "complete set" (adjectival)
  /\bcomplete\s+(?:with|set|list|picture|overview|rewrite|coverage)\b/i,
  // "should be ready soon" / "almost done" (hedged future)
  /\b(?:almost|nearly|about to be|soon)\s+(?:done|ready|complete|finished)\b/i,
  // "the previously fixed" / "already fixed earlier"
  /\bpreviously\s+(?:fixed|implemented|added|resolved)\b/i,
  // "if X is working" / "when Y is ready" (conditional)
  /\b(?:if|when|once|unless|whether|assuming)\s+(?:it\s+|that\s+|this\s+)?(?:is|are|was|were)\s+(?:working|done|ready|fixed|complete)\b/i,
  // "is it working?" (questions end with ?)
  /\?\s*$/,
  // Meta about a tool or library: "Bun's test runner works well"
  /\b(?:bun|node|npm|pnpm|yarn|deno|cargo|go|pytest|jest|vitest|typescript)(?:'s)?\s+\w+\s+works\b/i,
];

// Sentence splitter that preserves offsets. We skip fenced code blocks so
// that example code inside markdown does not create false positives.
function stripCodeBlocks(text) {
  // Fenced blocks
  let out = text.replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length));
  // Inline code
  out = out.replace(/`[^`\n]+`/g, (m) => " ".repeat(m.length));
  return out;
}

function splitSentences(text) {
  // Keep offsets aligned by returning {start, end, text} records.
  const records = [];
  const re = /[^.!?\n]*[.!?\n]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const sentenceText = m[0];
    if (sentenceText.trim().length > 0) {
      records.push({ start, end, text: sentenceText });
    }
  }
  // Tail without terminator
  const consumed = records.length > 0 ? records[records.length - 1].end : 0;
  if (consumed < text.length) {
    const tail = text.slice(consumed);
    if (tail.trim().length > 0) {
      records.push({ start: consumed, end: text.length, text: tail });
    }
  }
  return records;
}

function isExcluded(sentence) {
  for (const p of EXCLUSION_PATTERNS) {
    if (p.test(sentence)) return true;
  }
  return false;
}

/**
 * Detect completion claims in a piece of assistant output.
 * @param {string} text
 * @returns {Claim[]}
 */
export function detectClaims(text) {
  if (!text || typeof text !== "string") return [];
  const stripped = stripCodeBlocks(text);
  const sentences = splitSentences(stripped);
  /** @type {Claim[]} */
  const claims = [];
  const seen = new Set();
  for (const s of sentences) {
    if (isExcluded(s.text)) continue;
    for (const frame of CLAIM_FRAMES) {
      const m = frame.re.exec(s.text);
      if (!m) continue;
      // The matched claim word is group 1 if present, else the full match.
      const word = (m[1] || m[0]).trim();
      const absoluteOffset = s.start + m.index;
      const key = `${absoluteOffset}:${word}:${frame.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push({
        word,
        sentence: s.text.trim(),
        offset: absoluteOffset,
        pattern: frame.name,
      });
    }
  }
  return claims;
}

// Exported for tests.
export const _internals = {
  CLAIM_FRAMES,
  EXCLUSION_PATTERNS,
  CLAIM_LEMMAS,
  stripCodeBlocks,
  splitSentences,
  isExcluded,
};
