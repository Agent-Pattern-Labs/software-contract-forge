#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { chromium } from 'playwright';

import { hasFlag, readFlag } from '../lib/args.mjs';
import { projectDir } from '../lib/paths.mjs';

const [action = 'help', ...args] = process.argv.slice(2);

if (action === 'help' || action === '--help' || action === '-h' || hasFlag(args, 'help') || hasFlag(args, 'h')) {
  help();
  process.exit(0);
}

if (action !== 'preflight') {
  console.error(`Unknown portal action: ${action}`);
  help();
  process.exit(2);
}

const PROJECT_DIR = resolve(projectDir());
const inputPath = readFlag(args, 'input', 'batch/batch-input.tsv');
const singleUrl = readFlag(args, 'url');
const limit = numberFlag(args, 'limit', singleUrl ? 1 : 20);
const format = readFlag(args, 'format', 'text');
const headless = !hasFlag(args, 'headed');
const timeoutMs = numberFlag(args, 'timeout-ms', 15000);
const waitMs = numberFlag(args, 'wait-ms', 1500);
const browserExecutable = readFlag(args, 'browser-executable') || defaultChromeExecutable();
const resumeValue = readFlag(args, 'resume') || findDefaultResume(PROJECT_DIR);
const resumePath = resumeValue ? resolve(PROJECT_DIR, resumeValue) : '';

const rows = singleUrl
  ? [{ id: 'url', url: singleUrl, source: readFlag(args, 'source', 'manual'), notes: readFlag(args, 'notes') }]
  : readBatchRows(resolve(PROJECT_DIR, inputPath)).slice(0, limit);

if (!rows.length) {
  console.error(singleUrl ? 'No URL provided.' : `No rows found in ${relativeProject(resolve(PROJECT_DIR, inputPath))}.`);
  process.exit(1);
}

const REVIEW_REQUIRED_PATTERNS = [
  [/\b(visa|sponsor|sponsorship|work authorization|authorized to work|employment authorization)\b/i, 'work authorization or visa sponsorship answer required'],
  [/\b(us citizen|u\.s\. citizen|citizenship|clearance|government representation)\b/i, 'citizenship/government representation required'],
  [/\b(background check|identity verification|id verification)\b/i, 'background or identity verification answer required'],
  [/\b(hourly rate|desired rate|salary|compensation|base salary|pay expectation|salary expectation)\b/i, 'binding compensation answer required'],
  [/\b(start date|available date|availability date|notice period|lead time|weekly capacity|hours per week|hours\/week)\b/i, 'start date or availability commitment required'],
  [/\b(relocat|in person|in-person|office|onsite|on-site|hybrid|travel)\b/i, 'location, travel, or in-office commitment required'],
  [/\b(non-compete|exclusivity|indemn|insurance|certification|attestation)\b/i, 'legal/compliance commitment required'],
];

const browser = await chromium.launch({
  headless,
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
});

const results = [];
try {
  for (const row of rows) {
    results.push(await preflightRow(browser, row));
  }
} finally {
  await browser.close();
}

const summary = {
  projectDir: PROJECT_DIR,
  generatedAt: new Date().toISOString(),
  input: singleUrl ? '' : relativeProject(resolve(PROJECT_DIR, inputPath)),
  resumePath: resumePath && existsSync(resumePath) ? relativeProject(resumePath) : '',
  counts: {
    ready: results.filter((item) => item.status === 'ready').length,
    needsReview: results.filter((item) => item.status === 'needs_review').length,
    blocked: results.filter((item) => item.status === 'blocked').length,
    unavailable: results.filter((item) => item.status === 'unavailable').length,
  },
  results,
};

if (format === 'json') {
  console.log(JSON.stringify(summary, null, 2));
} else if (format === 'tsv') {
  printTsv(results);
} else {
  printText(summary);
}

