---
name: Bug report (other)
about: Something else broke
title: "bug: <one line>"
labels: bug
---

**What happened**

<!-- A few sentences. -->

**Reproduction**

<!-- Smallest steps that reliably reproduce. -->

**Expected**

**Actual**

**Environment**

Paste the JSON from `groundtruth doctor --json` below. It captures node version, claude version, hook registration state, skill install path, and config — everything we usually have to ask for. groundtruth collects no telemetry; the JSON is local-only and only leaves your machine if you paste it here.

```json
<paste `groundtruth doctor --json` output here>
```

If the doctor command isn't available on your machine, paste these instead:

- groundtruth: `groundtruth version`
- claude code: `claude --version`
- node: `node --version`
- OS:
