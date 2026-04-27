// src/list-patterns.mjs
//
// `groundtruth list-patterns` — print every claim frame, every exclusion
// pattern, every test/build/lint/curl recognizer the detector and verifier
// know about. Transparency: anyone can see exactly what the gate is
// checking for, instead of taking it on faith.
//
// Also a useful debugging aid: when a finding's pattern name doesn't make
// sense, `list-patterns` shows the regex source.

import { _internals as detectorInternals } from "./detector.mjs";
import { _internals as verifierInternals } from "./verifier.mjs";
import { _internals as codeContextInternals } from "./code-context.mjs";

function header(label) {
  return `\n=== ${label} ===\n`;
}

function indent(s, by = "  ") {
  return s
    .split("\n")
    .map((line) => `${by}${line}`)
    .join("\n");
}

function regexSource(re) {
  return `/${re.source}/${re.flags}`;
}

export function renderPatterns() {
  const out = [];
  out.push("groundtruth: full pattern reference (v0.1.7)");
  out.push("");
  out.push("Each claim frame below fires when the regex matches a sentence.");
  out.push("Each exclusion pattern, if it matches the same sentence, suppresses");
  out.push("the claim regardless of which frame caught it.");

  out.push(header("CLAIM FRAMES"));
  for (const f of detectorInternals.CLAIM_FRAMES) {
    out.push(`  ${f.name}`);
    out.push(`    ${regexSource(f.re)}`);
    out.push("");
  }

  out.push(header("EXCLUSION PATTERNS"));
  for (const p of detectorInternals.EXCLUSION_PATTERNS) {
    out.push(`  ${regexSource(p)}`);
  }

  out.push(header("VERIFIER: TEST COMMAND FRAGMENTS"));
  for (const p of verifierInternals.TEST_COMMAND_FRAGMENTS) {
    out.push(`  ${regexSource(p)}`);
  }

  out.push(header("VERIFIER: TYPECHECK COMMAND FRAGMENTS"));
  for (const p of verifierInternals.TYPECHECK_COMMAND_FRAGMENTS) {
    out.push(`  ${regexSource(p)}`);
  }

  out.push(header("VERIFIER: BUILD COMMAND FRAGMENTS"));
  for (const p of verifierInternals.BUILD_COMMAND_FRAGMENTS) {
    out.push(`  ${regexSource(p)}`);
  }

  out.push(header("VERIFIER: LINT COMMAND FRAGMENTS"));
  for (const p of verifierInternals.LINT_COMMAND_FRAGMENTS) {
    out.push(`  ${regexSource(p)}`);
  }

  out.push(header("VERIFIER: HTTP COMMAND FRAGMENTS"));
  for (const p of verifierInternals.HTTP_COMMAND_FRAGMENTS) {
    out.push(`  ${regexSource(p)}`);
  }

  out.push(header("CODE-CONTEXT FILTER"));
  out.push(`  triple-fenced block: ${regexSource(codeContextInternals.TRIPLE_FENCED)}`);
  out.push(`  code extensions:     ${regexSource(codeContextInternals.CODE_EXT)}`);
  out.push(`  strong tools:        ${[...codeContextInternals.STRONG_TOOLS].join(", ")}`);

  out.push("");
  out.push("Counts:");
  out.push(`  ${detectorInternals.CLAIM_FRAMES.length} claim frames`);
  out.push(`  ${detectorInternals.EXCLUSION_PATTERNS.length} exclusion patterns`);
  out.push(`  ${verifierInternals.TEST_COMMAND_FRAGMENTS.length} test runners`);
  out.push(`  ${verifierInternals.TYPECHECK_COMMAND_FRAGMENTS.length} type checkers`);
  out.push(`  ${verifierInternals.BUILD_COMMAND_FRAGMENTS.length} build commands`);
  out.push(`  ${verifierInternals.LINT_COMMAND_FRAGMENTS.length} linters`);
  out.push(`  ${verifierInternals.HTTP_COMMAND_FRAGMENTS.length} http clients`);

  return out.join("\n");
}

export function renderPatternsJson() {
  return JSON.stringify(
    {
      claim_frames: detectorInternals.CLAIM_FRAMES.map((f) => ({
        name: f.name,
        regex: f.re.source,
        flags: f.re.flags,
      })),
      exclusion_patterns: detectorInternals.EXCLUSION_PATTERNS.map((p) => ({
        regex: p.source,
        flags: p.flags,
      })),
      verifier: {
        test_commands: verifierInternals.TEST_COMMAND_FRAGMENTS.map((p) => p.source),
        typecheck_commands: verifierInternals.TYPECHECK_COMMAND_FRAGMENTS.map((p) => p.source),
        build_commands: verifierInternals.BUILD_COMMAND_FRAGMENTS.map((p) => p.source),
        lint_commands: verifierInternals.LINT_COMMAND_FRAGMENTS.map((p) => p.source),
        http_commands: verifierInternals.HTTP_COMMAND_FRAGMENTS.map((p) => p.source),
      },
      code_context: {
        triple_fenced: codeContextInternals.TRIPLE_FENCED.source,
        code_extensions: codeContextInternals.CODE_EXT.source,
        strong_tools: [...codeContextInternals.STRONG_TOOLS],
      },
      counts: {
        claim_frames: detectorInternals.CLAIM_FRAMES.length,
        exclusion_patterns: detectorInternals.EXCLUSION_PATTERNS.length,
        test_commands: verifierInternals.TEST_COMMAND_FRAGMENTS.length,
        typecheck_commands: verifierInternals.TYPECHECK_COMMAND_FRAGMENTS.length,
        build_commands: verifierInternals.BUILD_COMMAND_FRAGMENTS.length,
        lint_commands: verifierInternals.LINT_COMMAND_FRAGMENTS.length,
        http_commands: verifierInternals.HTTP_COMMAND_FRAGMENTS.length,
      },
    },
    null,
    2,
  );
}

export async function runListPatterns(args) {
  const json = args.includes("--json");
  if (json) {
    process.stdout.write(renderPatternsJson() + "\n");
  } else {
    process.stdout.write(renderPatterns() + "\n");
  }
  process.exit(0);
}
