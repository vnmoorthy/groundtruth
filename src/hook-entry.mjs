// src/hook-entry.mjs
//
// Stop hook entry point. Reads a Claude Code Stop hook JSON payload from
// stdin, runs the groundtruth check on the last assistant turn, and
// writes either silence (allow) or `{"decision":"block","reason":"..."}`
// (block) to stdout.
//
// Schema of the stdin payload (extracted from the Claude Code v2.1.119 binary):
//   {
//     "session_id": "<uuid>",
//     "transcript_path": "<absolute path to session JSONL>",
//     "cwd": "<working directory>",
//     "permission_mode": "...",
//     "hook_event_name": "Stop",
//     "stop_hook_active": boolean,
//     "last_assistant_message": "<text of the assistant's last turn>"
//   }
//
// Protocol notes:
//   - If `stop_hook_active` is true, do not block. Claude is already in a
//     forced continuation and blocking again risks an infinite loop.
//   - On a block decision, print a single JSON object to stdout and exit 0.
//   - On allow, print nothing and exit 0.

import { parseSessionFile, observationsForTurn } from "./session.mjs";
import { checkTurn } from "./check.mjs";

async function readStdin() {
  return await new Promise((resolve, reject) => {
    let data = "";
    const timer = setTimeout(() => {
      reject(new Error("timeout reading stdin"));
    }, 5000);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function emitAllow() {
  // Empty output + exit 0 = allow
  process.exit(0);
}

function emitBlock(reason) {
  const payload = {
    decision: "block",
    reason,
  };
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function emitSilentError(msg) {
  // Non-blocking: write to stderr, exit 1 (not 2, so Claude does not treat
  // this as a blocking hook error). The user's session continues.
  process.stderr.write(`groundtruth hook error: ${msg}\n`);
  process.exit(1);
}

export async function runHook(readStdinFn = readStdin) {
  let input;
  try {
    const raw = await readStdinFn();
    input = JSON.parse(raw);
  } catch (err) {
    emitSilentError(`failed to parse stdin: ${err.message}`);
    return;
  }

  // Safety: never fire twice in a row for the same Stop.
  if (input.stop_hook_active === true) {
    emitAllow();
    return;
  }

  let assistantText = input.last_assistant_message || "";
  let observations = [];

  // If we have the transcript path, load the tail to recover tool observations
  // for the last assistant turn. This is how we detect verification artifacts.
  if (input.transcript_path) {
    try {
      const turns = parseSessionFile(input.transcript_path);
      // Find the last assistant turn.
      let lastAssistant = null;
      for (let i = turns.length - 1; i >= 0; i--) {
        if (turns[i].kind === "assistant") {
          lastAssistant = turns[i];
          break;
        }
      }
      if (lastAssistant) {
        if (!assistantText) assistantText = lastAssistant.text;
        observations = observationsForTurn(lastAssistant);
      }
    } catch (err) {
      // We can still check based on last_assistant_message alone.
      process.stderr.write(
        `groundtruth: could not read transcript (${err.message}), falling back to last_assistant_message only\n`,
      );
    }
  }

  const result = checkTurn(assistantText, observations);
  if (result.blocked) {
    emitBlock(result.reason);
  } else {
    emitAllow();
  }
}

// Run when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  runHook().catch((err) => {
    emitSilentError(err.message || String(err));
  });
}
