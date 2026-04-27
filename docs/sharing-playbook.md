# Sharing playbook for groundtruth

Paste-and-go drafts for every channel worth trying after the r/ClaudeAI lock. Every section has the URL, the exact text, and any prerequisites. Re-read the README on github.com (not locally) before posting any of these. The README is the landing page every link below points at.

---

## 1. Show HN

**Submit URL:** https://news.ycombinator.com/submit

**Form fields:**

| field | value |
| --- | --- |
| `title` | `Show HN: Groundtruth – Stop hook that blocks Claude Code from saying done` |
| `url`   | `https://github.com/vnmoorthy/groundtruth` |
| `text`  | (leave blank — HN combines a URL submission with the first comment; do NOT fill `text` if you fill `url`) |

**First comment** (post immediately after submission, exactly this — HN's first-comment is where the actual context lives for URL-only submissions):

```
Author here. Small tool I built last week.

The pattern is well-known: Claude Code agents regularly assert completion on work they haven't verified. Several existing tools touch this from adjacent angles — gstack's /ship, superpowers' TDD skill, decider/claude-hooks. I wanted the narrowest possible thing: a Stop hook that fires at every turn boundary, refuses to let the turn end if the agent claims completion without verification in the same turn.

Two pieces:

1. The Stop hook reads transcript_path from the Claude Code v2.1.119 hook payload, runs a syntactic claim detector and a tool-observation verifier on the last assistant turn, and emits {"decision":"block","reason":"..."} when a claim has no evidence. The hook protocol was extracted directly from the Claude Code binary; details in docs/findings.md.

2. A `groundtruth audit` CLI walks past session JSONL files and flags every unverified completion claim with file path and line range, plus SARIF output for CI.

The interesting part for me was the calibration loop. v0.1.0 against 1,272 turns of my own session history produced 30 findings, all false positives — paper-writing prose like "the manuscript is ready", "citations resolved." Three iterations of "audit on real data, add exclusions, re-audit" got it to 0–1 findings on the same corpus, while still firing on every test fixture that should fire (3 findings on the unverified-claim fixture, 1 on terse-closer, 2 on checklist, 0 on verified-claim). The detector is regex + exclusion patterns; full source in src/detector.mjs and the calibration table is in CHANGELOG.md.

In-vivo demo I recorded against `claude -p`: I prompted "Create hello.txt and end your turn with 'Done.'" The agent said "Done.", the hook returned a block with a reason, and the next turn — forced by the block — was the agent retracting using the exact phrasing the skill teaches: "I attempted to create hello.txt. I have not verified it. To verify I would need to..." The agent did not generate that retraction phrasing on its own; the hook fed the gate's reason back to the model. Without the hook, the session ends on the first "Done."

MIT, zero new runtime deps (pure ESM .mjs files, Node 18+), one paste to install. Composes with gstack and superpowers rather than replacing them.

Happy to discuss the hook protocol reverse-engineering, the detector calibration loop, or composition with the existing skill ecosystem.
```

**Notes:**
- Submit between 7–10 AM Pacific weekdays. HN's top-of-page window is roughly 8–11 AM PT.
- Don't ask for stars or upvotes. HN downranks both.
- Reply to every top-level comment within 30 minutes for the first 2 hours.

---

## 2. Direct outreach

### 2a. Garry Tan (gstack)

**Best channel:** Twitter/X DM to **@garrytan**. He has open DMs as of last public check. Backup: GitHub Issues on `garrytan/gstack` titled "Composition: groundtruth as a sub-/ship layer" — but DM lands first and isn't public.

**Twitter DM text:**

```
Hi Garry — built a small Stop hook called groundtruth that refuses to let Claude Code end a turn on a completion claim without verification in the same turn. It composes with gstack: fires at every Stop, before /ship ever hands off, so /ship starts from a verified state.

Calibrated against 1,272 turns of my own session history (30 false positives → 0 over three releases). Live in-vivo demo where the agent retracted using the exact phrasing the skill teaches — first turn it said "Done.", the hook blocked, second turn it produced the prescribed retraction word for word.

MIT, zero new deps, one paste.

https://github.com/vnmoorthy/groundtruth

Not asking for anything — just thought it might be useful as a layer below /ship and you'd be the right person to know about it.
```

### 2b. Jesse Vincent (obra / superpowers)

**Best channels, in order of preference:**
1. GitHub: open a Discussions thread (not Issue) on `obra/superpowers` titled "groundtruth — a Stop-hook layer that complements TDD-by-instruction." Include the body below. Public, durable, and respects his repo's signal-to-noise.
2. Twitter/X: handle is **[VERIFY: search "obra superpowers" on X to confirm current handle before DMing]**. Likely `@obra` but verify.
3. Email: not posting a guess; if you have it from prior contact, use it.

**GitHub Discussions / DM body:**

```
Hi Jesse — building on what superpowers steers the agent to do, I made a small Stop-hook tool that enforces it from below.

groundtruth fires at every Claude Code Stop event, reads the last assistant turn, and blocks if there's a completion claim without a verification artifact in the same turn. Returns {"decision":"block","reason":"..."} so the model produces another turn that satisfies the rule. Where superpowers' TDD skill steers the agent into the right shape, groundtruth catches the cases where that steer didn't take.

Calibrated against 1,272 turns of one user's real session history: v0.1.0 produced 30 findings (all false positives — academic prose), v0.1.3 produces 0–1 after three rounds of audit-driven exclusion tuning. In-vivo demo: agent claimed "Done.", hook blocked, agent retracted with the phrasing the skill teaches.

MIT, zero new runtime deps, composes with superpowers rather than replacing.

https://github.com/vnmoorthy/groundtruth

If you ever want a hook layer below the methodology, this is one. No ask attached — wanted you to know it existed.
```

---

## 3. awesome-claude-code PR

**Repo:** https://github.com/hesreallyhim/awesome-claude-code

**Steps:**

1. Fork `hesreallyhim/awesome-claude-code` to your account in the GitHub UI.
2. Clone, edit `README.md`, add the line below under whichever section currently lists hooks (likely "Hooks" or "Tools / Hooks" — open the file and grep for "hook" to find the section header).
3. Commit, push, open PR.

**Line to add (alphabetize within the section):**

```markdown
- [groundtruth](https://github.com/vnmoorthy/groundtruth) – Stop hook that refuses to let the agent end a turn on a completion claim without verification evidence in the same turn. Includes an audit CLI for past session JSONLs (text, JSON, SARIF) and a memory-write gate. Calibrated against 1,272 real assistant turns. Zero dependencies. MIT.
```

**PR title:** `Add groundtruth (Stop-hook completion-claim gate)`

**PR description:**

```
Adds [groundtruth](https://github.com/vnmoorthy/groundtruth) under the Hooks section.

Stop hook for Claude Code that blocks the agent from ending a turn on a completion claim ("Done.", "implemented X", "tests pass") unless the same turn contains a verification artifact (passing test, build, type check, curl 2xx, grep on a written symbol). Composes with gstack and superpowers — fires at every Stop, before /ship hands off.

Also includes a `groundtruth audit` CLI that walks past `~/.claude/projects/*/*.jsonl` files and flags unverified claims retroactively, with SARIF output for CI.

MIT, zero new runtime deps (Node 18+ standard library only), 153 tests passing, single-paste installer.
```

---

## 4. Anthropic Discord

**[VERIFY BEFORE USING]** I do not have a current verified invite link to the official Anthropic / Claude developer Discord. To find the correct invite:

1. Visit https://www.anthropic.com/developers (or https://docs.claude.com)
2. Look for "Community" or "Discord" in the footer or sidebar.
3. Confirm the invite link is anthropic-official, not a third-party server.

**Channel:** Once in, look for `#claude-code`, `#dev-tools`, `#community-projects`, or `#showcase`. Avoid `#general` — your post will sink.

**Post body** (works in Discord; markdown is supported):

```
Built a small Stop hook called **groundtruth** that refuses to let Claude Code end a turn on a completion claim without verification.

Composes with gstack and superpowers, fires at every Stop, blocks `{decision:"block",reason:...}` when the agent says "done"/"fixed"/"implemented" without a same-turn test pass, build, curl 2xx, or grep on a written symbol.

Calibrated against 1,272 turns of my own history: 30 false positives → 0 over three releases.

In-vivo demo: agent claimed "Done.", got blocked, retracted with the exact phrasing the skill teaches.

MIT, zero deps, single-paste install.
https://github.com/vnmoorthy/groundtruth
```

---

## 5. X/Twitter

**Without a GIF (use this until the GIF is recorded):**

```
Built a Stop hook for Claude Code that physically refuses to let the agent end a turn on "done" without verification in the same turn.

Live demo: agent claimed Done. → got blocked → retracted with the exact phrasing the skill teaches it.

Calibrated against 1,272 of my own session turns. MIT, zero deps.

https://github.com/vnmoorthy/groundtruth
```

(279 chars including URL — under the 280-char limit. Do not add a thread reply with extra context until after engagement starts; threads on launch tweets dilute reach.)

**With a GIF (use after recording — see Prerequisites):**

```
The Stop hook for Claude Code I wish existed. It refuses to let the agent end a turn on "done" without verification.

Live: agent claims Done. → blocked → retracts with the exact phrasing the skill teaches.

1,272-turn calibration. MIT.

https://github.com/vnmoorthy/groundtruth
```

(Attach the recorded GIF.)

**Accounts to tag:**

| who | handle | when to tag |
| --- | --- | --- |
| Anthropic | `@AnthropicAI` | yes — they retweet Claude Code tools |
| Garry Tan | `@garrytan` | only AFTER you've sent the DM (#2a). Don't tag without the heads-up DM, looks like a stunt. |
| Jesse Vincent | **[VERIFY: confirm @obra is current]** | only AFTER the GitHub Discussions thread (#2b) |
| Simon Willison | `@simonw` | yes — he covers Claude Code tools regularly on his blog |
| Logan Kilpatrick | `@OfficialLoganK` | maybe — he's at Google now, less Anthropic-aligned |

Tag at most three accounts in the launch tweet. More than three reads as desperation and Twitter's algorithm deprioritizes it.

---

## 6. r/LocalLLaMA

**Submit URL:** https://www.reddit.com/r/LocalLLaMA/submit

This subreddit allows engineering writeups and tool launches more readily than r/ClaudeAI. The framing here is calibration story, not tester recruitment.

**Form fields:**

| field | value |
| --- | --- |
| `Title` | `Calibrating a Claude Code completion-claim detector against 1,272 real session turns: 30 → 0 false positives over three releases` |
| `URL` | (leave blank — use a text post, not a link post) |
| `Text` | (paste below) |
| `Flair` | "Resources" or "Discussion" if available; never "Self-promotion" |

**Body text:**

```
Wanted to share an engineering writeup from this week. The tool itself is incidental; the calibration loop is the interesting part.

Claude Code agents will assert completion on work they haven't verified — "Done.", "implemented X", "all tests pass" — even when they didn't actually run anything. Several existing tools (gstack, superpowers, decider/claude-hooks) address this from adjacent angles. I wanted the narrowest possible thing: a Stop hook that fires at every turn boundary and refuses to let the agent end the turn if there's a completion claim with no verification artifact in the same turn.

The implementation was straightforward — a syntactic claim detector (regex frames + exclusion patterns) plus a tool-observation verifier (recognizes 80+ test runners, build tools, type checkers, curl 2xx). The Claude Code Stop hook returns `{"decision":"block","reason":"..."}` and the model produces another turn that addresses the reason.

The hard part was calibration. v0.1.0 against my own 1,272-turn `~/.claude/projects/` history produced 30 findings — all false positives, mostly academic paper-writing prose ("the manuscript is ready", "citations resolved", "Bibliography corrections successfully integrated"). The detector was firing on completion-shaped sentences regardless of whether they were about code.

Three iterations later:
- v0.1.0: 30 findings, 100% false positive
- v0.1.2 (added a code-context filter): 5 findings, still mostly false positive — paper-writing turns slipped through because they contained `python` fenced code blocks
- v0.1.3 (added detector-level academic-subject exclusions): 0–1 findings on the same corpus, while still catching every fixture that should fire

The lessons that surprised me:

1. A "code context" filter built from common programming words (function, class, method, return) fires on academic prose because all of those words are basic English. Hard signals only — actual tool calls or triple-backtick fenced blocks — were the only reliable filter.

2. Memory-observer tools (`<completed>`, `<fact>`, `<next_steps>` XML tags emitted by agent observability scripts) needed their own exclusion category. Without them the detector fired on every observer-emitted summary regardless of code context.

3. Conference venue names (TMLR, NeurIPS, ICML, arXiv, etc.) appearing in the same sentence as completion words is a strong "this is academic" signal. The exclusion has to handle underscore-joined forms like `PAVO_TMLR_submission` because that's how observer tools name files.

4. The detector ships with 8 claim frames and 27 exclusion patterns. Each release added exclusions; none subtracted them. Suggests the calibration ceiling is reached when new corpora stop revealing new categories of academic prose.

The tool is at https://github.com/vnmoorthy/groundtruth. MIT, zero new dependencies, hook protocol extracted directly from the Claude Code v2.1.119 binary (full extraction in docs/findings.md).

If anyone has worked through similar precision calibration on agent-output classifiers, curious whether the regex+exclusions approach is what eventually breaks for you, or whether there's an LLM-classifier path that scales better.
```

**Notes:**
- This subreddit prefers engineering depth. Lead with the calibration loop, mention the tool incidentally.
- If a mod removes for "self-promotion" anyway, the engineering content stands on its own as a comment thread elsewhere.

---

## 7. Lobste.rs

**Submit URL:** https://lobste.rs/stories/new

**[PREREQUISITE]** Lobste.rs is invite-only. You need an existing user to invite you. If you don't have an account, skip this section or ask someone in your network with an account to submit on your behalf.

**Form fields:**

| field | value |
| --- | --- |
| `Title` | `Groundtruth: a Stop hook that blocks Claude Code from claiming "done" without verification` |
| `URL` | `https://github.com/vnmoorthy/groundtruth` |
| `Tags` | `release`, `javascript`, `ai`, `show` (pick 3–4 from those) |

**Story description (optional but recommended):**

```
Stop hook for Claude Code's hook system that fires at every assistant turn boundary, reads the last assistant message + tool observations, and emits {"decision":"block","reason":"..."} when the agent has claimed completion with no matching verification artifact in the same turn. Calibrated against 1,272 real assistant turns from one user's session history: 30 false positives in v0.1.0, 0 in v0.1.3, after three rounds of detector exclusion tuning against real data. Includes an audit CLI for past session JSONLs (text, JSON, SARIF outputs) and a memory-write gate. Hook protocol reverse-engineered from the Claude Code v2.1.119 binary. Pure ESM (Node 18+ stdlib only), MIT.
```

---

## Prerequisites

Before you can ship every channel, these need to exist:

- [ ] **Recorded terminal GIF** for the Twitter post (5b) and the README hero. Tools: `vhs` (`brew install charmbracelet/tap/vhs`) or `asciinema` + `agg`. The script that drives it should run the live-smoke flow we tested. ~30 second target. This is the highest-impact missing artifact.
- [ ] **Verified Twitter handle for Jesse Vincent (obra)** — search "obra superpowers" or "Jesse Vincent superpowers" on X and confirm `@obra` is current.
- [ ] **Current Anthropic Discord invite link** — only valid invite is via anthropic.com / docs.claude.com.
- [ ] **Lobste.rs account** — only ship section 7 if you already have one.

---

## Order of operations

1. **First, the durable surface area**: the awesome-claude-code PR (#3). Submitted once, lives forever.
2. **Then the personal outreach** (#2a, #2b). DMs and Discussion posts. No public commitment, just heads-ups.
3. **Then Show HN** (#1). This is your one shot at HN; pick a Tuesday or Wednesday morning Pacific.
4. **Then Twitter** (#5), tagging only the people you've already DM'd. Don't fire Twitter before the DMs land.
5. **Then r/LocalLLaMA** (#6). Wait at least 24 hours after #1 so the engagement spikes don't compete.
6. **Then Anthropic Discord** (#4). The community there responds to traction signals; posting after some HN/Twitter visibility helps.
7. **Lobste.rs** (#7) any time you have an account.

Don't fire all of these in 24 hours. Spreading over 3–5 days makes each post readable as a "look what I built" rather than a launch campaign.

---

## What NOT to do

- Do not ask anyone to "test it on your own data" in any of these posts. That framing is what got the r/ClaudeAI post locked. The calibration story stands without an explicit ask.
- Do not cross-post the same text. Each channel's text above is intentionally different in framing and length.
- Do not edit a post's title after submission. If you think the title is wrong, that's a cost; reposting after delete looks like spam.
- Do not respond to negative comments with defensiveness. The strongest reply is "good catch — I'll add a fixture for that and ship a fix tomorrow," then actually do it.
