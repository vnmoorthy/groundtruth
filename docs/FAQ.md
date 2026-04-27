# FAQ

## Q: Will groundtruth slow down my Claude Code sessions?

No. The Stop hook runs once per assistant turn and reads the last turn's text plus the tool observations. On a 1,000-turn session that's been audited cold, the work takes about 27 milliseconds. The hook itself runs even faster because it processes only one turn.

If you ever want to measure on your own machine: `groundtruth bench`.

## Q: It flagged something that obviously isn't a code claim. What do I do?

That's a false positive. Three options, in order of effort:

1. **Add a regex to your `.groundtruthrc.json`** under `exclude_patterns`. This is per-user and survives upgrades. `groundtruth init` scaffolds a starter file. Patterns are case-insensitive regex sources. Example:

   ```json
   {
     "exclude_patterns": [
       "the team is ready for the demo",
       "podcast (?:episode|recording) is ready"
     ]
   }
   ```

2. **Capture it as a community fixture** with `groundtruth fixture add "the exact sentence that fired"`. This appends the line to `test/fixtures/community-false-positives.txt`, ensures the auto-generated test exercises it, and gives you a reproducible path to a PR if the pattern is general enough that everyone would benefit.

3. **Open an issue** with the minimum reproducing sentence and the pattern name from `--explain`. Maintainers will add a regex to `EXCLUSION_PATTERNS` in `src/detector.mjs` if it's broad enough.

## Q: It missed a claim I expected it to catch.

That's a missed positive. Less common than false positives because the detector is biased toward precision. Two paths:

1. **Use `groundtruth fixture add --positive "the sentence"`.** This captures it as a true-positive fixture. The auto-generated test will fail until the detector is updated to catch it, which gives you a reproducible regression.
2. **Open an issue** with the sentence and what tool calls (if any) were in the same turn. If the turn had no `Bash`/`Write`/`Edit`/`MultiEdit`/`NotebookEdit` and no triple-fenced code block, the code-context filter intentionally suppressed it because groundtruth's stated scope is code work. See the next question.

## Q: What is the "code-context filter" and why does it suppress my claim?

groundtruth's stated scope is code work. A turn that says "the manuscript is ready" with no other code signals isn't something the gate should fire on, even if "ready" is a triggering word.

A turn is treated as code context only if **at least one** of these is true:

- A tool call to `Bash`, `BashOutput`, or one of `Write`/`Edit`/`MultiEdit`/`NotebookEdit` against a code-extension path
- A `Read` or `Grep` against a code-extension path
- A triple-backtick fenced code block in the assistant text

Anything else (single backticks, file mentions in prose, programming jargon) doesn't count, on purpose. The filter was added in v0.1.2 after a 1,272-turn calibration audit found that academic prose was firing 30 times for zero true positives.

If you genuinely want to see every claim regardless of context, run `groundtruth audit --all`. The default is the calibrated view; `--all` is the unfiltered one.

## Q: I want to disable the gate temporarily. How?

Two ways.

- **Single session:** `claude --bare ...` starts a Claude Code session with hooks disabled. Once you exit, the gate is back.
- **Permanent uninstall:** `groundtruth uninstall` removes the Stop hook and the skill. `groundtruth install` puts it back.

There's no "snooze" option on purpose. If the gate is wrong often enough that you want to disable it, the right fix is `groundtruth fixture add` for the specific pattern, not turning the whole thing off.

## Q: What about the memory hook? Should I install it?

The memory hook (`PreToolUse` on `Write`/`Edit` against `MEMORY.md`/`NOTES.md`/`LEARNINGS.md`/`.claude/memory/*`) is opt-in. Enable with `groundtruth install --with-memory-gate`.

You probably want it if:

- You use Claude Code's memory feature actively and update memory files often
- You've ever caught the agent writing "fixed the bug" into MEMORY.md when no test was run
- You compose with gstack or superpowers and want their memory writes gated too

You probably don't want it if:

- Your memory files are personal scratch notes, and the precision tradeoff would slow you down
- You don't use memory files at all (it just won't fire)

It's a single CLI flag away in either direction.

## Q: Does this work with gstack? With superpowers? With claude-flow?

Yes to all three. groundtruth fires at every Stop hook, which is *before* any of those tools' workflow commands take over. By the time `/ship` or `/review` or a TDD pass runs, the gate has already enforced that intermediate turns produced verification.

The composition is documented in `examples/composition-with-gstack.md`. The short version: install groundtruth in addition to whatever workflow tools you already have. They don't conflict.

## Q: Why the dogfooding rule? Why does this repo's own CLAUDE.md activate groundtruth on itself?

Because if the gate doesn't work for the project that built it, it doesn't work for anything. Every commit on `main` has been produced under groundtruth's own rule: a claim of completion in the commit message must accompany a paste of `node --test` plus its passing output. PRs that change `src/`, `bin/`, `skills/`, or `hooks/` are required to include that paste.

If groundtruth ever ships a release where I claim something is done in the changelog without that evidence, please open an issue. That would be exactly the failure the project exists to prevent.

## Q: How do I see exactly what regex caught my finding?

`groundtruth audit ... --explain` (or `groundtruth check <file> --explain`). The output adds two lines per finding: the actual matched substring, and the regex source. Easier than grepping the source code.

## Q: How do I see every regex the detector knows about?

`groundtruth list-patterns` (added in v0.1.8). Prints all 8 claim frames, all 21 exclusion patterns, all 23 test runners, 9 type checkers, 10 build commands, 12 linters, and 4 http clients, plus the code-context rules. `--json` for machine consumers.

## Q: Is there a hosted dashboard?

No, on purpose. `groundtruth audit --json` and `groundtruth audit --sarif` are designed to feed any dashboard you want. SARIF is consumed by GitHub's code-scanning UI for free. JSON is whatever you want. Hosting a dashboard would mean operating an account system, which is a different project.

## Q: How do I uninstall completely?

```bash
groundtruth uninstall   # removes hook + skill from ~/.claude
rm -rf ~/.groundtruth   # removes the cloned repo
rm -rf ~/.local/bin/groundtruth   # removes the symlink (if installed via install.sh)
rm -rf ~/.groundtruthrc.json   # removes user config (only if you don't want to keep it)
```

There's no telemetry, no cloud component, no leftover state.

## Q: Does Claude Code's hook protocol have a chance of changing in a way that breaks this?

Yes, eventually. The protocol is unstable in the literal sense: Anthropic ships changes. v0.1.x of groundtruth is verified against `claude-code@2.1.119` (extracted directly from the binary; see `docs/findings.md`). When the protocol changes, the hook entry in `src/hook-entry.mjs` is the only file that needs updating.

If you see the gate stop firing after a Claude Code upgrade, run `groundtruth doctor` and open an issue. Fix is usually a few lines.
