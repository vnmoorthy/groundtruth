// src/memory-hook-entry.mjs
//
// PreToolUse hook handler. Reads the Claude Code PreToolUse JSON payload
// from stdin, checks whether the tool call would modify a memory file
// (MEMORY.md / NOTES.md / .claude/memory/*) with unverified completion
// claims, and emits a permissionDecision to either deny or allow.
//
// Per the Claude Code v2.1.119 hook protocol (extracted in docs/findings.md):
//   PreToolUse stdin payload includes tool_name, tool_input.
//   Hook can return { hookSpecificOutput: { hookEventName: "PreToolUse",
//     permissionDecision: "deny", permissionDecisionReason: "..." } }

import { isMemoryFile, checkMemoryWrite } from "./memory-gate.mjs";

async function readStdin() {
  return await new Promise((resolve, reject) => {
    let data = "";
    const t = setTimeout(() => reject(new Error("timeout reading stdin")), 5000);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      clearTimeout(t);
      resolve(data);
    });
    process.stdin.on("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

function emit(out) {
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

function emitAllow() {
  process.exit(0);
}

export async function runMemoryHook(readStdinFn = readStdin) {
  let payload;
  try {
    payload = JSON.parse(await readStdinFn());
  } catch (err) {
    process.stderr.write(
      `groundtruth memory-hook: bad stdin (${err.message})\n` +
        "  Why: stdin did not contain a valid PreToolUse JSON payload.\n" +
        "  Fix: this hook is invoked by Claude Code, not run by hand. If you\n" +
        "       see this in a real Claude Code session, file an issue with the\n" +
        "       payload Claude Code sent so we can adapt to schema changes.\n",
    );
    process.exit(1);
  }

  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  // Only inspect tools that write files.
  if (!["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) {
    return emitAllow();
  }
  const path = input.file_path || input.path || "";
  if (!isMemoryFile(path)) return emitAllow();

  // Determine the proposed content. Different tools surface it differently.
  let content = "";
  if (tool === "Write") content = input.content || "";
  else if (tool === "Edit") content = input.new_string || "";
  else if (tool === "MultiEdit") {
    const edits = input.edits || [];
    content = edits.map((e) => e.new_string || "").join("\n");
  } else if (tool === "NotebookEdit") content = input.new_source || "";

  if (!content) return emitAllow();

  const result = checkMemoryWrite({
    content,
    transcriptPath: payload.transcript_path,
    sessionLookback: 5,
  });
  if (result.allowed) return emitAllow();
  return emit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: result.reason,
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMemoryHook().catch((err) => {
    process.stderr.write(`groundtruth memory-hook: fatal: ${err.message}\n`);
    process.exit(1);
  });
}