async function preflightRow(browser, row) {
  const attempted = [];
  for (const candidateUrl of applicationUrls(row)) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
    try {
      await page.goto(candidateUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 3000) }).catch(() => {});
      await page.waitForTimeout(waitMs);

      const model = await page.evaluate(() => {
        const bodyText = document.body?.innerText || '';
        const labels = [...document.querySelectorAll('label')]
          .map((label) => label.innerText.trim())
          .filter(Boolean);
        const controls = [...document.querySelectorAll('input, textarea, select, button')]
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            type: (element.getAttribute('type') || '').toLowerCase(),
            name: element.getAttribute('name') || '',
            required: Boolean(element.required || element.getAttribute('aria-required') === 'true'),
            visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
            label: fieldLabel(element),
            placeholder: element.getAttribute('placeholder') || '',
            text: element.innerText?.trim() || element.textContent?.trim() || '',
          }));

        return {
          title: document.title || '',
          url: location.href,
          bodyText,
          labels,
          controls,
        };

        function fieldLabel(element) {
          const aria = element.getAttribute('aria-label');
          if (aria) return aria.trim();

          const id = element.getAttribute('id');
          if (id && window.CSS?.escape) {
            const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            if (label?.innerText?.trim()) return label.innerText.trim();
          }

          const parentLabel = element.closest('label');
          if (parentLabel?.innerText?.trim()) return parentLabel.innerText.trim();

          const container = element.closest('[class*="field"], [class*="question"], [class*="input"], [data-testid], div');
          const text = container?.innerText?.trim();
          return text ? text.split(/\n+/).slice(0, 4).join(' | ') : '';
        }
      });

      const classification = classify(model, row, Boolean(resumePath && existsSync(resumePath)));
      await page.close();
      return {
        id: row.id,
        source: row.source,
        url: row.url,
        applicationUrl: model.url,
        title: model.title,
        ...classification,
        attempted: [...attempted, candidateUrl],
      };
    } catch (error) {
      attempted.push(`${candidateUrl} (${error instanceof Error ? error.message : String(error)})`);
      await page.close().catch(() => {});
    }
  }

  return {
    id: row.id,
    source: row.source,
    url: row.url,
    applicationUrl: '',
    title: '',
    status: 'unavailable',
    blockers: ['application page unavailable'],
    warnings: [],
    requiredLabels: [],
    allLabels: [],
    fieldCount: 0,
    attempted,
  };
}

function classify(model, row, hasResume) {
  const body = normalize(model.bodyText);
  const pageUnavailable = /page not found|job board you were viewing is no longer active|job is no longer available|position has been filled/i.test(model.bodyText);
  const allLabels = uniqueValues(model.labels.map(cleanLabel)).filter(Boolean);
  const requiredControls = model.controls.filter((control) => control.required);
  const requiredLabels = uniqueValues(requiredControls.map((control) => cleanLabel(control.label || control.placeholder || control.name))).filter(Boolean);
  const blockers = [];
  const warnings = [];

  if (pageUnavailable) blockers.push('application page unavailable or inactive');

  const requiredText = normalize(requiredLabels.join('\n'));
  const labelText = normalize(allLabels.join('\n'));
  const controlText = normalize(model.controls.map((control) => [control.label, control.placeholder, control.name, control.text].filter(Boolean).join(' ')).join('\n'));

  for (const [pattern, reason] of REVIEW_REQUIRED_PATTERNS) {
    if (pattern.test(requiredText) || pattern.test(controlText)) blockers.push(reason);
  }

  if (!hasResume && model.controls.some((control) => control.type === 'file' && (control.required || /resume|cv/i.test(control.label)))) {
    blockers.push('required resume/cv upload but no local resume path was found');
  }

  if (/\b(captcha|recaptcha|g-recaptcha|hcaptcha)\b/i.test(controlText)) warnings.push('captcha or invisible captcha surface detected');
  if (/\bnot a robot|robot check|anti-robot\b/i.test(labelText)) blockers.push('robot self-check requires manual portal review');
  if (/\bprivacy|consent|terms|agreement\b/i.test(requiredText)) blockers.push('required privacy/terms consent needs user review');
  if (/\blinkedin\b/i.test(requiredText) && !/profilescribe\.com\/u\//i.test(String(row.notes || ''))) {
    warnings.push('required LinkedIn/profile field; apply ProfileScribe policy before filling');
  }

  const customRequired = requiredLabels.filter((label) => {
    const text = normalize(label);
    return /\b(why|describe|tell us|achievement|experience|additional information|portfolio|built|project|cover letter)\b/i.test(text);
  });
  if (customRequired.length) warnings.push(`custom narrative required: ${customRequired.join('; ')}`);

  const status = blockers.length ? 'blocked' : warnings.length ? 'needs_review' : 'ready';
  return {
    status,
    blockers: uniqueValues(blockers),
    warnings: uniqueValues(warnings),
    requiredLabels,
    allLabels: allLabels.slice(0, 80),
    fieldCount: model.controls.length,
  };
}

