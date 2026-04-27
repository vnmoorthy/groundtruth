#!/usr/bin/env node
// bin/groundtruth.mjs
//
// Single entry point for the groundtruth CLI. Subcommands:
//   groundtruth audit [path...]   Scan session JSONL files for unverified claims
//   groundtruth check <file>      Check a single session file, exit non-zero if findings
//   groundtruth hook              Read Stop hook JSON from stdin, block if unverified
//   groundtruth install           Register the Stop hook in ~/.claude/settings.json
//   groundtruth uninstall         Remove the Stop hook
//   groundtruth status            Show install status and gstack/superpowers composition
//   groundtruth version           Print version

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { auditSessions, renderReport, renderReportJson, renderReportSarif, discoverFromArgs } from "../src/audit.mjs";
import { runHook } from "../src/hook-entry.mjs";
import { installHook, uninstallHook, showStatus } from "../src/install.mjs";
import { runMemoryCheck } from "../src/memory-gate.mjs";
import { runStats } from "../src/stats.mjs";
import { runReplay } from "../src/replay.mjs";
import { runMemoryHook } from "../src/memory-hook-entry.mjs";
import { runDoctor } from "../src/doctor.mjs";
import { runInit } from "../src/init.mjs";
import { runBench } from "../src/bench.mjs";
import { runFixtureAdd } from "../src/fixture-add.mjs";
import { runListPatterns } from "../src/list-patterns.mjs";
import { runDemo } from "../src/demo.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function loadVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const USAGE = `groundtruth v${loadVersion()}: a completion-claim gate for Claude Code

usage:
  groundtruth audit [path...]     Scan session JSONL files. Default: ~/.claude/projects
  groundtruth check <file>        Check one session file; exit 1 if findings
  groundtruth hook                Run as Stop hook (reads JSON from stdin)
  groundtruth memory-check <p>    Check a proposed memory file write
  groundtruth install             Register the Stop hook in ~/.claude/settings.json
  groundtruth uninstall           Remove the Stop hook
  groundtruth status              Show install status, composition
  groundtruth version             Print version

diagnostics:
  groundtruth doctor              Check environment and surface fixable warnings
  groundtruth demo                Walk through the gate firing on a real-shaped session
  groundtruth list-patterns       Print every claim frame and exclusion pattern
  groundtruth bench               Time the audit across recent sessions
  groundtruth stats               Summarize claims/verifications across recent sessions
  groundtruth replay <file>       Replay a session JSONL turn-by-turn
  groundtruth init [--here]       Scaffold a starter .groundtruthrc.json
  groundtruth fixture add <text>  Capture a sentence as a regression fixture

audit flags:
  --json                          Emit JSON
  --sarif                         Emit SARIF 2.1.0 for CI integrations (GitHub code scanning, etc.)
  --limit N                       Max session files to scan (default 20)
  --no-color                      Disable ANSI color output
  --fail-on <N>                   Exit non-zero only if findings >= N (default 1)

memory-check flags:
  --content <text>                Inline content instead of reading a file
  --transcript <path>             Session JSONL to verify against
  --lookback N                    How many recent assistant turns to check (default 5)

install flags:
  --dry-run                       Print what would happen without writing
  --no-skill / --no-hook          Skip skill copy / hook registration
  --with-memory-gate              Also register the PreToolUse memory hook

