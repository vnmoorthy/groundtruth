---
name: False positive (detector fired on a non-claim)
about: A sentence got flagged that was not actually a completion claim
title: "false positive: <pattern-name> on \"<short snippet>\""
labels: false-positive
---

**The sentence that got flagged**

<!-- Paste the exact sentence groundtruth flagged. -->

**Pattern name and trigger**

<!-- From the audit output, e.g. "subject-is-complete / ready" -->

**Surrounding context (optional but very helpful)**

<!-- Five or six lines of the surrounding session JSONL, or a description of what the agent was working on. The detector decision is sentence-local so the surrounding context is for human review only. -->

**Why this is not a claim**

<!-- One or two sentences. Examples that have produced previous fixes:
  - "the paper is ready" -> academic subject, not code
  - "ready to continue" -> ready-to-verb, not ready-as-adjective
  - "working as expected" -> meta about prior state
-->

**Suggested fix (optional)**

<!-- A regex you would add to src/detector.mjs EXCLUSION_PATTERNS, or just leave this blank. -->
