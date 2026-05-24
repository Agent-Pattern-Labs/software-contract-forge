#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

import { hasFlag, readFlag } from '../lib/args.mjs';
import { opportunityKey } from '../lib/canon-key.mjs';
import { projectDir } from '../lib/paths.mjs';
import { slugify, tsvEscape } from '../lib/text.mjs';

const [action = 'help', ...args] = process.argv.slice(2);

if (action === 'help' || action === '--help' || action === '-h') {
  help();
  process.exit(0);
}

if (action !== 'prepare') {
  console.error(`Unknown batch action: ${action}`);
  help();
  process.exit(2);
}

const PROJECT_DIR = resolve(projectDir());
const pipelinePath = resolve(PROJECT_DIR, readFlag(args, 'pipeline', 'data/pipeline.md'));
const outputPath = resolve(PROJECT_DIR, readFlag(args, 'output', 'batch/batch-input.tsv'));
const limit = numberFlag(args, 'limit', 20);
const sourceFilter = new Set(readFlag(args, 'source').split(',').map((value) => value.trim()).filter(Boolean));
const includeChecked = hasFlag(args, 'include-checked');
const includeSettled = hasFlag(args, 'include-settled');
const dryRun = hasFlag(args, 'dry-run');
const append = hasFlag(args, 'append');
const quiet = hasFlag(args, 'quiet');
const format = readFlag(args, 'format', 'text');

if (!existsSync(pipelinePath)) {
  console.error(`Missing pipeline file: ${relativeProject(pipelinePath)}`);
  process.exit(1);
}

const settledUrls = includeSettled ? new Set() : readSettledUrls(PROJECT_DIR);
const allLeads = parsePipeline(readFileSync(pipelinePath, 'utf8'), {
  includeChecked,
  sourceFilter,
});
const skippedSettled = [];
const selected = [];

for (const lead of allLeads) {
  if (!includeSettled && settledUrls.has(normalizeUrl(lead.url))) {
    skippedSettled.push(lead);
    continue;
  }
  selected.push(lead);
  if (selected.length >= limit) break;
}

const rows = selected.map((lead, index) => ({
  ...lead,
  id: batchId(lead, index + 1, selected),
}));
const tsv = renderTsv(rows);

if (dryRun && format !== 'json') {
  process.stdout.write(tsv);
} else if (!dryRun) {
  mkdirSync(dirname(outputPath), { recursive: true });
  if (append && existsSync(outputPath)) {
    const existing = readFileSync(outputPath, 'utf8').replace(/\s*$/, '\n');
    const withoutHeader = tsv.split(/\r?\n/).slice(1).filter(Boolean).join('\n');
    writeFileSync(outputPath, withoutHeader ? `${existing}${withoutHeader}\n` : existing);
  } else {
    writeFileSync(outputPath, tsv);
  }
}

const summary = {
  projectDir: PROJECT_DIR,
  pipeline: relativeProject(pipelinePath),
  output: relativeProject(outputPath),
  totalPending: allLeads.length,
  selected: rows.length,
  skippedSettled: skippedSettled.length,
  limit,
  source: sourceFilter.size ? [...sourceFilter].join(',') : '',
  dryRun,
};

if (!quiet) {
  if (format === 'json') {
    console.log(JSON.stringify({ ...summary, rows }, null, 2));
  } else if (!dryRun) {
    console.log(`batch input ${append ? 'appended' : 'written'}: ${summary.output}`);
    console.log(`selected: ${summary.selected}; skipped settled: ${summary.skippedSettled}; pending parsed: ${summary.totalPending}`);
  }
}

function help() {
  console.log(`software-contract-forge batch

Usage:
  software-contract-forge batch:prepare [--limit N] [--source NAME[,NAME]] [--dry-run]

Options:
  --pipeline PATH        Pipeline markdown file. Defaults to data/pipeline.md.
  --output PATH          Batch TSV output. Defaults to batch/batch-input.tsv.
  --limit N              Maximum rows to write. Defaults to 20.
  --source NAME[,NAME]   Include only pipeline rows from matching sources.
  --append               Append rows instead of replacing the output file.
  --include-checked      Include checked pipeline rows.
  --include-settled      Include rows already settled in applications/tracker state.
  --dry-run              Print TSV to stdout instead of writing.
  --format json          Print a JSON summary.
  --quiet                Suppress text summary after writing.

Behavior:
  - Reads unchecked checklist rows from data/pipeline.md.
  - Extracts id, url, source, buyer, title, and notes into batch/batch-input.tsv.
  - Skips rows already settled in data/applications/ or batch/tracker-additions/ by default.`);
}