examples:
  groundtruth audit
  groundtruth audit ~/.claude/projects/my-project
  groundtruth audit ~/.claude/projects/my-project/*.jsonl --json
  groundtruth check test/fixtures/unverified-claim.jsonl
  groundtruth memory-check MEMORY.md --transcript ~/.claude/projects/x/y.jsonl
  groundtruth doctor
`;

function parseFlags(args) {
  const flags = {
    json: false,
    sarif: false,
    limit: 20,
    failOn: 1,
    color: null,
    includeNonCode: false,
    explain: false,
  };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") flags.json = true;
    else if (a === "--sarif") flags.sarif = true;
    else if (a === "--all" || a === "--include-non-code") flags.includeNonCode = true;
    else if (a === "--explain" || a === "-e") flags.explain = true;
    else if (a === "--limit") {
      const n = parseInt(args[++i], 10);
      if (!Number.isNaN(n) && n > 0) flags.limit = n;
    } else if (a === "--fail-on") {
      const n = parseInt(args[++i], 10);
      if (!Number.isNaN(n) && n >= 0) flags.failOn = n;
    } else if (a === "--no-color") {
      process.env.NO_COLOR = "1";
    } else if (a === "--color") {
      process.env.FORCE_COLOR = "1";
    } else if (a === "-h" || a === "--help") {
      positional.push("help");
    } else if (a.startsWith("--")) {
      process.stderr.write(
        `groundtruth: unknown flag: ${a}\n` +
          "  Why: not recognized by the current subcommand's flag parser.\n" +
          "  Fix: run `groundtruth --help` for the global flag list, or\n" +
          "       `groundtruth <subcommand> --help` for subcommand-specific flags.\n",
      );
      process.exit(2);
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case "audit": {
      const { flags, positional } = parseFlags(rest);
      const files = discoverFromArgs(positional).slice(0, flags.limit);
      const report = auditSessions(files, { includeNonCode: flags.includeNonCode });
      if (flags.sarif) {
        process.stdout.write(renderReportSarif(report) + "\n");
      } else if (flags.json) {
        process.stdout.write(renderReportJson(report) + "\n");
      } else {
        process.stdout.write(renderReport(report, { explain: flags.explain }) + "\n");
      }
      process.exit(report.findings.length >= flags.failOn ? 1 : 0);
      break;
    }
    case "check": {
      const { flags, positional } = parseFlags(rest);
      if (positional.length === 0) {
        process.stderr.write(
          "groundtruth check: a file path is required.\n" +
            "  Why: `check` is the CI gate variant; it inspects exactly the file(s) you name.\n" +
            "  Fix: pass a session JSONL, e.g.\n" +
            "       groundtruth check ~/.claude/projects/<hash>/<session>.jsonl\n" +
            "       Use `groundtruth audit` (no path) for the recent-sessions sweep.\n",
        );
        process.exit(2);
      }
      // For check (a CI gate), missing or empty input is a misuse, not a pass.
      // discoverFromArgs writes to stderr and skips bad paths; we count what
      // it accepted versus what was requested and refuse to silently pass.
      const files = discoverFromArgs(positional);
      if (files.length === 0) {
        process.stderr.write(
          `groundtruth check: no session JSONL files matched ${positional.length === 1 ? "the supplied path" : "the supplied paths"}.\n` +
            "  Pass an existing .jsonl file, or a directory containing one.\n",
        );
        process.exit(2);
      }
      const report = auditSessions(files, { includeNonCode: flags.includeNonCode });
      process.stdout.write(renderReport(report, { footer: false, explain: flags.explain }) + "\n");
      if (report.total_turns === 0) {
        process.stderr.write(
          `groundtruth check: scanned ${report.files_scanned} file(s) but parsed 0 assistant turns.\n` +
            "  This usually means the file is not a Claude Code session JSONL.\n",
        );
        process.exit(2);
      }
      process.exit(report.findings.length > 0 ? 1 : 0);
      break;
    }
    case "hook": {
      await runHook();
      break;
    }
    case "memory-hook": {
      await runMemoryHook();
      break;
    }
    case "memory-check": {
      await runMemoryCheck(rest);
      break;
    }
    case "stats": {
      await runStats(rest);
      break;
    }
    case "replay": {
      await runReplay(rest);
      break;
    }
    case "doctor": {
      await runDoctor(rest, { repoRoot: REPO_ROOT });
      break;
    }
    case "init": {
      await runInit(rest);
      break;
    }
    case "bench": {
      await runBench(rest);
      break;
    }
    case "fixture": {
      const sub = rest[0];
      if (sub === "add") {
        await runFixtureAdd(rest.slice(1));
      } else {
        process.stderr.write(
          `groundtruth fixture: subcommand required.\n` +
            `  Why: \`fixture\` is a namespace; \`add\` is the only subcommand currently.\n` +
            "  Fix: run `groundtruth fixture add \"<sentence that fired or was missed>\"`\n" +
            "       or `groundtruth fixture add --help` for the full flag list.\n",
        );
        process.exit(2);
      }
      break;
    }
    case "list-patterns":
    case "patterns": {
      await runListPatterns(rest);
      break;
    }
    case "demo": {
      await runDemo();
      break;
    }
    case "install": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(`groundtruth install: register the Stop hook in ~/.claude/settings.json

usage:
  groundtruth install [flags]

flags:
  --dry-run                       Print what would happen without writing
  --no-skill                      Skip copying the skill into ~/.claude/skills/
  --no-hook                       Skip registering the Stop hook in settings.json
  --with-memory-gate              Also register the PreToolUse memory hook
  --help, -h                      Show this message
`);
        process.exit(0);
      }
      const opts = {
        dryRun: rest.includes("--dry-run"),
        noSkill: rest.includes("--no-skill"),
        noHook: rest.includes("--no-hook"),
        withMemoryGate: rest.includes("--with-memory-gate"),
      };
      await installHook({ repoRoot: REPO_ROOT, opts });
      break;
    }
    case "uninstall": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(`groundtruth uninstall: remove the Stop hook from ~/.claude/settings.json

usage:
  groundtruth uninstall

  Removes any hook entries whose command contains 'groundtruth' from both the
  Stop and PreToolUse arrays, and deletes ~/.claude/skills/groundtruth/.
  Backs up settings.json before writing.
`);
        process.exit(0);
      }
      await uninstallHook();
      break;
    }
    case "status": {
      await showStatus({ repoRoot: REPO_ROOT });
      break;
    }
    case "version":
    case "--version":
    case "-v": {
      process.stdout.write(`${loadVersion()}\n`);
      process.exit(0);
      break;
    }
    case "help":
    case "--help":
    case "-h": {
      process.stdout.write(USAGE);
      process.exit(0);
      break;
    }
    default: {
      process.stderr.write(`groundtruth: unknown command: ${cmd}\n\n`);
      process.stderr.write(USAGE);
      process.exit(2);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`groundtruth: fatal: ${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
