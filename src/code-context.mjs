// src/code-context.mjs
//
// Code-context filter, tightened in 0.1.2.
//
// Earlier versions used a CODE_VOCAB list ("function", "class", "method",
// "argument", "return", "module", ...). Real-data audit showed that those
// words fire constantly in academic prose, so a paper-writing session was
// classified as "code context" and the filter suppressed nothing.
//
// This version only counts hard signals:
//   1. A tool call to Write, Edit, MultiEdit, NotebookEdit, or Bash, OR
//   2. A Read/Grep against a path that has a code-shaped extension, OR
//   3. A fenced code block in the assistant text (triple backticks).
//
// Everything else falls through to "not code context" and the gate stays
// silent. The cost: a code claim made in a turn that has no tool call in
// this turn AND no fenced block will be missed. The audit `--all` flag
// exists for users who want to see those.

const CODE_EXT = /\.(?:js|jsx|ts|tsx|mjs|cjs|cts|mts|py|rb|go|rs|java|kt|kts|scala|swift|c|cc|cpp|cxx|h|hpp|hxx|cs|fs|fsx|php|sh|bash|zsh|fish|sql|graphql|gql|proto|toml|yaml|yml|json|jsonl|ini|conf|cfg|html|css|scss|sass|less|vue|svelte|astro|elm|hs|lua|pl|pm|r|jl|dart|nim|zig|ex|exs|erl|clj|cljs|cljc|edn|tf|hcl|nix|sol|dockerfile|gitignore|gitattributes|lock|mod|sum)\b/i;

const STRONG_TOOLS = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Bash",
  "BashOutput",
]);

// Triple-backtick fenced block. Inline single-backticks are NOT enough:
// they appear in academic prose around quoted phrases, references, and
// inline code. Triple backticks are a stronger signal that real code is
// being shown.
const TRIPLE_FENCED = /```[\s\S]+?```/m;

/**
 * @param {string} text
 * @param {Array<{tool: string, input?: any, output?: string}>} observations
 * @returns {boolean}
 */
export function hasCodeContext(text, observations) {
  for (const obs of observations || []) {
    if (!obs || !obs.tool) continue;
    if (STRONG_TOOLS.has(obs.tool)) {
      // Bash always counts. Write/Edit/MultiEdit/NotebookEdit count if
      // the target path is code-shaped. We do not want a Write to
      // paper.tex or notes.md to count as code work.
      if (obs.tool === "Bash" || obs.tool === "BashOutput") return true;
      const p = obs.input?.file_path || obs.input?.path || "";
      if (typeof p === "string" && CODE_EXT.test(p)) return true;
    }
    if (obs.tool === "Read" || obs.tool === "Grep") {
      const p =
        obs.input?.file_path ||
        obs.input?.path ||
        obs.input?.glob ||
        "";
      if (typeof p === "string" && CODE_EXT.test(p)) return true;
    }
  }
  if (TRIPLE_FENCED.test(text || "")) return true;
  return false;
}

/**
 * Diagnostic. Returns the first matched signal (or null if none). Used by
 * `groundtruth audit --debug-context` to explain why a turn was kept or
 * suppressed.
 */
export function explainCodeContext(text, observations) {
  for (const obs of observations || []) {
    if (!obs || !obs.tool) continue;
    if (obs.tool === "Bash" || obs.tool === "BashOutput") {
      return { reason: "tool:Bash", detail: obs.input?.command?.slice(0, 80) || "" };
    }
    if (STRONG_TOOLS.has(obs.tool)) {
      const p = obs.input?.file_path || obs.input?.path || "";
      if (typeof p === "string" && CODE_EXT.test(p)) {
        return { reason: `tool:${obs.tool}`, detail: p };
      }
    }
    if (obs.tool === "Read" || obs.tool === "Grep") {
      const p =
        obs.input?.file_path || obs.input?.path || obs.input?.glob || "";
      if (typeof p === "string" && CODE_EXT.test(p)) {
        return { reason: `tool:${obs.tool}`, detail: p };
      }
    }
  }
  if (TRIPLE_FENCED.test(text || "")) {
    return { reason: "fenced-code-block", detail: "" };
  }
  return null;
}

export const _internals = {
  CODE_EXT,
  STRONG_TOOLS,
  TRIPLE_FENCED,
};
