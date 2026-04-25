# Changelog

All notable changes to this project are recorded here.
Format follows [keepachangelog.com](https://keepachangelog.com/en/1.1.0/).
Versioning follows [semver.org](https://semver.org).

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
