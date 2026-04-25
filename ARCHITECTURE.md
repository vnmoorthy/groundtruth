# ARCHITECTURE

This document is an honest description of what groundtruth enforces, what it does not enforce, and why.

## Hard facts, verified

Every claim in this section was read out of the Claude Code v2.1.119 binary during the session that built this repo. See `docs/findings.md` for the extractions.

### The Stop hook exists and is blocking

Claude Code exposes nine hook events. The nine event names, pulled directly from the binary:

    PreToolUse, PostToolUse, UserPromptSubmit, Notification,
    Stop, SubagentStop, PreCompact, SessionStart, SessionEnd

The `Stop` event fires after each assistant response, before Claude Code returns control to the user. A command-type hook registered under `hooks.Stop` in `~/.claude/settings.json` receives a JSON payload on stdin and can respond by writing JSON to stdout.

### The payload shape

Stop hook stdin payload, constructed in the binary at `Jz(q,K,_)` plus a Stop-specific extension:

    {
      "session_id": "<uuid>",
      "transcript_path": "<absolute path to session JSONL>",
      "cwd": "<working directory>",
      "permission_mode": "<current mode>",
      "hook_event_name": "Stop",
      "stop_hook_active": boolean,
      "last_assistant_message": "<assistant text from the turn that just ended>"
    }

`stop_hook_active` is `true` when Claude Code is already in a forced continuation from a prior block. Hooks must check this flag and not block again in that state, or Claude Code will never reach a natural end.

### The response shape

Hook stdout JSON (all fields optional):

    {
      "continue": boolean,
      "suppressOutput": boolean,
      "stopReason": string,
      "decision": "approve" | "block",
      "reason": string,
      "systemMessage": string,
      "permissionDecision": "allow" | "deny" | "ask",
      "hookSpecificOutput": { ... }
    }

For a Stop hook the load-bearing fields are `decision: "block"` plus `reason`. Writing that object to stdout and exiting 0 tells Claude Code to reject the stop and issue the reason back to the model as instruction for the next turn.

### Exit codes

The binary documents a secondary path: exit code 2 is a blocking error, with stderr fed back. groundtruth uses the JSON-decision path because it can express a specific `reason` without mixing it with error output.

## What groundtruth enforces

1. **At Stop, every turn.** The hook reads `last_assistant_message` and the tool observations for the most recent assistant turn, then runs the detector and the verifier. If there is a claim and no verification, it blocks.

2. **On memory writes, on demand.** `groundtruth memory-check` inspects a proposed memory file write. If the content contains a completion claim, the check loads the session transcript and looks for verification in the last N assistant turns. Without matching verification, the check rejects the write. This is a command, not yet a registered hook; wiring it as a `PreToolUse` on `Write|Edit` matching memory filenames is a two-line change in `src/install.mjs` that we leave as a flag to keep the default install small.

3. **Retroactively, via audit.** `groundtruth audit` walks session JSONL files and flags every unverified claim with file, line range, and timestamp. This catches history the Stop hook could not have seen, including sessions from before install.

## What groundtruth does not enforce

1. **Mid-turn claims.** If the agent writes "implemented" in the middle of a response and keeps generating, the Stop hook only sees the full response at the end. In practice the detector catches the claim at that point. But if the agent structures the response so the claim appears only in a now-discarded intermediate state, the hook will not see it. This is a narrow gap.

2. **Phrasings outside the detector's frames.** The detector is syntactic and finite. A novel phrasing that evades every regex will pass. The mitigation is the test corpus in `test/detector.test.mjs`: every caught regression adds a fixture.

3. **Verification quality.** The verifier recognizes common test runners by command substring. A test that exits 0 but runs no assertions (a stub) counts as verified. A test that exits 0 because it silently swallowed an error counts as verified. This is a limit of the "in the same turn" heuristic. A deeper gate would parse test output against previously-failing tests, which is out of scope for v0.1.

4. **Adversarial agents.** If the agent intentionally wants to lie, it can structure its response to emit fake success signals the verifier believes. groundtruth is designed for cooperating agents who occasionally round up, not for an agent trying to defeat the gate.

