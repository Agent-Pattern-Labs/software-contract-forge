#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const PROJECT_DIR = process.env.SOFTWARE_CONTRACT_FORGE_PROJECT || process.cwd();

const [, , cmd = 'help', ...rest] = process.argv;

const commands = {
  sync: 'bin/sync.mjs',
  validate: 'scripts/check-structure.mjs',
  scan: 'scripts/scan.mjs',
  today: 'scripts/today.mjs',
  slugify: 'scripts/slugify.mjs',
  'contract-line': 'scripts/contract-line.mjs',
};

const grouped = {
  score: 'scripts/score.mjs',
  canon: 'scripts/canon.mjs',
  batch: 'scripts/batch.mjs',
  portal: 'scripts/portal.mjs',
};

function printHelp() {
  console.log(`software-contract-forge -- agentic harness for software contract opportunities

Usage:
  software-contract-forge <command> [args...]

Commands:
  sync                  Re-create harness symlinks in the current consumer project
  validate              Check required harness files and parse JSON templates
  scan                  Discover leads from enabled public sources
  today                 Print today's date in YYYY-MM-DD
  slugify TEXT          Convert text to a stable slug
  contract-line         Render a TSV application/opportunity row
  batch:prepare         Create batch/batch-input.tsv from pending pipeline rows
  portal:preflight      Inspect public ATS forms for user-review blockers
  portal:handoff        Open headed browser for user-side portal/security completion and record outcome
  score:explain         Show score dimensions and gates
  score:compute         Compute weighted score from JSON
  score:check           Validate score JSON against local gates
  score:gate            Check one score gate
  canon:key             Print a stable opportunity/source/buyer key
  canon:compare         Compare two normalized identifiers

Examples:
  software-contract-forge slugify "Acme Platform Migration"
  software-contract-forge scan --source weworkremotely-programming --limit 10
  software-contract-forge batch:prepare --limit 20 --source g2i-ashby
  software-contract-forge portal:preflight --input batch/batch-input.tsv --format json
  software-contract-forge portal:handoff --url https://example.test/jobs/123 --out reports/handoff.json
  software-contract-forge canon:key opportunity --url https://example.test/rfp/123 --buyer "Acme" --title "Node.js API migration"
  software-contract-forge contract-line --source "manual" --url https://example.test --buyer "Acme" --title "API Migration" --status discovered
  software-contract-forge score:gate --gate apply --input reports/acme-score.json

Project directory resolves to $SOFTWARE_CONTRACT_FORGE_PROJECT or cwd.`);
}

if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  printHelp();
  process.exit(0);
}

const [groupName, groupAction] = cmd.split(':');
if (grouped[groupName]) {
  run(grouped[groupName], [groupAction ?? 'help', ...rest]);
}

if (commands[cmd]) {
  run(commands[cmd], rest);
}

console.error(`Unknown command: ${cmd}\n`);
printHelp();
process.exit(2);

function run(rel, args) {
  const script = join(PKG_ROOT, rel);
  if (!existsSync(script)) {
    console.error(`Internal error: missing ${rel}`);
    process.exit(2);
  }

  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: PROJECT_DIR,
    env: process.env,
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}
