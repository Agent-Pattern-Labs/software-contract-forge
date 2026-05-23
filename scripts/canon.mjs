#!/usr/bin/env node

import { createHash } from 'crypto';
import { readFlag } from '../lib/args.mjs';
import { slugify } from '../lib/text.mjs';

const [action = 'help', ...args] = process.argv.slice(2);

if (action === 'help' || action === '--help') {
  help();
  process.exit(0);
}

if (action === 'key') {
  const type = args.find((arg) => !arg.startsWith('--')) || 'opportunity';
  const url = readFlag(args, 'url');
  const source = readFlag(args, 'source');
  const buyer = readFlag(args, 'buyer');
  const title = readFlag(args, 'title');
  const value = readFlag(args, 'value');

  if (type === 'url') {
    console.log(`url:${urlKey(url || value)}`);
    process.exit(0);
  }
  if (type === 'buyer') {
    console.log(`buyer:${slugify(buyer || value)}`);
    process.exit(0);
  }
  if (type === 'source') {
    console.log(`source:${slugify(source || value)}`);
    process.exit(0);
  }
  if (type === 'opportunity') {
    const sourceKey = url ? urlKey(url) : slugify(source || 'manual');
    console.log(`opportunity:${sourceKey}:${slugify(buyer)}:${slugify(title)}`);
    process.exit(0);
  }
  console.error(`Unknown key type: ${type}`);
  process.exit(2);
}

if (action === 'compare') {
  const values = args.filter((arg) => !arg.startsWith('--'));
  if (values.length < 2) {
    console.error('Usage: software-contract-forge canon:compare VALUE_A VALUE_B');
    process.exit(1);
  }
  const [a, b] = values.map(slugify);
  console.log(a === b ? 'same' : a.includes(b) || b.includes(a) ? 'possible' : 'different');
  process.exit(0);
}

console.error(`Unknown canon action: ${action}`);
help();
process.exit(2);

function urlKey(value) {
  if (!value) return 'missing-url';
  try {
    const url = new URL(value);
    const normalized = `${url.hostname}${url.pathname}`.replace(/\/+$/, '');
    const slug = slugify(normalized).slice(0, 80);
    const hash = createHash('sha256').update(value).digest('hex').slice(0, 8);
    return `${slug}-${hash}`;
  } catch {
    return slugify(value);
  }
}

function help() {
  console.log(`software-contract-forge canon

Usage:
  software-contract-forge canon:key opportunity --url URL --buyer BUYER --title TITLE
  software-contract-forge canon:key buyer --buyer BUYER
  software-contract-forge canon:key source --source SOURCE
  software-contract-forge canon:compare VALUE_A VALUE_B`);
}
