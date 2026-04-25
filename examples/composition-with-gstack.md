# Composition with gstack

[gstack](https://github.com/garrytan/gstack) is an opinionated Claude Code skill pack that provides workflow commands including `/ship` (turns tasks into verifiable goals with test-first execution and squash-merges WIP commits) and `/review` (catches unnecessary complexity). Both target end-of-task moments.

groundtruth is narrower and lower in the stack. It does not replace gstack. It sits beneath gstack and fires at every turn, not only when the user runs `/ship`.

## How the two compose

gstack only runs when the user invokes a slash command. Between those moments, a Claude Code session can produce dozens of turns in which the agent claims partial completion. gstack never sees those turns. groundtruth does.

The order of operations:

    turn N:
      1. The agent generates a response.
      2. Claude Code fires the Stop hook.
      3. groundtruth reads the last turn + its tool observations.
      4. If the turn contains an unverified completion claim, groundtruth
         returns decision=block with a reason. Claude Code forces another
         turn in which the agent must produce evidence or retract.
      5. When the agent's response is clean, Stop is allowed.

    user then runs /ship (or /review):
      gstack's slash command takes over. By construction, every turn
      leading up to this point already passed the groundtruth gate, so
      gstack starts from a trusted state where the work is verified.

## What groundtruth adds

- Coverage at every turn, not only `/ship` time.
- Blocking via the Stop hook, so the agent physically cannot emit "done" without evidence.
- An audit CLI (`groundtruth audit`) that scans old session JSONL files and retrospectively flags unverified claims, including sessions that predate the install. gstack has no equivalent.

## What gstack adds over groundtruth

- Workflow shape: plan-review → implementation → review → ship.
- Squash-merge and PR hygiene at ship-time.
- CEO, Designer, Eng Manager role assignments that shape how the agent thinks about a task.

The two together give you: strict atomic verification at every response boundary (groundtruth) + structured workflow at task boundaries (gstack). Neither one subsumes the other.

## Install order

Either order works. `groundtruth install` registers itself in `~/.claude/settings.json` under `hooks.Stop`. gstack installs as a skill pack under `~/.claude/skills/`. They do not compete for the same config slot.

## Detecting gstack at runtime

`groundtruth status` reports whether gstack is present:

    $ groundtruth status
    ...
    composition:
      gstack:       detected
      superpowers:  not detected

If gstack is detected, groundtruth's install command adds a note that the Stop hook fires before `/ship` hands off, so the user knows the layering is intentional.

# Composition with superpowers

[superpowers](https://github.com/obra/superpowers) is a skills framework and methodology pack from Jesse Vincent that adds TDD, Socratic brainstorming, and micro-task planning to Claude Code sessions. Superpowers' TDD skill is the closest analogue to groundtruth: both want the agent to verify before claiming completion.

The difference: superpowers' TDD skill is an instruction to the agent ("write the test first, then the code"). groundtruth is a Stop-time gate that fires regardless of what workflow the agent is in. They compose:

- superpowers steers the agent toward verification-shaped work.
- groundtruth catches the cases where the agent does not follow that steer.

If you install both, groundtruth should fire last (at Stop), after the superpowers TDD skill has shaped the turn. There is no conflict: groundtruth only blocks when verification is absent, and a proper TDD turn contains verification.

---

Sources for the descriptions of gstack and superpowers above:

- [gstack on GitHub](https://github.com/garrytan/gstack)
- [gstack skills index](https://github.com/garrytan/gstack/blob/main/docs/skills.md)
- [superpowers on GitHub](https://github.com/obra/superpowers)
