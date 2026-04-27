# Contributing to groundtruth

Thanks for considering a contribution. This project has a single rule: every commit must be produced under the gate the project enforces.

## Where to ask

- **Open-ended questions, ideas, "is this the right pattern?"** → [GitHub Discussions](https://github.com/vnmoorthy/groundtruth/discussions). No template, no triage burden, low pressure.
- **Reproducible bug, false positive, missed claim** → [GitHub Issues](https://github.com/vnmoorthy/groundtruth/issues) with the matching template. The bug-report template asks for `groundtruth doctor --json` so we don't have to ping you for environment details.
- **PRs** → small, focused, with `node --test` output pasted in the description. See below.

groundtruth ships no telemetry, so we cannot infer adoption or pain points from the inside. Discussion threads, issue volume, and PR cadence are the only signal we have. If something is rough, say so out loud.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## The rule, applied to this repo

A PR description (or commit message) that says the work is complete must paste verification evidence in the same description. The canonical evidence for this repo is:

    $ node --test
    # tests <N>
    # pass <N>
    # fail 0

If your PR changes anything under `src/`, `bin/`, `skills/`, or `hooks/`, paste that output into the PR description. PRs that change those paths without it will be asked to add it.

## Bug reports

Two flavors get the most useful triage:

**False positive.** The detector fired on a sentence that was not actually a completion claim. File the issue with:

- The minimum sentence(s) that reproduce.
- Ideally a session JSONL fixture showing the surrounding context.
- The pattern name from the audit output (e.g. `subject-is-complete`).

The fix is usually a regex addition to `EXCLUSION_PATTERNS` in `src/detector.mjs` plus a test in `test/detector.test.mjs` and a fixture in `test/fixtures/false-positives.jsonl`. PRs welcome.

**Missed claim.** The detector failed to fire on a sentence that was clearly a completion claim. File with the same shape: minimum sentence, ideally a fixture, and what the agent actually did (or did not) verify in the same turn.

## Adding a verifier signal

If you use a build/test/lint tool that `src/verifier.mjs` does not recognize, add it. The pattern is:

1. Add the command fragment to the appropriate list (`TEST_COMMAND_FRAGMENTS`, `BUILD_COMMAND_FRAGMENTS`, etc.).
2. Add success/failure signal regexes if your tool's output uses an unusual format.
3. Add a test in `test/verifier.test.mjs` against a real sample of the tool's output.
4. Run `node --test`.

## Detector philosophy

The detector favors precision over recall. We accept missed claims to avoid false positives because false positives destroy user trust and lead to the gate being disabled. Every regex change should be paired with both a positive and a negative fixture.

## Style

Keep code small and readable. No new runtime dependencies (Node 18+ standard library only). Plain ESM (`.mjs`) files. JSDoc types are encouraged; TypeScript is not used so the install path stays one paste.

## Commit messages

Imperative mood, lowercase first word after the prefix. Examples:

    detector: suppress 'paper preparation' as academic subject
    verifier: recognize gradle test summary line
    install: handle missing global git identity in bootstrap.sh

## License

By contributing you agree that your contributions will be licensed under the MIT license.
