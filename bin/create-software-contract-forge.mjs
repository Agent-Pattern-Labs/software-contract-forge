#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const help = args.includes('--help') || args.includes('-h');
const target = args.find((arg) => !arg.startsWith('--'));

if (help || !target) {
  console.log(`create-software-contract-forge -- scaffold a consumer project

Usage:
  create-software-contract-forge <dir> [--force]

After scaffolding:
  cd <dir>
  npm install
  edit config/client-profile.yml
  edit config/sources.yml
  add leads to data/pipeline.md`);
  process.exit(help ? 0 : 1);
}

const targetDir = resolve(target);
const name = basename(targetDir);
if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

write('package.json', JSON.stringify({
  name,
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: {
    sync: 'software-contract-forge sync',
    validate: 'software-contract-forge validate',
    today: 'software-contract-forge today',
    'score:explain': 'software-contract-forge score:explain',
    'update-harness': 'npm update software-contract-forge && software-contract-forge sync',
  },
  dependencies: {
    'software-contract-forge': '^0.1.0',
  },
  engines: {
    node: '>=20.6.0',
  },
}, null, 2) + '\n');

write('opencode.json', JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  instructions: [
    'AGENTS.harness.md',
    '.opencode/instructions.md',
    'templates/states.yml',
    'modes/_shared.md',
    'config/client-profile.yml',
  ],
  mcp: {
    geometra: {
      type: 'local',
      command: ['npx', '-y', '@geometra/mcp@1.61.3'],
      enabled: true,
    },
    gmail: {
      type: 'local',
      command: ['npx', '-y', '@razroo/gmail-mcp'],
      enabled: true,
      environment: { DISABLE_HTTP: 'true' },
    },
  },
}, null, 2) + '\n');

write('AGENTS.md', `# ${name} Agent Overrides

This project uses the shared software-contract-forge harness. Read \`AGENTS.harness.md\` first, then apply local overrides from this file.

Local data stays private in this consumer project. Do not paste credentials, portal tokens, client financials, or raw buyer contact lists into subagent prompts unless a mode explicitly requires a file-backed reference.
`);

copy('config/client-profile.example.yml', 'config/client-profile.yml');
copy('templates/sources.example.yml', 'config/sources.yml');

write('data/pipeline.md', `# Contract Pipeline

Add candidate contract URLs or short lead notes here.

- [ ] https://example.test/opportunity/123 -- Replace with a real source URL
`);

write('data/applications/README.md', `# Applications

Application and proposal outcomes are written here by date.
`);

write('reports/README.md', `# Reports

Qualification reports and proposal drafts are written here.
`);

write('batch/batch-input.tsv', 'id\turl\tsource\tnotes\n');
write('batch/tracker-additions/README.md', `# Tracker Additions

Workers can write TSV rows here before merge/check steps.
`);

write('.gitignore', `node_modules/
.state-trace/
.software-contract-forge-cache/
.software-contract-forge-ledger/
.software-contract-forge-runs/
reports/*.md
data/raw/
data/cache/
config/client-profile.yml
config/sources.yml
*.local.yml
`);

write('README.md', `# ${name}

Consumer project for software-contract-forge.

1. Fill in \`config/client-profile.yml\`.
2. Fill in \`config/sources.yml\`.
3. Add leads to \`data/pipeline.md\`.
4. Run \`npm install\` to sync harness files.
5. Start your agent runtime and route work through the software-contract-forge command/modes.
`);

console.log(`\nScaffolded ${targetDir}`);
console.log('\nNext commands:');
console.log(`  cd ${targetDir}`);
console.log('  npm install');
console.log('  edit config/client-profile.yml config/sources.yml');

function write(rel, content) {
  const abs = join(targetDir, rel);
  if (existsSync(abs) && !force) {
    console.log(`skip: ${rel} (exists)`);
    return;
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  console.log(`create: ${rel}`);
}

function copy(srcRel, dstRel) {
  const src = join(PKG_ROOT, srcRel);
  const dst = join(targetDir, dstRel);
  if (!existsSync(src)) {
    console.log(`skip: ${dstRel} (${srcRel} missing)`);
    return;
  }
  if (existsSync(dst) && !force) {
    console.log(`skip: ${dstRel} (exists)`);
    return;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`create: ${dstRel}`);
}
