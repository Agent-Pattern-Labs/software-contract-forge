#!/usr/bin/env node

import { readFlag } from '../lib/args.mjs';
import { today, tsvEscape } from '../lib/text.mjs';

const args = process.argv.slice(2);
const status = readFlag(args, 'status', 'discovered');
const allowed = new Set(['discovered', 'qualified', 'proposal_drafted', 'applied', 'follow_up_due', 'won', 'lost', 'skipped', 'blocked']);

if (!allowed.has(status)) {
  console.error(`Invalid status "${status}". Allowed: ${[...allowed].join(', ')}`);
  process.exit(1);
}

const row = [
  readFlag(args, 'date', today()),
  readFlag(args, 'source', 'manual'),
  readFlag(args, 'url'),
  readFlag(args, 'buyer'),
  readFlag(args, 'title'),
  status,
  readFlag(args, 'score'),
  readFlag(args, 'due'),
  readFlag(args, 'owner'),
  readFlag(args, 'notes'),
].map(tsvEscape).join('\t');

console.log(row);
