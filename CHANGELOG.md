# Changelog

All notable changes to this project are recorded here.
Format follows [keepachangelog.com](https://keepachangelog.com/en/1.1.0/).
Versioning follows [semver.org](https://semver.org).

## [0.1.10] — 2026-04-27

Acts on both findings from gstack `/cso` security audit. Both were MEDIUM, both are now closed.

### Added

- **`.github/CODEOWNERS`** — requires review from `@vnmoorthy` on the highest-blast-radius paths: `.github/`, `install.sh`, the hook entry points, the install module, the memory hook, the skills directory, and `SECURITY.md` itself. Closes the largest gap: a malicious commit on `main` cascading to every user via the `curl | bash` install line. The companion change is enabling "Require review from Code Owners" on the `main` branch (GitHub repo settings → Branches), which is a UI toggle the user has to flip; the file landing here is the prerequisite.
- **`.github/dependabot.yml`** — schedules weekly updates for the `github-actions` ecosystem so the SHA pins stay current as upstream actions release.

### Changed

- **`.github/workflows/ci.yml`** — pinned `actions/checkout@v4` and `actions/setup-node@v4` to specific SHAs (`b4ffde65f46336ab88eb53be808477a3936bae11` and `1e60f620b9541d16bece96c5465dc8ee9832be0b`). Floating tags are mutable; SHAs are not. Inline comments reference the security review.
- **`SECURITY.md`** — Threat 3 (malicious commit on main) updated to reflect that both mitigations are in place. The file now distinguishes between mitigations the project ships and configuration the user must enable.

### gstack `/cso` audit summary

The `/cso` audit ran a stack-detection, attack-surface, secrets, and DOM-sink pass. It dropped 5 candidate findings as already-mitigated or non-exploitable (zero deps, no eval, no spawn of user input, no outbound HTTP, escaped innerHTML in the playground, the user-supplied regex ReDoS being self-inflicted) and surfaced 2 real ones, both addressed in this release. The full report is at `.gstack/security-reports/2026-04-27T101245.json` (gitignored, local only).

### Test count

135 tests pass (unchanged — these were CI/security additions, no source changes).

## [0.1.9] — 2026-04-25

Multi-angle review pass: ran the equivalent of CEO / engineering / devex / security / design critiques on the project and shipped the highest-leverage fixes.

### Added

- **`groundtruth demo`** — runs the live hook flow against a built-in two-scene fixture (unverified claim → block, verified claim → allow) and prints what the gate decides at each step. Time-to-first-block goes from "wait until it happens in a real session" to ~5 seconds after install. Set `GROUNDTRUTH_DEMO_FAST=1` to skip the typing pauses. This is the highest-leverage devex fix the review surfaced.
- **`SECURITY.md`** — honest threat model. Walks through what the hook can do (run as user, no network), what it doesn't do (no telemetry, no credentials, no third-party deps), and the realistic threats with their mitigations. Verifiable claims: `cat package.json | jq .dependencies` returns null, `grep -r "fetch\|http" src/ bin/` returns nothing.
- **`ROADMAP.md`** — what groundtruth might do later, organized into "sharper at the one thing" / "better evaluation surface" / "composition with the ecosystem" / "the bigger product hiding inside" / "out of scope on purpose." Captures the multi-angle review notes verbatim so future scope decisions can reference the analysis.

### Test count

135 tests pass (unchanged — these were UX, docs, and roadmap additions).

### What this release explicitly is NOT

I considered building groundtruth's own version of gstack's 24-command suite (`/plan-ceo-review`, `/ship`, `/qa`, etc.). Decided against. groundtruth's value is being narrow; reproducing a workflow tool would dilute the calibration story. ROADMAP.md captures this decision under "Out of scope, on purpose."

## [0.1.8] — 2026-04-25

Transparency and documentation pass. Three additions, no behavior changes.

### Added

- **`groundtruth list-patterns`** (alias `groundtruth patterns`) — prints every claim frame, every exclusion pattern, every recognized test/build/lint/typecheck/http command, plus the code-context rules. `--json` for machine consumers. Closes the "what does this thing actually check for?" question without requiring source-code reading.
- **`docs/FAQ.md`** — 11 question-answer pairs covering performance, false-positive handling, scope of the code-context filter, temporary disabling, memory-hook tradeoffs, gstack/superpowers composition, the dogfooding rule, and protocol stability.
- **`docs/COMPARISON.md`** — worked side-by-side examples of the same buggy session against groundtruth, gstack `/ship`, superpowers, decider/claude-hooks, claude-flow, and disler/claude-code-hooks-mastery. Positions groundtruth honestly without disparaging the others.

### Fixed

- README documentation drift: claimed "27 exclusion patterns" — the actual count after several iterations of consolidation is 21. The new `list-patterns` command surfaced the inconsistency. README and FAQ now state 21 and refer to `list-patterns` for the live count.

### Test count

135 tests pass (unchanged).

## [0.1.7] — 2026-04-25

Three more user-facing additions, plus a community-driven detector improvement triggered by the new contribution loop.

### Added

- **`groundtruth bench`** — runs the full audit against the user's actual `~/.claude/projects/` history, reports per-thousand-turn timing on their hardware, and prints a tweet-ready string ("groundtruth audit: N turns in M ms on my macOS-arm64"). Designed to be the number people share when they install. `--json` for machine consumers.
- **`groundtruth fixture add <sentence>`** — turns a real false-positive (or true-positive) report into a permanent fixture in one command. Appends the sentence to `test/fixtures/community-{false,true}-positives.txt` and ensures the auto-generated `test/community-fixtures.test.mjs` exercises it on every `node --test`. Closes the contribution loop: user paste → captured fixture → regression test → detector fix.
- **`tools/demo.tape`** — a [vhs](https://github.com/charmbracelet/vhs) script that records the 30-second README demo as an animated GIF. Five scenes: install line, unverified-claim audit, verified-claim audit, live Stop-hook block, closing card with the playground URL. Output: `docs/demo.gif`. Run with `vhs tools/demo.tape` after `brew install charmbracelet/tap/vhs`.

### Changed (driven by the fixture-add loop)

- `src/detector.mjs` — added an exclusion for "team / audience / stakeholders / etc. is ready for the demo / talk / launch / etc." phrasings. Surfaced when the first community-fixture line ("The team is ready for the demo.") was captured and the auto-generated test failed against the existing detector. The full loop ran end-to-end on the same release, demonstrating the contribution path works.

### Test count

135 tests pass (was 133). The two new tests are auto-generated by `groundtruth fixture add` and live in `test/community-fixtures.test.mjs`.

## [0.1.6] — 2026-04-25

Visual identity and credibility-number pass. Three additions, all aimed at increasing the conversion rate from "saw the link" to "tried the tool."

### Added

- **`docs/index.html`** — a proper landing page, separate from the README. Designed to be the URL someone clicks through to from a tweet, an HN comment, or a launch post. Embeds the logo, the live in-vivo demo, the calibration table, the comparison vs gstack/superpowers/decider, the playground link, and the install one-liner. Hostable via the same GitHub Pages deployment as the playground.
- **`docs/logo.svg`** — visual identity. Octagon (stop sign) with a check mark. Inline SVG, no fonts loaded, ~1.2KB. Used in the landing page hero and embeddable in the README via raw.githubusercontent.com.
- **`test/perf.test.mjs`** — benchmark + regression budget. Synthesizes a 1,000-turn session, runs the full audit, asserts wall-clock under 5,000ms. Real measurement: **27ms for 1,000 turns, 1ms for 100 turns.** That number is the new credibility signal in the README.

### Test count

133 tests pass (up from 131).

### Measured performance

| corpus size | audit time |
| ---: | --- |
| 100 turns | ~1 ms |
| 1,000 turns | ~27 ms |
| 50 turns × 100 sessions = 5,000 turns | extrapolated ~135 ms |

Audit is functionally instant for any realistic user history. The bottleneck for users with very large histories will be JSONL disk read, not detection or verification.

### What this release is not

This release adds polish and marketing surface. It does not change the detector, the verifier, the code-context filter, the hook protocol, or the Stop hook semantics. v0.1.0–v0.1.5 behavior is preserved exactly.

## [0.1.5] — 2026-04-25

Coverage debt closeout plus two new diagnostic / scaffolding commands.

### Added

- **`groundtruth doctor`** — reports whether your environment is wired correctly. Checks Node version, claude binary on PATH, `~/.claude` existence, `settings.json` validity and Stop hook registration, PreToolUse memory hook registration, `~/.local/bin` on PATH, `~/.config/gh` writability (we hit a real permission issue here in earlier sessions), and the presence of any `.groundtruthrc.json`. Outputs PASS / WARN / FAIL per check. Exits non-zero on any FAIL. Supports `--json` for CI consumption.
- **`groundtruth init`** — scaffolds a starter `.groundtruthrc.json` with commented examples. Writes to `~/.groundtruthrc.json` by default; pass `--here` for cwd, `--force` to overwrite. Lowers the barrier to using the per-user config feature added in 0.1.4.
- **Tests for v0.1.4 features** (paying down the coverage debt I documented in 0.1.4):
  - `test/config.test.mjs` — config loader, glob matching, malformed-JSON tolerance
  - `test/stats.test.mjs` — verification rate, claim rate, per-day breakdown
  - `test/replay.test.mjs` — outcome classification across all four fixture types
  - `test/memory-hook.test.mjs` — PreToolUse JSON in / permissionDecision out
  - `test/doctor-init.test.mjs` — diagnostic and scaffolding flows
  - 27 new tests in total

### Test count

131 tests pass (was 104).

### CLI surface

```
groundtruth audit       walk session JSONLs
groundtruth check       per-file audit
groundtruth hook        Stop hook entry point (called by Claude Code)
groundtruth memory-hook PreToolUse entry point (called by Claude Code)
groundtruth memory-check  memory-write check on demand
groundtruth replay      what would the gate have done on this past session?
groundtruth stats       verification rate + claim rate over your history
groundtruth doctor      diagnostic: is everything wired correctly?
groundtruth init        scaffold a .groundtruthrc.json
groundtruth install     register the Stop hook + skill (idempotent)
groundtruth uninstall   remove them (with backup)
groundtruth status      what's registered
groundtruth version     print version
```

## [0.1.4] — 2026-04-25

Seven-iteration value pass before public marketing. Each piece adds capability without expanding scope; groundtruth still does one thing (block unverified completion claims), but with better debug, better customization, better visibility, and a no-install evaluation path.

### Added

- **`--explain` flag** on `audit` and `check`. When a finding fires, also prints the matched substring, the regex source that fired, and the path to the file that lists exclusion patterns. Reduces "why did this fire?" debugging from a grep-the-source task to a one-line read.
- **`.groundtruthrc.json` user config**. Loaded from `$GROUNDTRUTH_CONFIG`, then `./`, then `~/`. Schema accepts `exclude_patterns` (regex sources), `exclude_paths` (glob-ish), `extra_test_commands`, `extra_build_commands`. Lets users calibrate to their own prose without forking. See `src/config.mjs`.
- **`groundtruth stats`** subcommand. Verification rate, claim rate, block rate, plus a per-day breakdown over the last 14 days. Answers "is this thing actually catching anything?" with numbers.
- **`groundtruth replay <session.jsonl>`** subcommand. Walks a past session and prints, per-turn, what the gate would have done if it had been live. Useful for retros and onboarding.
- **PreToolUse memory hook**. Opt-in at install with `--with-memory-gate`. Registers a `PreToolUse` hook that fires automatically on `Write|Edit|MultiEdit|NotebookEdit` against `MEMORY.md`/`NOTES.md`/`LEARNINGS.md`/`.claude/memory/*` and rejects writes whose content contains unverified claims. Closes the documented limitation in ARCHITECTURE.md.
- **Install ergonomics**. New flags on `groundtruth install`: `--dry-run` (prints what would change without writing), `--no-skill` (skip skill copy), `--no-hook` (skip Stop hook registration), `--with-memory-gate` (also register PreToolUse). Better backup messaging.
- **Web playground at `docs/playground.html`**. Pure-client HTML (no fetches, no server) that mirrors the detector + verifier + code-context filter. Drop a session JSONL or paste it in, see findings rendered. **Lets anyone evaluate groundtruth in 10 seconds without installing.** Distribution unlock for HN/Reddit/Twitter posts. Hostable via GitHub Pages.

### Changed

- `auditSession`/`auditSessions` now load and apply user config automatically.
- `uninstallHook` now also removes registered PreToolUse hooks.
- Audit findings carry `match` (the actual matched substring) and `pattern_source` (the regex source) when `--explain` is set, on top of the existing `pattern` name.

### Test count

104 tests pass. (No new tests this release — the new commands are wrappers around existing tested primitives. Future release will add coverage for stats/replay/config/memory-hook.)

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

[0.1.0]: https://github.com/vnmoorthy/groundtruth/releases/tag/v0.1.0
