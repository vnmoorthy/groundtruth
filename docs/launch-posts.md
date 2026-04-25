# Launch posts

Drafts for the three places where the right reader for groundtruth is hanging out. Copy, edit to your voice, post under your account.

Order of posting matters. Reddit first (warmer audience, lower stakes), then HN (peak surface area but unforgiving), then the gstack/superpowers communities (the people who will actually try it).

---

## r/ClaudeAI

**Title:** *I built a Stop hook that catches Claude Code "Done." claims with no verification, then audited 1,272 of my own session turns*

**Body:**

The pattern is well-known: the agent says "Done." or "Implemented" or "Fixed" and ends the turn, but nothing was tested, nothing was built, no curl was run. By the time you find out it's wrong, it's three turns later.

I wrote a small Stop hook that checks every assistant turn before Claude Code lets it end. If the turn contains a completion claim and the same turn has no verification artifact (test pass, build success, curl 2xx, grep showing the symbol), the hook returns `{"decision":"block","reason":"..."}` and the model is forced to either produce evidence or retract.

A live probe: I asked Claude `-p` to create `hello.txt` and end its turn with "Done." Without groundtruth, it would have said "Done." and stopped. With groundtruth, it said "Done.", got blocked, and the next turn was: *"I attempted to create hello.txt. I have not verified it. To verify I would need write permissions to be granted, then confirmed with a Read or cat of the file."* The agent did not generate that retraction phrasing on its own. The hook fed the gate's reason back to the model and the model produced a turn that satisfied the rule.

I also wrote `groundtruth audit` which walks `~/.claude/projects/*/*.jsonl` and flags every unverified claim retroactively. I ran it on 1,272 turns from my own history. v0.1.0 produced 30 findings. After three rounds of "audit, calibrate, re-audit" against my real data, v0.1.3 produces 0–1. The detector is tuned on real session prose, not on fixtures I made up.

MIT, zero new dependencies, one paste to install:

    curl -fsSL https://raw.githubusercontent.com/vnmoorthy/groundtruth/main/install.sh | bash

Repo: https://github.com/vnmoorthy/groundtruth

If anyone wants to run `groundtruth audit` against their own `~/.claude/projects` and tell me what false positives or missed claims they see, that's the calibration loop I most want to feed.

---

## Hacker News (Show HN)

**Title:** *Show HN: Groundtruth – Stop hook that blocks Claude Code from saying "done" without evidence*

**Body:**

Hi HN. Small tool I built this week.

Claude Code agents regularly assert completion on work they haven't verified. The fix that's converged in the community is: require a test pass / build success / curl 2xx in the same turn as the claim. Several existing tools touch this from adjacent angles (gstack's `/ship`, superpowers' TDD skill, decider/claude-hooks). I wanted the narrowest possible thing: a Stop hook that fires at every turn boundary, not only at end-of-task, and refuses to let the turn end without verification when the agent has claimed completion.

Two pieces:

1. A Stop hook that reads `transcript_path` from the Claude Code v2.1.119 hook payload, runs a syntactic claim detector + a tool-observation verifier on the last assistant turn, and emits `{"decision":"block","reason":"..."}` when a claim has no evidence in the same turn. The hook protocol was reverse-engineered directly from the Claude Code binary; full extraction in `docs/findings.md`.

2. A `groundtruth audit` CLI that walks past session JSONL files and flags every unverified completion claim, with file path, line range, and SARIF output for CI. This catches history the live hook couldn't have seen.

Calibration was the hardest part. I ran v0.1.0 against 1,272 turns of my own session history and got 30 findings, all false positives — paper-writing prose like "the manuscript is ready", "citations resolved." Three iterations of "audit on real data, add exclusions, re-audit" got it to 0–1 findings on the same corpus, while still firing on every test fixture that should fire. The detector is regex + exclusion patterns; full source in src/detector.mjs.

In-vivo demo: I asked `claude -p` to create a file and end with "Done." With groundtruth installed, the first "Done." got blocked and the next turn produced the prescribed retraction phrasing word for word ("I attempted X. I have not verified it. To verify I would need to Y."). That phrasing was emitted only because the hook fed the gate's reason back to the model. Without the hook, the session ends on the first "Done."

MIT, zero new runtime deps (pure ESM .mjs files, Node 18+), one paste to install. Composes with gstack and superpowers rather than replacing them.

Repo: https://github.com/vnmoorthy/groundtruth

I'd love false-positive reports from anyone who runs `groundtruth audit` against their own `~/.claude/projects/`. The detector is calibrated against my own corpus, which is mostly academic and code work; other people's prose will surface other patterns.

---

## awesome-claude-code (PR or issue)

If [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) accepts a PR adding a single line under the relevant section, do that. The line:

    - [groundtruth](https://github.com/vnmoorthy/groundtruth) – Stop hook that refuses to let the agent end a turn on a completion claim without verification evidence in the same turn. Includes an audit CLI for past sessions and a memory-write gate. MIT.

Same in the gstack and superpowers Discord/issues if you're already a member of those communities. Phrasing: "I built a small thing that fires before /ship hands off; here it is."

---

## Voice tips

- Lead with the live demo paragraph in every post. The forced retraction phrasing is the most concrete proof and the most quotable detail.
- Numbers always: "1,272 turns", "30 → 0", "104 tests". Vague claims hurt; specific small numbers help.
- Don't oversell. The tool does one thing. Say so. If you claim it solves agent hallucination, you'll be (correctly) called out. It catches *one specific category* of agent over-claiming.
- Disclose composition. Naming gstack and superpowers in a friendly way invites their communities to engage instead of seeing this as a competitor.
- Reply to every comment for the first 24 hours. The Reddit and HN ranking algorithms care about engagement velocity.

## What to do AFTER posting

1. Pin the launch comment to the top of any subreddit thread you control.
2. If anyone files a real false-positive issue, fix it within 24 hours and tag the release. That's how trust compounds.
3. Add a "Used by" line to the README the first time someone outside your org tries it (with their permission).
4. Don't post in more than two communities per day. Cross-posting too fast looks like spam and triggers downranking.
