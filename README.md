<div align="center">

# groundtruth

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![tests](https://img.shields.io/badge/tests-135%20passing-brightgreen)](test/)
[![audit](https://img.shields.io/badge/audit-1k%20turns%20%2F%2027ms-3fb950)](test/perf.test.mjs)
[![node](https://img.shields.io/badge/node-%E2%89%A518-43853d)](https://nodejs.org)
[![claude code](https://img.shields.io/badge/claude%20code-v2.1.119%20verified-7c3aed)](docs/findings.md)
[![status](https://img.shields.io/badge/status-v0.1.10-orange)](CHANGELOG.md)
[![playground](https://img.shields.io/badge/try%20it-no%20install-7c3aed)](https://vnmoorthy.github.io/groundtruth/playground.html)

**Stop letting Claude Code say "done" without evidence.**

A Stop hook for Claude Code that physically refuses to let the agent end a turn on a completion claim unless the same turn contains verification. One paste to install, zero new dependencies, MIT.

```bash
curl -fsSL https://raw.githubusercontent.com/vnmoorthy/groundtruth/main/install.sh | bash
```

**Don't want to install yet?** [**Try the web playground**](https://vnmoorthy.github.io/groundtruth/playground.html) — drop a Claude Code session JSONL in your browser, see findings instantly, no install required.

</div>

---

## A 30-second probe of the gate, in vivo

I ran `claude -p` against this prompt:

> *Create a file called `hello.txt` in this directory and end your turn with the word 'Done.'*

**Turn 1, the agent:** &nbsp;`"Please approve the file write request so I can create hello.txt. Done."`

**The Stop hook fires.** It sees a `Done.` claim, observes that none of the agent's tool calls produced a successful verification artifact, and returns `{"decision":"block","reason":"..."}`.

**Turn 2, the agent (forced by the block):**
> *"I attempted to create `hello.txt` with the content `hello`. I have not verified it — all write attempts were blocked. To verify I would need write permissions to be granted so the file can actually be created, then confirmed with a Read or `cat` of the file."*

The agent did not generate that retraction template on its own. The hook fed the gate's `reason` back to the model and the model produced a turn that satisfied the rule. **Without groundtruth, the session ends on the first "Done." With groundtruth, it ends on a retraction.** That is the load-bearing user path this project exists to enforce.

## What it does, in one diagram

```
                 ┌────────────────────────────────────────────────┐
                 │  Claude Code finishes a turn                   │
                 └─────────────────────┬──────────────────────────┘
                                       │
                                       ▼
                 ┌────────────────────────────────────────────────┐
                 │  Stop hook fires. groundtruth reads the turn:  │
                 │   • last assistant text                        │
                 │   • tool observations from the same turn       │
                 └─────────────────────┬──────────────────────────┘
                                       │
                          claim?  +  evidence?
                                       │
                ┌──────────────────────┴──────────────────────┐
                │                                             │
                ▼                                             ▼
       claim alone, no evidence                   no claim,  or  claim + evidence
                │                                             │
                ▼                                             ▼
   ┌──────────────────────────┐                   ┌─────────────────────┐
   │  {decision:block,reason} │                   │  silent. turn ends. │
   │  agent forced to retract │                   └─────────────────────┘
   │  or produce evidence     │
   └──────────────────────────┘
```

A **claim** is syntactic: phrasings like "I've implemented X", "the bug is fixed", "Done.", "all tests pass", checklist items with past-tense verbs. The detector has 8 frames and 21 exclusion patterns tuned against a real 1,272-turn corpus. Run `groundtruth list-patterns` to see every regex.

**Evidence** is a tool observation in the same turn that matches a known shape: a passing test command, a successful type check, a successful build, a curl with a 2xx, or a Read/Grep that confirms a written symbol exists. There are 80+ command fragments recognized.

## Compare to similar tools

groundtruth is narrow on purpose. It does one thing. Other tools in the Claude Code ecosystem solve adjacent problems and compose well with this one.

| Tool                                                                   | What it solves                              | Catches mid-session claims at every Stop? | Audits past sessions retroactively? | Calibrated against real session data? |
| ---------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- | ----------------------------------- | ------------------------------------- |
| **groundtruth** (this)                                                 | Completion-claim gate                       | **yes**                                   | **yes** (CLI + SARIF)               | **yes** (1,272 turns)                 |
| [`gstack /ship`](https://github.com/garrytan/gstack)                   | End-of-task workflow                        | only when `/ship` is invoked              | no                                  | n/a                                   |
| [`obra/superpowers`](https://github.com/obra/superpowers)              | TDD methodology pack                        | by steering, not by enforcement           | no                                  | n/a                                   |
| [`decider/claude-hooks`](https://github.com/decider/claude-hooks)      | Broad guardrail hooks                       | partial (general guardrails)              | no                                  | unknown                               |
| [`ruvnet/claude-flow`](https://github.com/ruvnet/claude-flow)          | Orchestration / agent loops                 | no (orchestration concern)                | no                                  | n/a                                   |
| [`disler/claude-code-hooks-mastery`](https://github.com/disler/claude-code-hooks-mastery) | Educational hooks reference | demo-level                              | no                                  | n/a                                   |

If you already use gstack or superpowers, install both. groundtruth fires at every Stop, before `/ship` or `/review` ever hand off, so the workflow tools start from a verified state.

## Empirical calibration

The detector was tuned against 1,272 assistant turns across 50 real Claude Code sessions from one user's `~/.claude/projects/`. Each release was driven by a re-audit of that same corpus.

| version | findings on the same 1,272 turns | what the false positives looked like                              |
| ------- | -------------------------------- | ----------------------------------------------------------------- |
| 0.1.0   | 30                               | mostly academic prose: "the paper is ready", "citations resolved" |
| 0.1.2   | 5                                | paper-writing turns that contained `python` fenced code blocks    |
| 0.1.3   | 0–1                              | one ambiguous "successfully added 20,000 more" phrasing           |

The release suite catches every fixture that should fire (`unverified-claim` → 3 findings, `terse-closer` → 1, `checklist` → 2, `verified-claim` → 0). Calibration happened against real data, not a benchmark, which is the only kind of tuning that translates to real use.

## Quick start

```bash
# install
curl -fsSL https://raw.githubusercontent.com/vnmoorthy/groundtruth/main/install.sh | bash

# verify it's wired in
groundtruth status

# audit your existing session history (no API spend)
groundtruth audit

# from this point on, any Claude Code session in any repo goes through the gate
```

## Status, install, uninstall

```text
groundtruth status        what's registered
groundtruth install       register the Stop hook and copy the skill (idempotent)
groundtruth uninstall     remove them (backs up settings.json first)
```

## Audit retroactively

`groundtruth audit` walks `~/.claude/projects/*/*.jsonl` and flags every unverified completion claim with file path and line range. Output formats:

```bash
groundtruth audit                        # human-readable text (default)
groundtruth audit --json                 # for piping to jq
groundtruth audit --sarif                # GitHub code scanning, GitLab, etc.
groundtruth audit --all                  # bypass the code-context filter
groundtruth audit --fail-on 1            # exit 1 if any finding (CI-friendly)
groundtruth audit --limit 50             # only the most recent N session files
```

## Memory gate

Per `CLAUDE.md`: writes to persistent memory files (`MEMORY.md`, `NOTES.md`, `LEARNINGS.md`, `.claude/memory/*`) require an in-session verification for any completion claim in the content.

```bash
groundtruth memory-check MEMORY.md --transcript ~/.claude/projects/x/y.jsonl
```

If the memory content claims completion and the recent assistant turns produced no matching verification, the check exits non-zero and rejects the write.

## Composition

groundtruth fires at the `Stop` hook, which means it runs after every assistant response, before any workflow command (gstack `/ship`, gstack `/review`, superpowers TDD skill, anything else) takes over. It does not replace those tools. See [`examples/composition-with-gstack.md`](examples/composition-with-gstack.md).

## How the gate is technically enforced

Claude Code v2.1.119 exposes nine hook events. `Stop` fires after every assistant response with this stdin payload (extracted directly from the binary, see [`docs/findings.md`](docs/findings.md)):

```json
{
  "session_id": "<uuid>",
  "transcript_path": "<absolute path to session JSONL>",
  "cwd": "<working directory>",
  "permission_mode": "<current mode>",
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "<assistant text from this turn>"
}
```

A hook can return `{"decision":"block","reason":"..."}` on stdout to force another turn. groundtruth reads the transcript, runs the detector + verifier on the most recent assistant turn, and emits the block payload when a claim has no evidence. It checks `stop_hook_active` first, so a single misfire never causes an infinite loop.

## What's in the box

```
src/
  detector.mjs       Syntactic claim frames + exclusion patterns
  verifier.mjs       Tool-observation classification (80+ runners)
  session.mjs        Claude Code session JSONL parser
  check.mjs          Per-turn check combining detector + verifier
  hook-entry.mjs     Stop hook protocol (stdin JSON in, decision JSON out)
  audit.mjs          Session walker + text/JSON/SARIF rendering
  memory-gate.mjs    MEMORY.md / NOTES.md write check
  install.mjs        Register / unregister the Stop hook
  code-context.mjs   "Is this a code turn?" filter
bin/
  groundtruth.mjs    Single CLI entry point
skills/
  groundtruth/SKILL.md   The skill presented to Claude Code
test/
  *.test.mjs + fixtures/  104 tests, all green
docs/findings.md     Hook surface extracted from the Claude Code binary
ARCHITECTURE.md      What the gate enforces, what it cannot, threat model
CHANGELOG.md         Per-release notes
```

## Honest limits

- **Mid-turn-only claims.** The hook fires at Stop, not during streaming. If the agent emits a claim mid-turn and never reaches Stop, the live gate misses it. The audit CLI catches it after the fact.
- **Detector is regex-based.** A novel phrasing that evades every frame slips through. Every caught regression should add a test fixture.
- **Verifier is heuristic.** A test that exits 0 but ran no real assertions counts as verified. Out of scope for v0.1.
- **Adversarial agents.** The gate is for cooperating agents that occasionally round up, not for an agent intentionally evading verification. See `ARCHITECTURE.md`.

## More documentation

- [**FAQ**](docs/FAQ.md) — answers to the most common questions, including how to handle false positives and the code-context filter.
- [**Comparison vs gstack / superpowers / decider-claude-hooks / claude-flow**](docs/COMPARISON.md) — the same buggy session, walked through what each tool does about it.
- [**Architecture**](ARCHITECTURE.md) — what the gate enforces, what it can't, threat model.
- [**Security**](SECURITY.md) — honest threat model. What the hook can and cannot do; what to read before installing.
- [**Roadmap**](ROADMAP.md) — what groundtruth might do later, what's out of scope on purpose, and the multi-angle review notes that drove those decisions.
- [**Hook surface findings**](docs/findings.md) — the Claude Code v2.1.119 hook protocol extracted directly from the binary.
- [**Sharing playbook**](docs/sharing-playbook.md) — Show HN, Twitter, awesome-claude-code, and other channels with paste-ready text.

## Contributing

PRs welcome, especially for:

- New verifier signals (test runners, build tools, frameworks I missed)
- False-positive fixes from your own audit results — `groundtruth fixture add "the sentence that fired"` captures it as a regression test in one command
- Composition examples with other Claude Code skills

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Every PR that changes `src/`, `bin/`, `skills/`, or `hooks/` must include a paste of `node --test` plus its passing output. The repo dogfoods itself.

## License

MIT. See [`LICENSE`](LICENSE).

---

<div align="center">

If groundtruth caught a real claim for you, ⭐ the repo and tell me about it in [issues](https://github.com/vnmoorthy/groundtruth/issues). The next round of detector calibration depends on real fixtures from real users.

</div>
