#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { readFlag } from '../lib/args.mjs';

const [action = 'help', ...args] = process.argv.slice(2);
const root = resolve(process.env.SOFTWARE_CONTRACT_FORGE_ROOT || join(new URL('..', import.meta.url).pathname));
const policyPath = join(root, 'templates', 'score.json');
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));

if (action === 'help' || action === '--help') {
  help();
  process.exit(0);
}

if (action === 'explain') {
  console.log(JSON.stringify(policy, null, 2));
  process.exit(0);
}

if (action === 'compute' || action === 'check' || action === 'gate') {
  const input = readFlag(args, 'input');
  if (!input || !existsSync(input)) {
    console.error('Missing --input score JSON');
    process.exit(1);
  }
  const score = JSON.parse(readFileSync(input, 'utf8'));
  const total = compute(score);
  const result = { ...score, total };

  if (action === 'compute') {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  const problems = validate(score, total);
  if (action === 'check') {
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log(`score ok: ${total.toFixed(2)}`);
    process.exit(0);
  }

  const gate = readFlag(args, 'gate', 'apply');
  const threshold = policy.gates?.[gate];
  if (typeof threshold !== 'number') {
    console.error(`Unknown gate "${gate}". Known gates: ${Object.keys(policy.gates || {}).join(', ')}`);
    process.exit(2);
  }
  const pass = problems.length === 0 && total >= threshold;
  console.log(JSON.stringify({ gate, threshold, total, pass, problems }, null, 2));
  process.exit(pass ? 0 : 1);
}

console.error(`Unknown score action: ${action}`);
help();
process.exit(2);

function compute(score) {
  const dimensions = score.dimensions || score;
  let total = 0;
  for (const [name, config] of Object.entries(policy.dimensions)) {
    const value = Number(dimensions[name]);
    if (!Number.isFinite(value)) continue;
    total += value * Number(config.weight);
  }
  return Math.round(total * 100) / 100;
}

function validate(score, total) {
  const problems = [];
  const dimensions = score.dimensions || score;
  for (const name of Object.keys(policy.dimensions)) {
    const value = Number(dimensions[name]);
    if (!Number.isFinite(value)) problems.push(`missing numeric dimension: ${name}`);
    else if (value < 0 || value > 5) problems.push(`dimension out of range 0..5: ${name}`);
  }
  if (score.total !== undefined && Math.abs(Number(score.total) - total) > 0.01) {
    problems.push(`reported total ${score.total} does not match computed ${total}`);
  }
  return problems;
}

function help() {
  console.log(`software-contract-forge score

Usage:
  software-contract-forge score:explain
  software-contract-forge score:compute --input score.json
  software-contract-forge score:check --input score.json
  software-contract-forge score:gate --gate apply --input score.json`);
}
