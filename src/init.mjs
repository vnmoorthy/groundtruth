// src/init.mjs
//
// `groundtruth init` — scaffolds a starter .groundtruthrc.json with
// commented-out examples. Lowers the barrier to using the per-user
// customization feature added in v0.1.4.
//
// By default writes to ~/.groundtruthrc.json. Pass --here to write to
// ./groundtruthrc.json in the current directory instead.

import { writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const TEMPLATE = `{
  "_doc": "groundtruth user config. See https://github.com/vnmoorthy/groundtruth#configuration for the schema. Remove any keys you don't want.",

  "exclude_patterns": [
    "_____ ADD ANY OF THESE EXAMPLES TO SUPPRESS THESE FALSE POSITIVES IN YOUR PROSE ____",
    "vibes? (?:are|is) good",
    "feels (?:done|complete|ready)",
    "the team is ready for the demo",
    "lecture (?:notes|slides) are ready",
    "podcast episode is ready"
  ],

  "exclude_paths": [
    "**/observer-sessions/**",
    "**/scratch/**"
  ],

  "extra_test_commands": [
    "vendor/bin/phpunit",
    "bundle exec rake test"
  ],

  "extra_build_commands": [
    "make ci",
    "scripts/release.sh"
  ]
}
`;

const INIT_HELP = `groundtruth init: scaffold a starter .groundtruthrc.json

usage:
  groundtruth init [--here] [--force]

flags:
  --here, .                       Write to ./.groundtruthrc.json (default: ~/.groundtruthrc.json)
  --force, -f                     Overwrite an existing config file
  --help, -h                      Show this message

The starter file documents the exclude_patterns / exclude_paths /
extra_test_commands / extra_build_commands schema with examples.
`;

export async function runInit(args) {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(INIT_HELP);
    process.exit(0);
  }
  const here = args.includes("--here");
  const force = args.includes("--force") || args.includes("-f");
  const target = here ? resolve(".groundtruthrc.json") : join(homedir(), ".groundtruthrc.json");

  if (existsSync(target) && !force) {
    process.stderr.write(
      `groundtruth init: ${target} already exists.\n` +
        `  Pass --force to overwrite, or edit it directly.\n`,
    );
    process.exit(2);
  }

  writeFileSync(target, TEMPLATE);
  process.stdout.write(`groundtruth init: wrote starter config to ${target}\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`Edit it to add your own exclusion patterns. Then re-run \`groundtruth audit\` to see the effect.\n`);
  process.exit(0);
}