function parsePipeline(text, options) {
  const leads = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s+\[(?<checked>[ xX])\]\s+(?<body>.+?)\s*$/);
    if (!match) continue;
    if (!options.includeChecked && match.groups.checked.trim()) continue;

    const body = match.groups.body.trim();
    const url = field(body, 'url') || firstUrl(body);
    if (!url) continue;

    const source = field(body, 'source') || 'manual';
    if (options.sourceFilter.size && !options.sourceFilter.has(source)) continue;

    const buyer = field(body, 'buyer') || '';
    const title = field(body, 'title') || inferTitle(body, url);
    const notes = field(body, 'notes') || compactNotes(body);
    const key = field(body, 'key') || opportunityKey({ url, source, buyer, title });

    leads.push({ url, source, buyer, title, notes, key });
  }
  return leads;
}

function field(body, name) {
  const names = ['source', 'buyer', 'title', 'url', 'key', 'notes', 'due', 'score', 'status'];
  const boundary = names.filter((item) => item !== name).join('|');
  const pattern = new RegExp(`(?:^|\\|)\\s*${escapeRegExp(name)}:\\s*([\\s\\S]*?)(?=\\s*\\|\\s*(?:${boundary}):|$)`, 'i');
  return body.match(pattern)?.[1]?.trim() || '';
}

function firstUrl(body) {
  return body.match(/https?:\/\/[^\s|)]+/i)?.[0] || '';
}

function inferTitle(body, url) {
  const withoutUrl = body.replace(firstUrl(body), '').replace(/\s*\|\s*/g, ' ').trim();
  if (withoutUrl) return withoutUrl.slice(0, 120);
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() || url;
  } catch {
    return url;
  }
}

function compactNotes(body) {
  return body
    .replace(/(?:^|\|)\s*key:\s*[^|]+/i, '')
    .replace(/(?:^|\|)\s*url:\s*[^|]+/i, '')
    .replace(/\s*\|\s*/g, '; ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function renderTsv(rows) {
  const lines = ['id\turl\tsource\tnotes'];
  for (const row of rows) {
    const note = [row.buyer, row.title, row.notes].filter(Boolean).join(' | ');
    lines.push([row.id, row.url, row.source, note].map(tsvEscape).join('\t'));
  }
  return `${lines.join('\n')}\n`;
}

function batchId(lead, ordinal, selected) {
  const prefix = String(ordinal).padStart(2, '0');
  const base = slugify(`${lead.source} ${lead.title || lead.buyer || lead.url}`).slice(0, 56) || 'lead';
  let candidate = `${prefix}-${base}`;
  let suffix = 2;
  const seenBefore = new Set(selected.slice(0, ordinal - 1).map((item, index) => {
    const priorPrefix = String(index + 1).padStart(2, '0');
    const priorBase = slugify(`${item.source} ${item.title || item.buyer || item.url}`).slice(0, 56) || 'lead';
    return `${priorPrefix}-${priorBase}`;
  }));
  while (seenBefore.has(candidate)) {
    candidate = `${prefix}-${base.slice(0, 52)}-${suffix}`;
    suffix++;
  }
  return candidate;
}

function readSettledUrls(root) {
  const settled = new Set();
  for (const rel of ['data/applications', 'batch/tracker-additions']) {
    const dir = join(root, rel);
    if (!existsSync(dir)) continue;
    for (const file of walkFiles(dir)) {
      for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const cells = line.split('\t');
        if (cells.length < 6) continue;
        const url = cells[2]?.trim();
        const status = cells[5]?.trim();
        if (!url?.startsWith('http')) continue;
        if (isSettledStatus(status)) settled.add(normalizeUrl(url));
      }
    }
  }
  return settled;
}

function isSettledStatus(status) {
  return new Set(['proposal_drafted', 'applied', 'follow_up_due', 'won', 'lost', 'skipped', 'blocked']).has(status);
}

function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) out.push(...walkFiles(abs));
    else if (/\.(md|tsv|json)$/i.test(entry)) out.push(abs);
  }
  return out;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return String(value || '').trim().replace(/\/+$/, '');
  }
}

function numberFlag(args, name, fallback) {
  const value = Number(readFlag(args, name, String(fallback)));
  if (!Number.isFinite(value) || value < 0) {
    console.error(`Invalid --${name}: ${readFlag(args, name)}`);
    process.exit(1);
  }
  return Math.floor(value);
}

function relativeProject(abs) {
  return abs.startsWith(`${PROJECT_DIR}/`) ? abs.slice(PROJECT_DIR.length + 1) : abs;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
