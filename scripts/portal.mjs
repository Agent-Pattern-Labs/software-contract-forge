#!/usr/bin/env node

import { createInterface } from 'readline/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { chromium } from 'playwright';

import { hasFlag, readFlag } from '../lib/args.mjs';
import { projectDir } from '../lib/paths.mjs';

const [action = 'help', ...args] = process.argv.slice(2);

if (action === 'help' || action === '--help' || action === '-h' || hasFlag(args, 'help') || hasFlag(args, 'h')) {
  help();
  process.exit(0);
}

if (!['preflight', 'handoff'].includes(action)) {
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

const REVIEW_REQUIRED_PATTERNS = [
  [/\b(visa|sponsor|sponsorship|work authorization|authorized to work|employment authorization)\b/i, 'work authorization or visa sponsorship answer required'],
  [/\b(us citizen|u\.s\. citizen|citizenship|clearance|government representation)\b/i, 'citizenship/government representation required'],
  [/\b(background check|identity verification|id verification)\b/i, 'background or identity verification answer required'],
  [/\b(hourly rate|desired rate|salary|compensation|base salary|pay expectation|salary expectation)\b/i, 'binding compensation answer required'],
  [/\b(start date|available date|availability date|notice period|lead time|weekly capacity|hours per week|hours\/week)\b/i, 'start date or availability commitment required'],
  [/\b(relocat|in person|in-person|office|onsite|on-site|hybrid|travel)\b/i, 'location, travel, or in-office commitment required'],
  [/\b(non-compete|exclusivity|indemn|insurance|certification|attestation)\b/i, 'legal/compliance commitment required'],
];

if (action === 'handoff') {
  await runHandoff(args);
  process.exit(0);
}

const rows = singleUrl
  ? [{ id: 'url', url: singleUrl, source: readFlag(args, 'source', 'manual'), notes: readFlag(args, 'notes') }]
  : readBatchRows(resolve(PROJECT_DIR, inputPath)).slice(0, limit);

if (!rows.length) {
  console.error(singleUrl ? 'No URL provided.' : `No rows found in ${relativeProject(resolve(PROJECT_DIR, inputPath))}.`);
  process.exit(1);
}

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

      const model = await extractModel(page);

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
  const pageUnavailable = unavailablePattern().test(model.bodyText);
  const allLabels = uniqueValues(model.labels.map(cleanLabel)).filter(Boolean);
  const requiredControls = model.controls.filter((control) => control.required);
  const requiredLabels = uniqueValues(requiredControls.map((control) => cleanLabel(control.label || control.placeholder || control.name))).filter(Boolean);
  const blockers = [];
  const warnings = [];
  const userActions = [];
  const reviewItems = [];

  if (pageUnavailable) blockers.push('application page unavailable or inactive');
  if (!pageUnavailable && model.controls.length === 0 && !allLabels.length) {
    blockers.push('application form not detected');
  }

  const requiredText = normalize(requiredLabels.join('\n'));
  const labelText = normalize(allLabels.join('\n'));
  const controlText = normalize(model.controls.map((control) => [control.label, control.placeholder, control.name, control.text].filter(Boolean).join(' ')).join('\n'));

  for (const [pattern, reason] of REVIEW_REQUIRED_PATTERNS) {
    if (pattern.test(requiredText) || pattern.test(controlText)) {
      blockers.push(reason);
      reviewItems.push({
        category: reviewCategory(reason),
        reason,
        evidence: matchingEvidence(pattern, [...requiredLabels, ...allLabels, controlText]),
      });
    }
  }

  if (!hasResume && model.controls.some((control) => control.type === 'file' && (control.required || /resume|cv/i.test(control.label)))) {
    const reason = 'required resume/cv upload but no local resume path was found';
    blockers.push(reason);
    userActions.push({ type: 'missing_file', reason, instruction: 'Add a resume/CV file locally or pass --resume PATH.' });
  }

  if (/\b(captcha|recaptcha|g-recaptcha|hcaptcha|turnstile|private access token|cloudflare)\b/i.test(`${body} ${controlText}`)) {
    const reason = 'captcha or invisible captcha surface detected';
    warnings.push(reason);
    userActions.push({ type: 'human_verification', reason, instruction: 'Use portal:handoff in a headed browser for hCaptcha/reCAPTCHA/Turnstile; do not bypass or automate the challenge.' });
  }
  if (/\b(security code|verification code|one[- ]time code|otp|confirm you'?re a human|confirm you are a human)\b/i.test(`${body} ${labelText} ${controlText}`)) {
    const reason = 'email security code or human-verification challenge requires user action';
    blockers.push(reason);
    userActions.push({ type: 'security_code', reason, instruction: 'Use portal:handoff and have the user enter the code from their inbox.' });
  }
  if (/\b(log in to apply|login to apply|sign in to apply|sign-in required|password|confirm password)\b/i.test(`${requiredText} ${controlText}`)) {
    const reason = 'login or account step requires user action';
    blockers.push(reason);
    userActions.push({ type: 'login', reason, instruction: 'Use portal:handoff only if the user is available to sign in or create the account.' });
  }
  if (/\bnot a robot|robot check|anti-robot\b/i.test(labelText)) {
    const reason = 'robot self-check requires manual portal review';
    blockers.push(reason);
    userActions.push({ type: 'human_verification', reason, instruction: 'Use portal:handoff in a headed browser for hCaptcha/reCAPTCHA/Turnstile; do not bypass or automate the challenge.' });
  }
  if (/\bprivacy|consent|terms|agreement\b/i.test(requiredText)) {
    const reason = 'required privacy/terms consent needs user review';
    blockers.push(reason);
    reviewItems.push({ category: 'legal_consent', reason, evidence: matchingEvidence(/\bprivacy|consent|terms|agreement\b/i, requiredLabels) });
  }
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
    userActions: uniqueActionItems(userActions),
    reviewItems: uniqueReviewItems(reviewItems),
    requiredLabels,
    allLabels: allLabels.slice(0, 80),
    fieldCount: model.controls.length,
  };
}

