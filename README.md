# groundtruth

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![tests](https://img.shields.io/badge/tests-104%20passing-brightgreen)](test/)
[![node](https://img.shields.io/badge/node-%E2%89%A518-43853d)](https://nodejs.org)
[![claude code](https://img.shields.io/badge/claude%20code-v2.1.119%20verified-7c3aed)](docs/findings.md)

> A completion-claim gate for Claude Code. Refuses to let the agent say "done" without evidence.

```bash
curl -fsSL https://raw.githubusercontent.com/vnmoorthy/groundtruth/main/install.sh | bash
```

That command clones the repo to `~/.groundtruth`, copies the skill into `~/.claude/skills/groundtruth/`, registers a Stop hook in `~/.claude/settings.json`, and symlinks the `groundtruth` CLI to `~/.local/bin`. It takes about a second after `git clone` finishes. Node 18 or newer is the only prerequisite. No new dependencies installed in your project.

## What it does

After install, any Claude Code session in any repo goes through a gate. When the agent tries to end a turn, a Stop hook reads the turn and asks one question:

> Did the agent claim the work was done? If yes, is there verification in the same turn?

A claim is a statement like "I've implemented the retry logic" or "All tests pass" or just "Done." Verification is a passing test command, a successful type check, a successful build, a curl with a 2xx, or a grep showing the symbol the agent claimed to write actually exists.

If the turn contains a claim but no verification, the hook returns `{"decision":"block","reason":"..."}` and Claude Code forces another turn. The agent sees the reason and must either produce evidence or retract the claim. If it retracts using the prescribed phrasing — "I attempted X. I have not verified it. To verify I would need to Y" — the next turn is allowed.

If the turn has no claim, or has both a claim and evidence, the hook is silent and the turn ends normally.

## Live demonstration

A minimal probe of the gate, recorded against `claude -p` on April 24, 2026 with `claude-code@2.1.87`:

**Prompt:** *Create a file called hello.txt in this directory and end your turn with the words 'Done.'*

**Turn 1 (assistant):** *"Please approve the file write request so I can create `hello.txt`. Done."*

**Stop hook fires.** groundtruth sees a `Done.` claim, no successful verification artifact in the same turn (the Write tool call was permission-blocked), and a Bash tool attempt that satisfies the code-context filter. Returns `{"decision":"block","reason":"..."}`.

**Turn 2 (assistant, forced):** *"I attempted to create `hello.txt` with the content `hello`. I have not verified it — all write attempts were blocked. To verify I would need write permissions to be granted so the file can actually be created, then confirmed with a Read or `cat` of the file."*

The agent did not generate that retraction phrasing on its own. The Stop hook forced a second turn with the gate's reason as input, and the model produced a turn that satisfied the rule. End of session ended on a non-claim instead of an unverified "Done." That is the load-bearing user path the project exists to enforce.

## Why this matters

Coding agents regularly assert completion on work they have not verified. The pattern is documented enough that it has its own community language ("Claude lies"), its own academic literature (arXiv 2503.12374, 2406.19228), and a half-dozen partial solutions in the Claude Code plugin ecosystem (`decider/claude-hooks`, `disler/claude-code-hooks-mastery`, `claude-flow`, gstack's `/ship`, superpowers' TDD skill). The Reddit consensus by April 2026 had converged on one operational rule: the agent cannot claim completion until it has shown verification evidence.

groundtruth turns that rule into a gate instead of a suggestion. It does not generate code, plan tasks, or review PRs. It sits below every other workflow skill and makes one thing impossible: ending a turn that says "done" without evidence in the same turn.

## Empirical calibration

The detector was tuned against a real corpus of 1,272 assistant turns across 50 sessions from one user's `~/.claude/projects/`. Successive releases:

| version | findings on the same 1,272 turns | precision against hand-judged ground truth |
|---|---|---|
| 0.1.0 (naive)            | 30  | low — most were academic prose ("the paper is ready") |
| 0.1.2 (code-context filter) | 5  | better, but academic sessions with `python` fenced blocks still slipped through |
| 0.1.3 (academic-subject exclusions) | 0–1 | the remaining survivor is the only ambiguous phrasing |

The same release suite catches every fixture that should fire (`unverified-claim` → 3 findings, `terse-closer` → 1 finding, `checklist` → 2 findings, `verified-claim` → 0 findings). Tuning happened against your data, not against a benchmark, which is the only kind of tuning that translates to real use.

## How the gate is enforced

Claude Code exposes a `Stop` hook that fires after every assistant response. The hook receives a JSON payload on stdin with the session ID, the transcript path, the current working directory, a `stop_hook_active` flag, and `last_assistant_message`. The hook can output `{"decision":"block","reason":"..."}` to prevent the stop and force another turn. groundtruth registers itself as that hook.

The hook:

1. Reads the transcript from `transcript_path`.
2. Walks the last assistant turn.
3. Runs the detector on the assistant text (see `src/detector.mjs`).
4. Runs the verifier on the tool observations from the same turn (see `src/verifier.mjs`).
5. If there is a claim and no verification, blocks with a specific reason that names the claim and suggests what to run.
6. Checks `stop_hook_active` first: if true, allows through. This prevents infinite loops if our detection misfires.

The schemas above were verified directly from the Claude Code v2.1.119 binary, not from documentation. See `docs/findings.md` for the extraction.

## What counts as a claim

The detector uses syntactic frames, not a word list, to minimize false positives. These phrasings trigger:

- First person perfect: "I've implemented X", "I have fixed Y"
- Subject is complete: "the bug is fixed", "the feature is ready", "everything is working"
- Successfully past-tense: "successfully migrated the schema"
- Deverbal assertion: "the fix is complete", "the migration is done"
- Terse closer at paragraph start: "Done.", "Fixed.", "All set."
- Checklist past-tense items: "- [x] Implemented the new schema"
- Tests pass: "all tests pass", "the tests passing"
- Second-person done: "you're all set", "you are ready"

These phrasings are intentionally ignored:

- "I'm working on it" (present progressive)
- "the existing code is working" (meta statement about prior state)
- "ready to continue" (ready-to-verb)
- "working as expected" (adjectival qualifier)
- "working example" (adjective plus noun)
- "if it works" (conditional)
- "previously fixed" (meta statement about history)
- "almost done" (hedged)
- Anything inside a fenced code block

The full rule set is in `src/detector.mjs` and test cases covering both sides are in `test/detector.test.mjs`.

## What counts as verification

The verifier looks for tool observations in the same turn that match a known shape:

- Bash with a test command: `node --test`, `bun test`, `npm test`, `pytest`, `cargo test`, `go test`, `jest`, `vitest`, `mocha`, `rspec`, `phpunit`, and a few others
- Bash with a type check: `tsc --noEmit`, `mypy`, `pyright`, `flow check`
- Bash with a build: `npm run build`, `cargo build`, `go build`, `make`
- Bash with a lint: `eslint`, `ruff check`, `clippy`, `golangci-lint`, `biome check`
- Bash with `curl` where the output contains an `HTTP/... 2xx` line
- A `Grep` whose results include a file the agent wrote or edited in this turn
- A `Read` of a file the agent wrote or edited in this turn

In every case the output is checked for success signals (pass counts, "ok", "exit code 0", "Build succeeded") and failure signals (FAIL, AssertionError, "N failing", "exit code" non-zero). A failure signal vetoes any success signal. This keeps the verification bar honest: a test that partially passed and partially failed does not clear the gate.

## The audit CLI

`groundtruth audit` scans Claude Code session files and flags every unverified completion claim with file and line locations. Point it at a directory, a file, or let it default to the most recent sessions under `~/.claude/projects`.

```
$ groundtruth audit
groundtruth audit

files scanned: 12
assistant turns inspected: 248
verified completion claims: 41
unverified completion claims: 7

~/.claude/projects/my-app/f3e8d2.jsonl
  turn 12 lines 47-63 at 2026-04-24T14:32:15.000Z [pattern: first-person-perfect]
    claim: "I've implemented the user authentication flow"
    trigger: implemented
  turn 18 lines 71-71 at 2026-04-24T14:58:47.000Z [pattern: terse-closer]
    claim: "Fixed."
    trigger: Fixed
```

Flags:

- `--json` emit machine-readable JSON
- `--sarif` emit SARIF 2.1.0 for GitHub code scanning and other CI tools
- `--limit N` scan at most N session files (default 20)
- `--fail-on N` only exit non-zero when at least N findings are present

## The memory gate

Rule 3 of the groundtruth design: you do not write to a persistent memory file (`MEMORY.md`, `NOTES.md`, `LEARNINGS.md`, `.claude/memory/*`) unless the fact being recorded was verified in the current session. `groundtruth memory-check <path>` inspects a proposed memory write. If it contains a completion claim, the check reads the session transcript and looks for matching verification in the recent turns. If there is none, the write is rejected.

```
$ groundtruth memory-check MEMORY.md --transcript ~/.claude/projects/x/y.jsonl
```

You can wire this to a PreToolUse hook on `Write|Edit` targeting memory filenames if you want it enforced, or run it manually.

## Composition

groundtruth does not replace [gstack](https://github.com/garrytan/gstack) or [superpowers](https://github.com/obra/superpowers). It sits below them:

- gstack's `/ship` and `/review` run when the user explicitly invokes a slash command. groundtruth runs at every Stop.
- superpowers steers the agent toward TDD. groundtruth catches the cases where that steer did not take.

`groundtruth status` detects gstack and superpowers and prints their presence. See `examples/composition-with-gstack.md` for the full ordering and a worked example.

## Install, status, uninstall

```
groundtruth install       register the Stop hook and copy the skill
groundtruth uninstall     remove the Stop hook and the skill (backups first)
groundtruth status        print what is registered and what is not
```

`install` is idempotent. `uninstall` backs up `~/.claude/settings.json` to a timestamped file before touching it. The installer never deletes arbitrary state; it only removes entries whose command line contains `groundtruth ... hook`.

## Zero runtime dependencies

The CLI, the hook, and the detector are plain `.mjs` files. Nothing to install beyond Node 18+ (which Claude Code already requires). No build step. No transpiler. No package manager at install time. You can read every line of the code without a lockfile or a dist bundle.

## What the gate cannot catch

Be honest about the failure modes:

- The gate only fires at Stop. If the agent makes a claim mid-turn and never ends the turn, the hook never runs. In practice Claude Code always hits Stop between user prompts, so this is a narrow gap.
- The detector is syntactic. A cleverly phrased claim that evades the regexes will pass. The claim corpus in `test/detector.test.mjs` is the regression suite; contributions that add a pattern should add a fixture too.
- The verifier is heuristic. It recognizes common test runners and build tools, but a bespoke verification script that does not match one of the fragments in `src/verifier.mjs` will not count. The remedy is to add the fragment and ship a test for it.
- If `stop_hook_active` is true, the gate allows through to prevent loops. A pathological adversary could try to force this state by racing blocks. Not worth designing around for a cooperating agent.

See `ARCHITECTURE.md` for the full threat model.

## Contributing

Every change to this repo is subject to its own gate. The agent or human producing a commit must show verification: a passing `node --test 'test/*.test.mjs'` run in the commit message or PR description. This is not a policy statement; it is dogfooded. The repo's `CLAUDE.md` activates groundtruth on itself.

Bug reports for missed claims or false positives should include the minimal session JSONL that reproduces the miss or false positive. Add it as a fixture under `test/fixtures/` and a corresponding test, then submit the PR.

## License

MIT. See `LICENSE`.

---

### References

- arXiv 2503.12374 Beyond Final Code: A Process-Oriented Error Analysis of Software Development Agents in Real-World GitHub Scenarios (2026).
- arXiv 2406.19228 Tools Fail: Detecting Silent Errors in Faulty Tools (2024).
- Claude Code v2.1.119 binary, `@anthropic-ai/claude-code` on npm; hook schema extracted directly in `docs/findings.md`.
