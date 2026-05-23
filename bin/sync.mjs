#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const PROJECT_DIR = process.env.SOFTWARE_CONTRACT_FORGE_PROJECT || process.env.INIT_CWD || process.cwd();

if (PROJECT_DIR === PKG_ROOT || isHarnessRoot(PROJECT_DIR)) {
  console.log('software-contract-forge sync: skipping inside harness repo.');
  process.exit(0);
}

const links = [
  { src: 'AGENTS.md', dst: 'AGENTS.harness.md' },
  { src: 'CLAUDE.md', dst: 'CLAUDE.harness.md' },
  { src: '.mcp.json', dst: '.mcp.json' },
  { src: '.codex/config.toml', dst: '.codex/config.toml' },
  { src: '.claude/agents', dst: '.claude/agents' },
  { src: '.claude/settings.json', dst: '.claude/settings.json' },
  { src: '.claude/iso-route.resolved.json', dst: '.claude/iso-route.resolved.json' },
  { src: '.cursor/mcp.json', dst: '.cursor/mcp.json' },
  { src: '.cursor/rules', dst: '.cursor/rules' },
  { src: '.cursor/iso-route.md', dst: '.cursor/iso-route.md' },
  { src: '.opencode/instructions.md', dst: '.opencode/instructions.md' },
  { src: '.opencode/skills/software-contract-forge.md', dst: '.opencode/skills/software-contract-forge.md' },
  { src: '.opencode/agents', dst: '.opencode/agents' },
  { src: 'models.yaml', dst: 'models.yaml' },
  { src: 'modes', dst: 'modes' },
  { src: 'templates', dst: 'templates' },
  { src: 'batch/batch-prompt.md', dst: 'batch/batch-prompt.md' },
  { src: 'batch/batch-runner.sh', dst: 'batch/batch-runner.sh' },
  { src: 'batch/README.md', dst: 'batch/README.md' },
];

let created = 0;
let current = 0;
let warned = 0;

for (const link of links) {
  const src = join(PKG_ROOT, link.src);
  const dst = join(PROJECT_DIR, link.dst);
  if (!existsSync(src)) {
    console.warn(`skip: ${link.src} missing in harness`);
    warned++;
    continue;
  }

  mkdirSync(dirname(dst), { recursive: true });
  const state = stat(dst);
  if (state) {
    if (state.isSymbolicLink()) {
      const actual = readlinkSync(dst);
      const expected = relative(dirname(dst), src);
      if (actual === expected || resolve(dirname(dst), actual) === src) {
        current++;
      } else {
        console.warn(`warn: ${link.dst} points elsewhere; leaving it alone`);
        warned++;
      }
      continue;
    }
    console.warn(`warn: ${link.dst} already exists as a real file or directory; leaving it alone`);
    warned++;
    continue;
  }

  const type = lstatSync(src).isDirectory() ? 'dir' : 'file';
  symlinkSync(relative(dirname(dst), src), dst, type);
  console.log(`linked: ${link.dst}`);
  created++;
}

try {
  if (patchOpencode()) created++;
} catch (error) {
  console.warn(`warn: could not patch opencode.json: ${error instanceof Error ? error.message : String(error)}`);
  warned++;
}

console.log(`software-contract-forge sync: ${created} created, ${current} up-to-date, ${warned} warnings`);

function stat(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function isHarnessRoot(root) {
  const pkg = join(root, 'package.json');
  if (!existsSync(pkg)) return false;
  try {
    return JSON.parse(readFileSync(pkg, 'utf8')).name === 'software-contract-forge';
  } catch {
    return false;
  }
}

function patchOpencode() {
  const path = join(PROJECT_DIR, 'opencode.json');
  if (!existsSync(path)) return false;
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const required = ['AGENTS.harness.md', '.opencode/instructions.md', 'templates/states.yml', 'modes/_shared.md'];
  const currentInstructions = Array.isArray(config.instructions)
    ? config.instructions
    : config.instructions
      ? [config.instructions]
      : [];
  const next = [...new Set([...required, ...currentInstructions])];
  if (JSON.stringify(next) === JSON.stringify(currentInstructions)) return false;
  config.instructions = next;
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
  console.log('updated: opencode.json instructions');
  return true;
}
