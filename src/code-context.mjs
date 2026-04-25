// src/code-context.mjs
//
// Code-context filter.
//
// groundtruth's scope is code work. A turn whose text and tool observations
// have no code-related signals is out of scope, even if the prose contains
// a "complete" claim. This filter exists because real Claude Code sessions
// are routinely used for non-code work — paper writing, planning, summaries,
// research notes — where the agent legitimately says "the paper is ready"
// or "all citations resolved" without having touched code.
//
// We classify a turn as having code context if any of:
//   - Any tool call edits or reads code: Write, Edit, MultiEdit,
//     NotebookEdit, Bash, BashOutput, or a Read/Grep against a path with
//     a code-shaped extension.
//   - The assistant text contains a fenced code block.
//   - The assistant text mentions a path with a code-shaped extension.
//   - The assistant text uses code-shape vocabulary common to programming.
//
// The filter is intentionally permissive: when in doubt, count the turn
// as code context. The cost of a false positive is one wasted block; the
// cost of a false negative is a missed unverified completion claim. The
// filter exists to suppress sessions that have clearly nothing to do with
// code at all.

const CODE_EXT = /\.(?:js|jsx|ts|tsx|mjs|cjs|cts|mts|py|rb|go|rs|java|kt|kts|scala|swift|m|mm|c|cc|cpp|cxx|h|hpp|hxx|cs|fs|fsx|php|sh|bash|zsh|fish|sql|graphql|gql|proto|toml|yaml|yml|json|jsonl|ini|conf|cfg|html|css|scss|sass|less|vue|svelte|astro|elm|hs|lua|pl|pm|r|jl|dart|nim|zig|ex|exs|erl|clj|cljs|cljc|edn|tf|hcl|nix|sol|move|dockerfile|gitignore|gitattributes|env|lock|mod|sum)\b/i;

const TOOL_NAMES_THAT_IMPLY_CODE = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Bash",
  "BashOutput",
]);

const CODE_VOCAB = /\b(?:function|class|interface|struct|enum|trait|impl|def|fn|return|import|export|module|package|require|namespace|const|let|var|public|private|protected|static|async|await|await\b|throw|catch|try|finally|extends|implements|new|this|self|super|true|false|null|undefined|None|nil|TypeScript|JavaScript|Python|Go|Rust|repository|filename|stack trace|stacktrace|exception|method|argument|parameter|callback|promise|coroutine|goroutine|generic|nullable|generics|traceback|exit code|stdout|stderr)\b/i;

const FILE_PATH_HINT = /(?:^|[\s(`'"])(?:\.\.?\/|\/|~\/|[A-Za-z]:\\)?[\w./-]+\.[A-Za-z0-9]{1,8}\b/;

const CODE_FENCED_BLOCK = /```[\s\S]+?```|`[^`\n]+`/;

const SHELL_HINT = /\$\s+\S|\b(?:npm|pnpm|yarn|bun|node|deno|tsc|cargo|rustc|gcc|clang|make|cmake|gradle|mvn|pip|pipenv|poetry|uv|pytest|jest|vitest|mocha|tap|rspec|gtest|go\s+(?:test|build|run))\b/i;

/**
 * @param {string} text  Assistant text for a single logical turn.
 * @param {Array<{tool: string, input?: any, output?: string}>} observations
 * @returns {boolean}
 */
export function hasCodeContext(text, observations) {
  // Strong signals from tool use.
  for (const obs of observations || []) {
    if (!obs || !obs.tool) continue;
    if (TOOL_NAMES_THAT_IMPLY_CODE.has(obs.tool)) return true;
    if (obs.tool === "Read" || obs.tool === "Grep") {
      const p =
        obs.input?.file_path ||
        obs.input?.path ||
        obs.input?.glob ||
        "";
      if (typeof p === "string" && CODE_EXT.test(p)) return true;
    }
  }
  const t = text || "";
  if (!t) return false;
  if (CODE_FENCED_BLOCK.test(t)) return true;
  if (SHELL_HINT.test(t)) return true;
  if (CODE_EXT.test(t)) return true;
  if (FILE_PATH_HINT.test(t)) return true;
  if (CODE_VOCAB.test(t)) return true;
  return false;
}

export const _internals = {
  CODE_EXT,
  CODE_VOCAB,
  FILE_PATH_HINT,
  CODE_FENCED_BLOCK,
  SHELL_HINT,
  TOOL_NAMES_THAT_IMPLY_CODE,
};
