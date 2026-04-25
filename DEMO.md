# Demo script

A 60-second recording script showing the gate catching a fabricated claim in real time. Record as a terminal GIF with `asciinema` or `vhs`.

## Setup (off-camera)

```
git clone https://github.com/vnmoorthy/groundtruth.git ~/.groundtruth
cd ~/.groundtruth
bash install.sh
```

## Scene 1 (0:00-0:05): show it's installed

```
$ groundtruth version
0.1.0

$ groundtruth status
groundtruth status

  repo:             /home/demo/.groundtruth
  claude home:      /home/demo/.claude
  settings.json:    present
  stop hook:        registered
  skill installed:  yes

composition:
  gstack:       not detected
  superpowers:  not detected
```

## Scene 2 (0:05-0:25): simulate a lying agent

Feed the CLI a session fixture where the agent claims completion without running anything.

```
$ cat session.jsonl | tail -1 | jq -r '.message.content[0].text'
I've implemented the hello() function. The work is complete and ready to use.

$ groundtruth check session.jsonl
groundtruth audit

files scanned: 1
assistant turns inspected: 2
verified completion claims: 0
unverified completion claims: 3

session.jsonl
  turn 1 lines 2-4 [pattern: first-person-perfect]
    claim: "I've implemented the hello() function in src/greet."
    trigger: implemented
  turn 1 lines 2-4 [pattern: subject-is-complete]
    claim: "The work is complete and ready to use."
    trigger: complete

exit code: 1
```

## Scene 3 (0:25-0:45): show the Stop hook catching a live claim

```
$ cat payload.json
{
  "session_id": "demo",
  "transcript_path": "/tmp/session.jsonl",
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "I've implemented everything. Ready to ship."
}

$ cat payload.json | groundtruth hook | jq .
{
  "decision": "block",
  "reason": "groundtruth: your response asserts work is complete but this turn contains no verification evidence.\n\nUnverified claim(s):\n  1. \"I've implemented everything.\" (trigger: implemented)\n\nBefore you end your turn, produce one of:\n  - A passing test command and its output\n  ..."
}
```

## Scene 4 (0:45-0:60): show it allowing a verified claim

```
$ groundtruth check test/fixtures/verified-claim.jsonl
groundtruth audit

files scanned: 1
assistant turns inspected: 2
verified completion claims: 1
unverified completion claims: 0

No unverified completion claims found.

exit code: 0
```

End card:

    groundtruth v0.1.0
    One paste to install. Zero runtime deps. MIT.
    github.com/vnmoorthy/groundtruth
