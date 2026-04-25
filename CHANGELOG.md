# Changelog

All notable changes to this project are recorded here.
Format follows [keepachangelog.com](https://keepachangelog.com/en/1.1.0/).
Versioning follows [semver.org](https://semver.org).

## [0.1.3] — 2026-04-24

The 0.1.2 code-context filter dropped findings from 30 to 5 against the same real corpus, but the remaining 5 were all paper-writing claims slipping through because the academic-flavored sessions contained code-language fenced blocks (Python data analysis, SQL examples) that satisfied the code-context filter while the actual claim was about manuscript work.

This release adds detector-level academic-subject exclusions so those phrasings never become claims in the first place, regardless of whether the surrounding turn has code context.

### Added

- `EXCLUSION_PATTERNS` in `src/detector.mjs` now includes:
  - Memory-observer XML tags (`<completed>`, `<fact>`, `<next_steps>`, `<achievement>`, etc.) emitted by agent observability tools.
  - Paper / manuscript / submission / chapter / section / abstract / bibliography / figure subjects in is/are completion frames, with up to ~6 words of modifiers between the noun and the verb.
  - Paper-writing compound subjects: `Paper editing`, `paper preparation`, `paper writing`, etc.
  - Pure-academic-flavor work modifiers: `intellectual and technical work`, `scholarly work`, etc. (`technical` alone is too code-adjacent to exclude.)
  - Citation / bibliography / footnote / endnote work.
  - Word-count operations: `Added 54 words`, `Cut 200 words`.
  - Author metadata operations.
  - Paper venues anywhere in the sentence: TMLR, NeurIPS, ICML, ICLR, CVPR, arXiv, OpenReview, etc., including underscore-joined forms like `PAVO_TMLR_submission`.
  - Compiled / typeset PDF / LaTeX / TeX output.
- 9 new detector tests, each derived from a real false positive surfaced in audit-self.

### Changed

- Two pre-existing tests updated to match the new behavior: paper-writing fixtures are now suppressed at the detector layer, not the code-context layer.

### Test count

104 tests pass (was 95).

### Empirical result

On a corpus of 50 sessions / 1,272 turns from one academic user's `~/.claude/projects`:
- v0.1.0: 30 findings (all false positives)
- v0.1.2: 5 findings (all false positives, code-context filter limited)
- v0.1.3: expected close to 0 - 1 finding (the remaining is a numeric "successfully added N items" phrasing that is too generic to safely exclude)

## [0.1.2] — 2026-04-24

The 0.1.1 code-context filter still fired on academic prose because the underlying CODE_VOCAB list contained words like `method`, `class`, `module`, `argument`, `return`, `this`, `new`, which appear constantly in non-code English. Real audit against 50 sessions reproduced the same 30 findings as 0.1.0.

This release tightens the filter to only count hard signals.

### Changed

- `hasCodeContext` now returns true only if (a) a tool call is `Bash`/`BashOutput`, (b) `Write`/`Edit`/`MultiEdit`/`NotebookEdit` against a code-extension path, (c) `Read`/`Grep` against a code-extension path, or (d) the assistant text contains a triple-backtick fenced code block. The previous CODE_VOCAB and FILE_PATH_HINT heuristics are removed.
- Test fixture `checklist.jsonl` updated to include a Write tool call so it represents a real code session, not freestanding prose.
- Two tests updated to reflect the stricter behavior: `checkTurn` no longer blocks claims with no code context (now suppresses), and the hook test for missing transcripts allows when the prose has no fenced block.

### Added

- `explainCodeContext(text, observations)` returns the matched signal for diagnostics.

### Test count

95 tests pass (was 90).

## [0.1.1] — 2026-04-24

Calibration release driven by a real-data audit against 50 sessions / 1,272 turns of one user's `~/.claude/projects`. The unfiltered detector produced 30 findings, all from non-code work (academic paper writing, submission tracking, citation management). This release adds a code-context filter to keep groundtruth focused on its stated scope.

### Added

- `src/code-context.mjs` — code-context filter. A turn is treated as code work only if (a) it contains a tool call to `Write`/`Edit`/`MultiEdit`/`NotebookEdit`/`Bash`/`BashOutput`, (b) `Read` or `Grep` against a code-extension path, (c) a fenced code block in the assistant text, (d) a code-shaped file path mention, (e) shell-command vocabulary, or (f) common programming keywords.
- `--all` flag (alias `--include-non-code`) on `audit` and `check` to bypass the filter when tuning.
- `suppressed_non_code` counter in audit reports so suppressed findings remain countable.
- Tests for the code-context filter (12 cases) and the audit suppression behavior.

### Changed

- `checkTurn` and `auditSession` now apply the code-context filter by default. A claim found in a non-code turn is suppressed instead of blocking. Per CLAUDE.md the rule was always scoped to code work; this release enforces that scope at the gate.
- `auditSession` and `auditSessions` accept `{ includeNonCode: true }` opts.

### Fixed

- `tools/bootstrap.sh` no longer exits silently on a missing global git identity; it sets a repo-local identity from `whoami` + hostname and tells you to override.
- `tools/bootstrap.sh` now matches both Node 22 (`# tests 74`) and Node 24 summary formats.
- `tools/live-smoke.sh` no longer falsely fails the "Stop hook registered" check due to a `pipefail` + SIGPIPE interaction with `grep -q`.
- `tools/audit-self.sh` and `tools/live-smoke.sh` fall back to the repo-local CLI when `groundtruth` is not on PATH.

### Test count

90 tests pass (was 74).

## [0.1.0] — 2026-04-24

The first release. Everything in this version was verified end-to-end before tagging. Every file in the repo was produced under the repo's own gate; see `CLAUDE.md`.

### Added

- `groundtruth` CLI with subcommands: `audit`, `check`, `hook`, `memory-check`, `install`, `uninstall`, `status`, `version`.
- Syntactic completion-claim detector (`src/detector.mjs`) with 8 claim frames and 9 exclusion patterns.
- Tool-observation verifier (`src/verifier.mjs`) recognizing test runners for Node, Bun, npm/pnpm/yarn, Jest, Vitest, Mocha, TAP, pytest, cargo, go, phpunit, rspec, gradle, maven, ctest, plus typecheck, build, lint, and curl artifacts.
- Session JSONL parser (`src/session.mjs`) with 1-based line number preservation.
- Stop hook entry point (`src/hook-entry.mjs`) conforming to the Claude Code v2.1.119 hook protocol as extracted from the binary.
- Memory gate (`src/memory-gate.mjs`) for `MEMORY.md`, `NOTES.md`, `LEARNINGS.md`, `.claude/memory/*`.
- Audit CLI with text, JSON, and SARIF 2.1.0 output formats.
- Single-paste installer (`install.sh`) that works both from a curl pipe and from a local checkout.
- 74 automated tests across detector, verifier, session parser, check logic, hook protocol, memory gate, audit, and CLI end-to-end.
- Skill file at `skills/groundtruth/SKILL.md` describing the rule for the agent.
- `docs/findings.md` documenting the Phase 0 hook-surface extraction from the Claude Code binary, with the exact binary expressions cited.
- `examples/composition-with-gstack.md` describing how groundtruth layers with gstack and superpowers.
- `ARCHITECTURE.md` with an honest account of what the gate enforces, what it cannot enforce, and the design tradeoffs.

### Verified

- All 74 tests pass under `node --test`. Run: `npm test`.
- Install script completes in under 100ms on a warm checkout (exclusive of git clone).
- Uninstall is idempotent and backs up `settings.json` before modifying it.
- SARIF output validates against the SARIF 2.1.0 schema.
- Hook protocol tested against real JSONL fixtures that match the Claude Code session format.
- False-positive fixture covering nine common non-claim phrasings produces zero findings.

### Known limitations

- Mid-turn claims that never reach Stop are not visible to the hook. The audit CLI covers them retroactively.
- Detector is regex-based. Novel phrasings can evade it; contributions welcome.
- Verifier recognizes common test runners but not bespoke verification scripts. Add a fragment to `TEST_COMMAND_FRAGMENTS` or equivalent and add a test.
- Memory gate is a command, not yet a PreToolUse hook by default. Wiring it into the installer is a two-line change; left opt-in to keep the default footprint small.

[0.1.0]: https://github.com/moorthy/groundtruth/releases/tag/v0.1.0
