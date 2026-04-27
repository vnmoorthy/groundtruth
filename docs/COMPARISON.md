# Comparison with similar tools

Plain answer to the question I get most often: how is groundtruth different from gstack, superpowers, decider/claude-hooks, or claude-flow?

The short answer is that those tools solve adjacent problems and groundtruth composes underneath them. The longer answer is in the worked examples below. Each example shows the same buggy session and what each tool does (or doesn't do) about it.

## The shared example

A user asks Claude Code: *"Add a retry to the API call in `src/client.mjs`."*

The agent responds across three turns:

| turn | what the agent does | what the agent says at the end |
| --- | --- | --- |
| 1 | reads `src/client.mjs` | "I'll add a retry. One sec." |
| 2 | edits `src/client.mjs` to add the retry | "Implemented the retry. Done." |
| 3 | (user prompts further) | — |

Critically: **the agent never ran the test that exercises the retry.** The "Done." in turn 2 is unverified. This is the exact pattern groundtruth exists to catch, and it happens dozens of times a week in real Claude Code sessions.

Now compare what each tool does at the boundary between turn 2 and turn 3.

## groundtruth (this project)

**At Stop after turn 2:** the hook reads the last assistant message ("Implemented the retry. Done.") and the tool observations from the same turn (one `Edit` call to `src/client.mjs`). Sees a completion claim, sees no verification artifact (no test run, no curl, no grep against the new symbol). Returns:

```json
{"decision":"block","reason":"groundtruth: your response asserts work is complete but this turn contains no verification evidence. Unverified claim(s): \"Implemented the retry. Done.\" (trigger: implemented). Before you end your turn, produce one of: ..."}
```

The agent is forced into turn 3, where the hook's reason is fed back to the model. Most of the time, the agent then runs the test and the next turn ends with verification. About 15% of the time (in the audits I've measured), the agent realizes it can't verify and emits the prescribed retraction template instead. Either way, the session does not end on an unverified claim.

**Strengths:** narrow, fires every turn, calibrated against 1,272 real turns, audit CLI for retroactive review.
**Limits:** doesn't enforce a workflow, doesn't generate code, doesn't do PR shaping.

## gstack `/ship`

[gstack](https://github.com/garrytan/gstack) is Garry Tan's opinionated Claude Code skill pack. `/ship` turns a task into verifiable goals with test-first execution, then squash-merges WIP commits.

**At Stop after turn 2:** nothing happens. `/ship` is a slash command the user invokes; it doesn't fire automatically. The agent's "Done." passes through unchallenged unless the user happens to type `/ship` next.

**At /ship time** (whenever the user invokes it): gstack's flow does require tests, and if the user runs `/ship` the workflow will catch the missing test. But if the user types something else, the unverified claim is now part of the session history and the agent has been told (by the lack of pushback) that it was acceptable.

**Strengths:** structured workflow, PR hygiene, role-based system prompts.
**Limits:** only fires at `/ship` time. Mid-session claims pass through.

**Composition with groundtruth:** install both. groundtruth blocks the unverified "Done." mid-session; `/ship` then has a clean slate to work with at end-of-task.

## obra/superpowers

[superpowers](https://github.com/obra/superpowers) is Jesse Vincent's methodology framework. The TDD skill steers the agent toward writing the test first, then the code, in a deliberate order.

**At Stop after turn 2:** nothing happens at the protocol level. superpowers is steering the agent's behavior via prompt, not enforcing it via hooks. If the agent follows the steer correctly, it would have written the test in a prior turn already and the verification would naturally land. If the agent does NOT follow the steer (which happens — methodology drift is real on long sessions), turn 2's "Done." passes.

**Strengths:** comprehensive methodology, micro-task planning, brainstorming, Socratic shaping. Improves the *shape* of agent thinking, not just the verifiability of individual claims.
**Limits:** prompt-level enforcement degrades on long sessions or with adversarial prompting.

**Composition with groundtruth:** install both. superpowers shapes the agent's intent; groundtruth catches the cases where the shape didn't take.

## decider/claude-hooks

[claude-hooks](https://github.com/decider/claude-hooks) is a comprehensive hook collection — clean code rules, format-on-save, secret scanning, prevent-bypass guards.

**At Stop after turn 2:** depends on which hooks are installed. The default set doesn't have a completion-claim detector. If the user has wired up specific test-required hooks for specific files, those might fire. Most installations don't.

**Strengths:** broad guardrails. Covers things groundtruth doesn't (secret leaks, formatting drift, dangerous bash commands).
**Limits:** doesn't specifically address completion claims. Different problem space.

**Composition:** they don't conflict. claude-hooks adds many hooks; groundtruth adds one specific hook on top. Both can coexist in `~/.claude/settings.json`.

## ruvnet/claude-flow

[claude-flow](https://github.com/ruvnet/claude-flow) is an orchestration layer. It runs multiple Claude agents in coordinated patterns (planner → coder → reviewer → tester roles).

**At Stop after turn 2:** depends on which role-prompt is active. If the "tester" agent is active, it would normally run tests. If the "coder" is active, it might not. Stop hooks aren't claude-flow's concern; orchestration is.

**Strengths:** multi-agent workflows, coordination, role separation.
**Limits:** different problem space. Doesn't address per-turn claim verification.

**Composition:** install both. groundtruth fires at every Stop regardless of which role-agent is currently driving.

## disler/claude-code-hooks-mastery

[claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) is an educational reference repo demonstrating how to write hooks. It includes example hooks for various lifecycle events.

**At Stop after turn 2:** the example hooks in that repo are demonstrations, not enforcements. They show the protocol; they don't ship a calibrated detector.

**Strengths:** great learning resource. Best place to see worked hook examples.
**Limits:** demos, not a maintained tool.

**Composition:** read the repo to understand hooks, then install groundtruth for the specific completion-claim case.

## Summary table

| Tool | Mid-session claim block? | Audit past sessions? | Focus |
| --- | --- | --- | --- |
| **groundtruth** | yes, every Stop | yes, CLI + SARIF | completion-claim verification |
| gstack `/ship` | only at /ship time | no | end-of-task workflow |
| superpowers | by steering, not enforcement | no | TDD + methodology |
| decider/claude-hooks | partial (general guardrails) | no | broad guardrails |
| claude-flow | no (orchestration concern) | no | multi-agent loops |
| disler/claude-code-hooks-mastery | demo-level | no | educational |

## When NOT to use groundtruth

- You don't use Claude Code (it's specifically a Claude Code tool).
- Your sessions are pure non-code (planning, research, writing). The code-context filter will suppress most claims here, so groundtruth will do nothing visible. That's fine but the value is zero.
- You actively want the agent to be able to claim completion freely without verification (e.g. casual exploratory chat). Then leave it uninstalled.

For everyone else doing real coding sessions, groundtruth is a single-purpose primitive that composes with whatever else you already have.
