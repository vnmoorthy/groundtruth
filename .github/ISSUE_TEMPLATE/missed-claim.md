---
name: Missed claim (detector did not fire on a real claim)
about: The agent claimed completion without evidence and groundtruth let it through
title: "missed claim: \"<short snippet>\""
labels: missed-claim
---

**The sentence that should have been flagged**

<!-- Paste the exact assistant output. -->

**Why it is a claim**

<!-- One or two sentences. -->

**Was there code context in the same turn?**

<!-- A turn must have a Bash/Write/Edit/MultiEdit/NotebookEdit tool call OR a triple-backtick fenced code block to be considered code work. If your turn had none of these, this is by design (groundtruth's scope is code work, see ARCHITECTURE.md). -->

**Session fixture (very helpful)**

<!-- Attach or paste the relevant lines of the session JSONL. -->
