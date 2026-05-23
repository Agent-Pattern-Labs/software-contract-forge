#!/usr/bin/env node

import { slugify } from '../lib/text.mjs';

const value = process.argv.slice(2).join(' ');
if (!value) {
  console.error('Usage: software-contract-forge slugify TEXT');
  process.exit(1);
}
console.log(slugify(value));