async function runHandoff(flagArgs) {
  const handoffUrl = readFlag(flagArgs, 'url');
  if (!handoffUrl) {
    console.error('Missing --url for portal:handoff.');
    help();
    process.exit(1);
  }

  const handoffTimeoutMs = numberFlag(flagArgs, 'timeout-ms', 10 * 60 * 1000);
  const pollMs = numberFlag(flagArgs, 'poll-ms', 1500);
  const handoffFormat = readFlag(flagArgs, 'format', 'text');
  const outPath = readFlag(flagArgs, 'out');
  const handoffHeadless = hasFlag(flagArgs, 'headless');
  const userDataDir = resolve(PROJECT_DIR, readFlag(flagArgs, 'user-data-dir', 'batch/.portal-handoff-browser'));
  const row = { id: readFlag(flagArgs, 'id', 'handoff'), url: handoffUrl, source: readFlag(flagArgs, 'source', 'manual'), notes: readFlag(flagArgs, 'notes') };
  const targetUrl = applicationUrls(row)[0];

  mkdirSync(userDataDir, { recursive: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: handoffHeadless,
    ...(browserExecutable ? { executablePath: browserExecutable } : {}),
    viewport: { width: 1440, height: 1400 },
  });
  const page = context.pages()[0] || await context.newPage();
  const startedAt = new Date().toISOString();

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 5000) }).catch(() => {});
    await page.waitForTimeout(waitMs);

    if (!handoffHeadless) {
      console.error([
        'Portal handoff opened a headed browser.',
        'User may complete hCaptcha/reCAPTCHA/Turnstile, security-code, login, or review-only fields directly in the portal.',
        'Do not use this helper to bypass access controls or invent answers.',
        'Press Enter here after the portal shows a terminal state, or wait for auto-detection/timeout.',
      ].join('\n'));
    }

    const exitReason = await waitForHandoff(page, handoffTimeoutMs, pollMs);
    const model = await extractModel(page);
    const classification = classifyHandoff(model, row, Boolean(resumePath && existsSync(resumePath)), exitReason);
    const result = {
      id: row.id,
      source: row.source,
      url: row.url,
      applicationUrl: model.url,
      title: model.title,
      startedAt,
      completedAt: new Date().toISOString(),
      exitReason,
      ...classification,
    };

    if (outPath) {
      const absOut = resolve(PROJECT_DIR, outPath);
      mkdirSync(dirname(absOut), { recursive: true });
      writeFileSync(absOut, JSON.stringify(result, null, 2));
    }

    if (handoffFormat === 'json') console.log(JSON.stringify(result, null, 2));
    else printHandoffText(result, outPath);
  } finally {
    await context.close();
  }
}

async function waitForHandoff(page, timeout, poll) {
  const deadline = Date.now() + timeout;
  const enter = waitForEnter();
  while (Date.now() < deadline) {
    if (enter.done) return 'user_enter';
    const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (successPattern().test(text)) return 'auto_success_detected';
    if (unavailablePattern().test(text)) return 'auto_unavailable_detected';
    await new Promise((resolvePromise) => setTimeout(resolvePromise, poll));
  }
  return 'timeout';
}

function waitForEnter() {
  const state = { done: false };
  if (!process.stdin.isTTY) return state;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  rl.question('').then(() => {
    state.done = true;
    rl.close();
  }).catch(() => {
    state.done = true;
    rl.close();
  });
  return state;
}

