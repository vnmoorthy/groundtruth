# ROADMAP

What groundtruth might do later. None of this is committed; it's a record of the multi-angle review that happened in v0.1.9 (CEO scope, eng, devex, security, design) and the candidate items that surfaced.

The principle: **groundtruth does one thing.** Anything below either makes that one thing better, or it goes in this list and stays here.

## Categories

### A. Sharper at the one thing

Highest priority. Items here directly improve the gate's precision, recall, or operability.

- **LLM-classifier fallback for ambiguous claims.** Regex misses novel phrasings. A small model (e.g., the same Claude API the user already has access to) could classify the borderline ~5% the regex isn't sure about. Tradeoff: introduces an API dependency and latency to the Stop hook. Probably an opt-in flag, not a default.
- **Multi-turn lookback in the verifier.** Today, verification has to be in the same turn as the claim. A real workflow is often: edit-turn, then test-turn, then claim-turn. Look back N turns when deciding "verified."
- **Tool-output content verifier.** Today, classifying a Bash command as "test" matches the command line. A test that prints `# pass 0 # fail 0` (no actual assertions) currently counts. Inspect the count; require it to be > 0.
- **A `groundtruth diff` command** that compares two audits and shows whether you're improving or regressing claim quality over time.

### B. Better evaluation surface

Medium priority. Items here make it easier for new users to *try* the tool.

- **Pre-built fixtures from public sources** (with permission). Users could see groundtruth fire against more than just one author's corpus.
- **A `groundtruth tutorial`** interactive walkthrough that runs the demo, then guides the user through their first audit, then through `fixture add`. Three-minute first-session experience.
- **A web dashboard at the playground** that maintains a session-local "claim history" and shows trends as you paste multiple sessions.

### C. Composition with the ecosystem

- **A `groundtruth lint` mode** that runs as part of pre-commit (via `husky` or `lefthook`) and refuses commits authored under unverified claims in the most recent session.
- **A CI badge endpoint** that takes a session JSONL and returns a shields.io-compatible JSON payload, so users can stick a "groundtruth: 0 unverified" badge on their repo.
- **VS Code extension** that highlights claim sentences in session JSONL files when viewing them.
- **GitHub App** that audits PR descriptions for unverified claims at PR-open time.

### D. The bigger product hiding inside

Captured for honesty, not for execution. The CEO-review angle on groundtruth says: a generic "verification gate for any AI agent that produces text" is a much larger market than Claude Code specifically. Adapters for Cursor, Cody, Cline, Aider, Copilot Chat, and the Anthropic API directly are all plausible.

Doing this would mean groundtruth becomes an abstract framework with adapter packages — closer to ESLint than to a Stop hook. It's a different project shape, with different tradeoffs (more surface area, more compatibility burden, broader audience).

The current scope is correct for v1: solve it well for one client (Claude Code) before generalizing. If groundtruth gets meaningful adoption and people start asking "can I use this with X," that's the signal to expand. Not before.

### E. Out of scope, on purpose

These came up in the multi-angle review and the answer is "no":

- **A workflow command suite** like gstack's 24 commands. groundtruth composes underneath that; reproducing it would be scope creep.
- **A hosted dashboard** with accounts. Would mean operating an account system. Different project.
- **Telemetry**, even opt-in. The privacy story is part of the value prop. SARIF/JSON output exists; users can pipe to whatever they want.
- **Auto-fixing the agent.** The gate's job is to block, not to write code. The agent figures out the fix on the next turn.
- **A plugin marketplace.** If detection patterns get domain-specific, they belong in `.groundtruthrc.json`, not in a marketplace.

## Multi-angle review notes from v0.1.9

This section records the actual analysis behind the items above.

**CEO scope review.** The bigger product is "agent verification at the protocol layer." groundtruth is one implementation, scoped to Claude Code. Generalizing now would dilute the calibration story. Captured as Category D.

**Engineering review.** The detector is regex-based and biased to precision. The verifier is heuristic. The hook protocol is reverse-engineered from a binary that can change. Edge cases I haven't fully tested: very large transcripts (>10k turns), partially-corrupt JSONL, race condition between concurrent Stop hooks if Claude Code ever spawns them, extreme prose length per turn. Captured in Category A.

**Design review.** README is text-heavy. The new landing page (`docs/index.html`) helps. A real screencast GIF (already drafted in `tools/demo.tape`) would close the visual gap further. Visual identity (`docs/logo.svg`) exists.

**DevEx review.** Time-to-first-block was the biggest gap; `groundtruth demo` (added in v0.1.9) closes it. `groundtruth doctor` covers diagnostic. `groundtruth init` covers configuration on-ramp. `groundtruth fixture add` covers the contribution loop. The remaining gap is the playground URL not being live — that's a Pages-enable click on the user's side.

**Security review.** Documented in `SECURITY.md`. Realistic threats: malicious dependency (mitigated by zero deps), compromised maintainer (mitigated by tagged releases), prompt injection in session text (mitigated by static-only regex evaluation, no eval).

**QA review.** The auto-test loop (`fixture add` → `test/community-fixtures.test.mjs`) is the durable QA mechanism. CI matrix tests Node 18, 20, 22 and is currently green. Manual QA gap: install on a fresh-fresh machine without any of these tools, end-to-end. Worth a one-time pass on a fresh container.

**Retro / what we learned.** Calibration against real data was the single biggest quality lever — 30 → 0 false positives in three releases by listening to the audit instead of guessing. The `fixture add` command codifies that loop for everyone else.