5. **Non-Claude-Code clients.** The Stop hook only works inside Claude Code. Usage through the SDK directly, through an API proxy, or through any other client that does not fire Stop hooks is unguarded. The audit CLI still works against any session JSONL that follows the Claude Code format.

## Design choices and tradeoffs

### Precision over recall for the detector

The detector's regex library is written to minimize false positives at the cost of occasionally missing a novel phrasing. Rationale: one false positive in a long session destroys user trust and leads to the gate being disabled. A missed claim is recoverable via review and audit. The test corpus enforces this asymmetry: false-positive fixtures are as numerous as positive ones.

### Same-turn verification only

The gate's bar is "verification in the same turn as the claim," not "verification somewhere in the session." Rationale: a claim made now about work done earlier in the session has a much weaker grounding. If the agent ran the test five minutes ago and has edited code since, the stale test run is not evidence for the current claim. Forcing verification in the same turn ensures the evidence is current.

The audit CLI uses the same rule: if a turn has a claim and no verification in that turn, it is flagged, even if an adjacent turn has the verification. The memory-check is the one place we relax this, by looking back a configurable number of turns (default 5), because a memory write is inherently a summary artifact.

### No new runtime dependencies

Every file in `src/` and `bin/` is plain ESM JavaScript, usable by any Node 18+ install. There is no TypeScript compile step, no bundler, no package lockfile required for end users. Rationale: the install flow needs to be bulletproof. Adding a dependency with a postinstall step or a transitive CVE story is exactly the kind of drag that kills installers.

### JSON decision over exit code

We use `{"decision":"block","reason":"..."}` to stdout instead of exit code 2 to stderr. Both are valid per the binary. The JSON path preserves a clean separation between the reason the gate fired (which should go to the model as a coherent instruction) and any diagnostic noise (which belongs on stderr).

### Idempotent install, backup on write

`install` and `uninstall` both back up `~/.claude/settings.json` to a timestamped file before modifying it. Install is idempotent: running it a second time detects the existing entry and skips it. Rationale: settings.json is user-owned and often hand-edited. Touching it without leaving an undo trail would make the tool unsafe to use.

## Threat model

**In scope:**

- A cooperating agent that occasionally rounds up or forgets to verify.
- A long session where the verification rule fell out of attention budget.
- A user who wants an audit trail of past sessions to see what got past them.
- A CI system that wants to fail a PR if the authoring session had unverified claims (via `--sarif`).

**Out of scope:**

- An adversary with write access to the user's machine. Such an adversary can trivially disable the hook by editing settings.json.
- An adversary who controls the model output and wants to defeat the detector. See the "novel phrasing" limitation.
- A model that crashes or hangs mid-turn, leaving tool observations incomplete. The hook falls back to `last_assistant_message` in that case, which is less reliable.

## File map

    bin/
      groundtruth.mjs        CLI entry point
    src/
      detector.mjs           Syntactic claim detection, regex frames + exclusions
      verifier.mjs           Tool-observation classification against known test/build/lint/http shapes
      session.mjs            JSONL parser with line-number preservation
      check.mjs              Per-turn check combining detector + verifier
      hook-entry.mjs         Stop hook protocol: stdin JSON in, decision JSON out
      audit.mjs              Session walker, finding aggregation, text/JSON/SARIF renderers
      memory-gate.mjs        Memory file write check, transcript lookback
      install.mjs            Register/unregister the Stop hook, copy the skill
    hooks/
      (reserved for future additional hooks)
    skills/
      groundtruth/
        SKILL.md             The skill presented to Claude Code's skill loader
    test/
      fixtures/              Session JSONL fixtures, both positive and negative
      *.test.mjs             Node --test test files
    docs/
      findings.md            Phase 0 Claude Code binary extraction, citations
    examples/
      composition-with-gstack.md
    install.sh               Single-paste installer
    README.md
    ARCHITECTURE.md
    CHANGELOG.md
    LICENSE
    CLAUDE.md                Activates groundtruth on this repo (dogfooding)
    package.json

## Versioning

Semantic versioning. The hook protocol between groundtruth and Claude Code is the only external API surface that should be considered stable across minor versions. The detector's pattern list may shift between minor versions; if you depend on a specific false-positive rate for your workflow, pin a version.
