---
name: groundtruth
description: A completion-claim gate. When active, the agent cannot assert that code work is done, complete, fixed, ready, shipped, implemented, or working unless the same turn also contains machine-checkable verification evidence. Applies to every coding task in the session. Not optional. Load this skill whenever you are about to write, edit, or modify code the user will run.
---

# groundtruth

## The rule

In any turn where you assert that a piece of code work is finished, that turn must also contain at least one piece of verification evidence. Evidence means one of:

- A test command and its passing output (`node --test`, `bun test`, `pytest`, `go test`, `cargo test`, `jest`, `vitest`, `npm test`)
- A successful type check (`tsc --noEmit`, `mypy`, `pyright`, `flow check`)
- A successful build (`npm run build`, `cargo build`, `go build`, `make`)
- A successful lint run (`eslint`, `ruff`, `clippy`, `golangci-lint`)
- A curl response with an expected 2xx status
- A Read or Grep result confirming the symbol you claim to have written actually appears in the file

If you have no evidence to produce, do not round up. Say instead:

> I attempted X. I have not verified it. To verify I would need to Y.

## Trigger words

Words that trigger the gate when used as an assertion about work just performed:

`done`, `complete`, `completed`, `fixed`, `ready`, `shipped`, `implemented`, `finished`, `built`, `passing`, `passes`, `resolved`, `wired up`, `hooked up`, `landed`, `merged`, `works`, `working`

## Patterns that are not claims

The gate is syntactic. These phrasings do not trigger it:

- "I am working on it" (present progressive)
- "The existing code is working" (meta, about prior state)
- "ready to continue" (ready-to-verb is not a completion assertion)
- "working as expected" (adjectival qualifier on observed behavior, not a claim of completion)
- "if it works" (conditional)
- "working example" (adjective + noun)

## How the gate enforces itself

A Stop hook runs after every turn you end. It reads your last assistant message plus the tool observations from the same turn. If it detects a claim without evidence, it returns `{"decision":"block","reason":"..."}` and you will be forced to produce another turn that addresses the reason.

The hook checks `stop_hook_active` and will never block twice in a row, so the worst case if the detection is wrong is one wasted turn, not an infinite loop.

## What to do when blocked

You were blocked because your last turn asserted completion without evidence. Do one of:

1. Run the verification that actually demonstrates the work: the test, the build, the curl, the grep.
2. If no verification is possible in this context, retract the claim and say what you would need to verify it.
3. If you believe the detection was a false positive, still do step 1 or 2. Do not argue with the hook. Produce evidence or retract.

## Scope

This rule applies to code work. Asserting completion of non-code work (summarizing a file, answering a question, describing a plan) is not gated. The trigger frames are tuned to statements about code the agent just wrote or modified.

## Composition with other skills

If the user has gstack or superpowers installed, groundtruth fires at Stop, before those skills' `/ship`, `/review`, or `/plan` flows hand control back to the user. groundtruth does not replace those tools. It sits below them and refuses the completion claim they would otherwise summarize.

## Memory gate

If a MEMORY.md, NOTES.md, or similar persistent memory file is about to be written in this session with a completion claim, the same rule applies: the claim must be verified in the current session, not carried forward from an assumption.