function applicationUrls(row) {
  const urls = [];
  urls.push(...extractApplyUrls(row.notes));

  try {
    const parsed = new URL(row.url);
    if (/jobs\.ashbyhq\.com$/i.test(parsed.hostname) && !parsed.pathname.endsWith('/application')) {
      urls.push(`${row.url.replace(/\/$/, '')}/application`);
    }
    if (/jobs\.lever\.co$/i.test(parsed.hostname) && !parsed.pathname.endsWith('/apply')) {
      urls.push(`${row.url.replace(/\/$/, '')}/apply`);
    }
  } catch {
    // Keep the original URL attempt.
  }

  urls.push(row.url);

  return uniqueValues(urls.filter(Boolean));
}

function extractApplyUrls(notes) {
  return [...String(notes || '').matchAll(/apply:\s*(https?:\/\/[^\s;|]+)/gi)].map((match) => match[1]);
}

function readBatchRows(path) {
  if (!existsSync(path)) {
    console.error(`Missing input file: ${relativeProject(path)}`);
    process.exit(1);
  }

  const [headerLine = '', ...lines] = readFileSync(path, 'utf8').split(/\r?\n/);
  const headers = headerLine.split('\t');
  return lines.filter(Boolean).map((line) => {
    const cells = line.split('\t');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || '';
    });
    return row;
  }).filter((row) => row.url);
}

function printText(summary) {
  const counts = summary.counts;
  console.log(`portal preflight: ready ${counts.ready}, needs_review ${counts.needsReview}, blocked ${counts.blocked}, unavailable ${counts.unavailable}`);
  for (const result of summary.results) {
    const details = [...result.blockers, ...result.warnings].join('; ') || 'no review-sensitive fields detected';
    console.log(`- ${result.status} ${result.id}: ${details}`);
  }
}

function printTsv(results) {
  console.log(['id', 'source', 'url', 'applicationUrl', 'status', 'blockers', 'warnings'].join('\t'));
  for (const result of results) {
    console.log([
      result.id,
      result.source,
      result.url,
      result.applicationUrl,
      result.status,
      result.blockers.join('; '),
      result.warnings.join('; '),
    ].map(tsvEscape).join('\t'));
  }
}

function findDefaultResume(root) {
  const candidates = [
    'data/raw/resume/Ace-Greenman-Full-Stack-Engineer.pdf',
    'data/raw/resume/resume.pdf',
    'data/resume.pdf',
  ];
  return candidates.find((rel) => existsSync(resolve(root, rel))) || '';
}

function defaultChromeExecutable() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  return candidates.find((path) => existsSync(path)) || '';
}

function numberFlag(flagArgs, name, fallback) {
  const value = Number(readFlag(flagArgs, name, String(fallback)));
  if (!Number.isFinite(value) || value < 0) {
    console.error(`Invalid --${name}: ${readFlag(flagArgs, name)}`);
    process.exit(1);
  }
  return Math.floor(value);
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function cleanLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\*\s*$/, '')
    .trim();
}

function uniqueValues(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function tsvEscape(value) {
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

function relativeProject(abs) {
  return abs.startsWith(`${PROJECT_DIR}/`) ? abs.slice(PROJECT_DIR.length + 1) : abs;
}

function help() {
  console.log(`software-contract-forge portal

Usage:
  software-contract-forge portal:preflight [--input batch/batch-input.tsv] [--limit N] [--format text|json|tsv]
  software-contract-forge portal:preflight --url URL [--notes TEXT]

Options:
  --input PATH              Batch TSV input. Defaults to batch/batch-input.tsv.
  --url URL                 Preflight one application URL instead of a batch.
  --limit N                 Maximum batch rows to check. Defaults to 20.
  --resume PATH             Local resume path used to judge required upload readiness.
  --headed                  Run browser visibly instead of headless.
  --browser-executable PATH Use a local Chrome/Chromium executable.
  --timeout-ms N            Navigation timeout. Defaults to 15000.
  --wait-ms N               Post-load wait before extraction. Defaults to 1500.
  --format text|json|tsv    Output format. Defaults to text.

Behavior:
  - Opens public ATS application pages.
  - Detects required fields that need user review before non-binding submission.
  - Treats required resume/CV upload as allowed when a local resume file exists.
  - Does not submit applications.`);
}
