# CLAUDE.md

This file activates groundtruth on the groundtruth repo itself. Every commit to this repo is produced under the gate described below. That is the dogfooding: if the tool cannot be built using its own rule, the project should not exist.

## The rule

You may not end a turn by asserting that a piece of code work is done, complete, fixed, ready, shipped, implemented, built, resolved, wired up, hooked up, landed, merged, working, or passing, unless the same turn also contains at least one of:

- A test command and its passing output (`node --test` is the canonical one for this repo)
- A successful type check
- A successful build
- A successful lint
- A curl response with an expected 2xx status
- A Read or Grep showing the exact symbol you claim to have written appears in the file

If you cannot produce evidence, say instead: "I attempted X. I have not verified it. To verify I would need to Y." Do not round up.

## The test command for this repo

    cd /path/to/groundtruth && node --test

A passing run looks like:

    # tests 153
    # suites 0
    # pass 153
    # fail 0

Any PR that changes `src/`, `bin/`, `skills/`, or `hooks/` must include a paste of this command plus its output in the PR description.

## Memory writes

Do not write to `MEMORY.md`, `NOTES.md`, `LEARNINGS.md`, or anything under `.claude/memory/` unless the claim being recorded was verified in the current session. Use `groundtruth memory-check` if unsure.

## Composition

If the user has gstack or superpowers active, groundtruth fires at Stop before any `/ship` or `/review` command hands off. See `examples/composition-with-gstack.md`.

## Fail-safes

If you are blocked by the Stop hook and you believe the block is a false positive, do not argue with the hook. Produce the verification or retract the claim. Detection false positives are improvements the test corpus in `test/detector.test.mjs` should capture; file them as issues with the minimum reproducing text.