function classifyHandoff(model, row, hasResume, exitReason) {
  const body = normalize(model.bodyText);
  if (successPattern().test(model.bodyText)) {
    return {
      status: 'applied',
      reason: 'portal confirmation detected after user handoff',
      blockers: [],
      warnings: [],
      userActions: [],
      reviewItems: [],
      requiredLabels: [],
      allLabels: [],
      fieldCount: model.controls.length,
    };
  }
  if (unavailablePattern().test(model.bodyText)) {
    return {
      status: 'unavailable',
      reason: 'application page unavailable or inactive',
      blockers: ['application page unavailable or inactive'],
      warnings: [],
      userActions: [],
      reviewItems: [],
      requiredLabels: [],
      allLabels: [],
      fieldCount: model.controls.length,
    };
  }

  const classification = classify(model, row, hasResume);
  if (classification.userActions.length) {
    return { ...classification, status: 'needs_user_action', reason: classification.userActions.map((item) => item.reason).join('; ') };
  }
  if (classification.blockers.length) {
    return { ...classification, reason: classification.blockers.join('; ') };
  }
  return {
    ...classification,
    status: 'pending_manual_completion',
    reason: exitReason === 'timeout' ? 'handoff timed out without portal confirmation' : 'handoff ended without portal confirmation',
    bodyPreview: body.slice(0, 500),
  };
}

async function extractModel(page) {
  return page.evaluate(() => {
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
    for (const item of result.userActions || []) {
      console.log(`  user_action ${item.type}: ${item.instruction}`);
    }
    for (const item of result.reviewItems || []) {
      console.log(`  review ${item.category}: ${item.reason}${item.evidence ? ` (${item.evidence})` : ''}`);
    }
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

function uniqueActionItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = `${item.type}:${item.reason}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function uniqueReviewItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = `${item.category}:${item.reason}:${item.evidence}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function reviewCategory(reason) {
  if (/work authorization|visa/i.test(reason)) return 'work_authorization';
  if (/citizenship|government/i.test(reason)) return 'citizenship_government';
  if (/background|identity/i.test(reason)) return 'identity_background';
  if (/compensation|salary|rate/i.test(reason)) return 'compensation';
  if (/start|availability|capacity/i.test(reason)) return 'availability_capacity';
  if (/location|travel|office/i.test(reason)) return 'location_travel';
  if (/legal|compliance/i.test(reason)) return 'legal_compliance';
  return 'user_review';
}

function matchingEvidence(pattern, values) {
  for (const value of values) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (pattern.test(text)) return text.slice(0, 240);
  }
  return '';
}

function successPattern() {
  return /application submitted|application has been submitted|application received|successfully submitted|thanks for applying|thank you for applying|we'?ll be in touch|we will be in touch/i;
}

function unavailablePattern() {
  return /page not found|job not found|job board you were viewing is no longer active|job is no longer available|position has been filled|position has been closed/i;
}

function printHandoffText(result, outPath) {
  const details = [...result.blockers, ...result.warnings].join('; ') || result.reason;
  console.log(`portal handoff: ${result.status} ${result.id}: ${details}`);
  if (result.userActions?.length) {
    for (const item of result.userActions) {
      console.log(`- user_action ${item.type}: ${item.instruction}`);
    }
  }
  if (result.reviewItems?.length) {
    for (const item of result.reviewItems) {
      console.log(`- review ${item.category}: ${item.reason}${item.evidence ? ` (${item.evidence})` : ''}`);
    }
  }
  if (outPath) console.log(`wrote ${outPath}`);
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
  software-contract-forge portal:handoff --url URL [--out reports/handoff.json]

Options:
  --input PATH              Batch TSV input. Defaults to batch/batch-input.tsv.
  --url URL                 Preflight one application URL instead of a batch.
  --out PATH                For handoff, write terminal portal state as JSON.
  --limit N                 Maximum batch rows to check. Defaults to 20.
  --resume PATH             Local resume path used to judge required upload readiness.
  --headed                  Run browser visibly instead of headless.
  --headless                For handoff, run without visible browser. Defaults to headed.
  --user-data-dir PATH      For handoff, browser profile dir. Defaults to batch/.portal-handoff-browser.
  --browser-executable PATH Use a local Chrome/Chromium executable.
  --timeout-ms N            Navigation timeout. Defaults to 15000.
                             For handoff, total wait timeout defaults to 600000.
  --poll-ms N               For handoff, terminal-state polling interval. Defaults to 1500.
  --wait-ms N               Post-load wait before extraction. Defaults to 1500.
  --format text|json|tsv    Output format. Defaults to text.

Behavior:
  - Opens public ATS application pages.
  - Detects required fields that need user review before non-binding submission.
  - Emits structured userActions and reviewItems in JSON output.
  - Opens a headed browser for user-side hCaptcha/reCAPTCHA/Turnstile, security-code, login, or review completion with portal:handoff.
  - Treats required resume/CV upload as allowed when a local resume file exists.
  - Does not bypass captcha, security-code, login, legal, or review gates.`);
}
