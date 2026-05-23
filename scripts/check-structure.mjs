#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const root = resolve(new URL('..', import.meta.url).pathname);
const required = [
  'package.json',
  'package-lock.json',
  'AGENTS.md',
  'bin/software-contract-forge.mjs',
  'bin/create-software-contract-forge.mjs',
  'bin/sync.mjs',
  'lib/canon-key.mjs',
  'iso/instructions.md',
  'iso/instructions.opencode.md',
  'iso/mcp.json',
  'iso/config.json',
  'iso/commands/software-contract-forge.md',
  'iso/agents/general-free.md',
  'iso/agents/general-paid.md',
  'iso/agents/glm-minimal.md',
  'models.yaml',
  'modes/_shared.md',
  'modes/scan.md',
  'modes/qualify.md',
  'modes/apply.md',
  'modes/proposal.md',
  'modes/pipeline.md',
  'modes/batch.md',
  'modes/tracker.md',
  'modes/followup.md',
  'scripts/scan.mjs',
  'templates/states.yml',
  'templates/contracts.json',
  'templates/capabilities.json',
  'templates/context.json',
  'templates/score.json',
  'templates/migrations.json',
  'config/client-profile.example.yml',
  'templates/sources.example.yml',
];

const jsonFiles = [
  'package.json',
  'iso/mcp.json',
  'iso/config.json',
  'templates/contracts.json',
  'templates/capabilities.json',
  'templates/context.json',
  'templates/score.json',
  'templates/migrations.json',
];

const missing = required.filter((rel) => !existsSync(join(root, rel)));
const invalid = [];
for (const rel of jsonFiles) {
  try {
    JSON.parse(readFileSync(join(root, rel), 'utf8'));
  } catch (error) {
    invalid.push(`${rel}: ${error.message}`);
  }
}

if (missing.length || invalid.length) {
  if (missing.length) console.error(`Missing files:\n${missing.map((file) => `  - ${file}`).join('\n')}`);
  if (invalid.length) console.error(`Invalid JSON:\n${invalid.map((file) => `  - ${file}`).join('\n')}`);
  process.exit(1);
}

console.log(`software-contract-forge structure ok (${required.length} required files)`);
