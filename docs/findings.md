# Phase 0 findings: Claude Code hook surface

Source: npm package `@anthropic-ai/claude-code-linux-arm64@2.1.119`, binary extracted and grepped directly on 2026-04-24. All facts below were read out of the shipped binary, not inferred.

## Hook event names

The binary exposes nine hook events:

    PreToolUse, PostToolUse, UserPromptSubmit, Notification,
    Stop, SubagentStop, PreCompact, SessionStart, SessionEnd

Confirmed by `strings claude | grep -E "^(...)$"` matching all nine as exact-line strings.

## Stop hook input schema

The binary builds the Stop hook payload in this literal expression (extracted verbatim):

    hook_event_name: "Stop",
    stop_hook_active: z,
    last_assistant_message: P,
    ...Jz(q)

Where `Jz(q, K, _)` returns the base fields common to every hook:

    {
      session_id,
      transcript_path,   // derived from session_id
      cwd,
      permission_mode,
      agent_id,          // optional
      ...
    }

So a Stop hook script receives on stdin:

    {
      "session_id": "<uuid>",
      "transcript_path": "<absolute path to the session JSONL>",
      "cwd": "<working directory>",
      "permission_mode": "...",
      "hook_event_name": "Stop",
      "stop_hook_active": false,
      "last_assistant_message": "<the assistant text from the turn that just ended>"
    }

`stop_hook_active` is `true` when Claude is already in a forced-continuation from a prior block. Hooks must check this to avoid infinite block loops.

## Hook output schema

The binary prints this schema verbatim for validation errors, so the field set is exhaustive:

    {
      continue: boolean (optional),
      suppressOutput: boolean (optional),
      stopReason: string (optional),
      decision: "approve" | "block" (optional),
      reason: string (optional),
      systemMessage: string (optional),
      permissionDecision: "allow" | "deny" | "ask" (optional),
      hookSpecificOutput: { ... }
    }

For a Stop hook, the load-bearing fields are `decision: "block"` plus `reason`. Writing that JSON to stdout tells Claude Code to reject the stop and force another turn, with `reason` fed back as instruction.

## Exit code semantics

A Stop hook that writes nothing and exits 0 lets Claude stop as normal. A hook that writes nothing and exits 2 is a blocking error: stderr is fed back to the model. From the binary:

    "If true, hook runs in background and wakes the model on exit code 2 (blocking error). Implies async."

Both the JSON-decision path and the exit-2 path work. The JSON path is preferred because it can send a precise `reason` string separately from error-style stderr.

## settings.json hook config format

The binary contains the canonical example inline:

    {
      "hooks": {
        "PostToolUse": [{
          "matcher": "Write|Edit",
          "hooks": [{
            "type": "command",
            "command": "..."
          }]
        }]
      }
    }

For Stop there is no tool to match against, so the config uses an empty matcher or omits it. Each hook spec also accepts `timeout` (seconds) and `statusMessage`.

## Session transcript format and location

Sessions are stored as JSONL at `~/.claude/projects/<project-hash>/<session-id>.jsonl`. Each line is a JSON object. From the binary:

    if (!O.includes('"type":"user"') && !O.includes('"type": "user"')) continue;
    if (O.includes('"tool_result"')) continue;
    if (O.includes('"isMeta":true') ...

So records include fields `type` (user or assistant), `tool_result` (present on tool result records), and `isMeta` (present on meta records that should be skipped). The binary uses grep-style string inclusion to filter, so the schema is tolerant of extra fields.

## What this means for groundtruth

1. The gate is real. Stop is a blocking hook. `decision: "block"` with a `reason` forces Claude to produce another turn that addresses the reason. This is not advisory.
2. The detector sees the last assistant turn directly via `last_assistant_message`, and the full session via `transcript_path`. No scraping needed.
3. We must check `stop_hook_active` and never block twice in a row, or Claude loops.
4. Install target is `~/.claude/settings.json` under `hooks.Stop`.
5. Skill install target is `~/.claude/skills/groundtruth/SKILL.md` (per the docs tab in the site config extracted from the same session).

## What is still unverified

- `~/.claude/skills/` as the user-scope skill directory: the binary contains the string but I did not extract the exact resolution order (global vs plugin vs project). Install script will write to `~/.claude/skills/groundtruth/` and the user can move it if their setup differs. Not load-bearing for the gate.
- Whether the Stop hook receives `last_assistant_message` for every response including ones with tool calls, or only terminal text. The binary expression unconditionally sets it. The detector reads it but falls back to parsing the transcript tail if the field is empty.
