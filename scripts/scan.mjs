#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { parse as parseYaml } from 'yaml';

import { hasFlag, readFlag } from '../lib/args.mjs';
import { opportunityKey } from '../lib/canon-key.mjs';
import { projectDir } from '../lib/paths.mjs';
import { today, tsvEscape } from '../lib/text.mjs';

const CONTRACT_TERMS = [
  'contract',
  'contractor',
  'freelance',
  'consultant',
  'consulting',
  'fractional',
  'temporary',
  'part-time',
  'project-based',
];

const DEFAULT_INCLUDE = [
  'software',
  'engineer',
  'developer',
  'full stack',
  'full-stack',
  'frontend',
  'front-end',
  'backend',
  'back-end',
  'react',
  'angular',
  'next.js',
  'nextjs',
  'node',
  'node.js',
  'python',
  'typescript',
  'javascript',
  'aws',
  'serverless',
  'graphql',
  'api',
  'web application',
  'ai',
  'llm',
  'rag',
];

const DEFAULT_EXCLUDE = [
  'unpaid',
  'volunteer',
  'equity only',
  'equity-only',
  'internship',
  'recruiter',
  'marketing manager',
  'sales representative',
  'customer support',
  'onsite only',
  'on-site only',
];

const STOP_WORDS = new Set([
  'and',
  'the',
  'with',
  'for',
  'work',
  'using',
  'systems',
  'application',
  'applications',
  'development',
  'engineering',
  'contracts',
  'preferred',
  'backend',
  'frontend',
]);

const args = process.argv.slice(2);

if (hasFlag(args, 'help') || hasFlag(args, 'h')) {
  help();
  process.exit(0);
}

const PROJECT_DIR = resolve(projectDir());
const write = hasFlag(args, 'write');
const format = readFlag(args, 'format', 'text');
const onlySource = readFlag(args, 'source');
const limit = numberFlag('limit', 20);
const days = numberFlag('days', 14);
const userAgent = readFlag(args, 'user-agent', 'software-contract-forge/0.1 (+https://github.com/Agent-Pattern-Labs/software-contract-forge)');

const sourcesPath = join(PROJECT_DIR, 'config/sources.yml');
const profilePath = join(PROJECT_DIR, 'config/client-profile.yml');
const pipelinePath = join(PROJECT_DIR, 'data/pipeline.md');

if (!existsSync(sourcesPath)) {
  console.error(`Missing ${relativeProject(sourcesPath)}. Run from a consumer project or set SOFTWARE_CONTRACT_FORGE_PROJECT.`);
  process.exit(1);
}

const sourcesConfig = readYaml(sourcesPath);
const clientProfile = existsSync(profilePath) ? readYaml(profilePath) : {};
const scanDate = today(clientProfile?.client?.timezone || 'America/New_York');
const existingText = readExistingState(PROJECT_DIR);
const result = {
  generatedAt: new Date().toISOString(),
  projectDir: PROJECT_DIR,
  write,
  newLeads: [],
  duplicates: [],
  skipped: [],
  blocked: [],
  sources: [],
};

const enabledSources = normalizeArray(sourcesConfig.sources).filter((source) => {
  if (onlySource && source?.name !== onlySource) return false;
  return Boolean(source?.enabled);
});

if (onlySource && !enabledSources.length) {
  const configured = normalizeArray(sourcesConfig.sources).find((source) => source?.name === onlySource);
  result.blocked.push({
    source: onlySource,
    reason: configured ? 'source is disabled in config/sources.yml' : 'source not found in config/sources.yml',
  });
}

for (const source of enabledSources) {
  const adapter = source.adapter || source.scan_adapter || adapterFromType(source);
  if (!adapter || adapter === 'manual') {
    result.skipped.push({ source: source.name, reason: 'manual/inbox source' });
    continue;
  }

  try {
    const rawCandidates = await fetchCandidates(source, adapter, userAgent);
    const sourceLimit = Number(source.limit || limit);
    const filtered = rawCandidates
      .map((candidate) => normalizeCandidate(candidate, source, scanDate))
      .map((candidate) => ({ ...candidate, match: matchCandidate(candidate, source, clientProfile) }))
      .filter((candidate) => candidate.match.keep)
      .filter((candidate) => withinDays(candidate.date, days))
      .slice(0, sourceLimit);

    let addedForSource = 0;
    let duplicateForSource = 0;

    for (const candidate of filtered) {
      const lead = {
        ...candidate,
        key: opportunityKey(candidate),
        status: 'discovered',
      };

      if (isDuplicate(lead, existingText, result.newLeads)) {
        result.duplicates.push(compactLead(lead));
        duplicateForSource++;
        continue;
      }

      result.newLeads.push(lead);
      addedForSource++;
    }

    result.sources.push({
      name: source.name,
      adapter,
      fetched: rawCandidates.length,
      matched: filtered.length,
      new: addedForSource,
      duplicates: duplicateForSource,
    });
  } catch (error) {
    result.blocked.push({
      source: source.name,
      adapter,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

if (write && result.newLeads.length) {
  appendPipeline(pipelinePath, result.newLeads, scanDate);
}

if (format === 'json') {
  console.log(JSON.stringify(result, null, 2));
} else if (format === 'tsv') {
  printTsv(result);
} else {
  printText(result);
}

function help() {
  console.log(`software-contract-forge scan -- discover leads from approved public sources

Usage:
  software-contract-forge scan [--write] [--source NAME] [--limit N] [--days N] [--format text|json|tsv]

Behavior:
  - Reads enabled sources from config/sources.yml.
  - Supports public RSS feeds with adapter: rss.
  - Supports Remote OK API sources with adapter: remoteok.
  - Dedupe checks data/pipeline.md, data/applications/, reports/, and batch/tracker-additions/.
  - Dry-runs by default; pass --write to append discovered leads to data/pipeline.md.

Examples:
  software-contract-forge scan
  software-contract-forge scan --source weworkremotely-programming --limit 10
  software-contract-forge scan --write --format json`);
}

function numberFlag(name, fallback) {
  const value = Number(readFlag(args, name, fallback));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readYaml(path) {
  return parseYaml(readFileSync(path, 'utf8')) || {};
}

function adapterFromType(source) {
  if (source.type === 'rss' || source.type === 'public-rss') return 'rss';
  if (source.type === 'public-api' && String(source.name || '').toLowerCase().includes('remoteok')) return 'remoteok';
  if (source.type === 'inbox') return 'manual';
  return '';
}

async function fetchCandidates(source, adapter, userAgent) {
  if (!source.url) throw new Error('missing source url');
  if (adapter === 'rss') return fetchRss(source, userAgent);
  if (adapter === 'remoteok') return fetchRemoteOk(source, userAgent);
  throw new Error(`unsupported scan adapter "${adapter}"`);
}

async function fetchRss(source, userAgent) {
  const xml = await fetchText(source.url, userAgent);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: true,
    htmlEntities: true,
    cdataPropName: '__cdata',
  });
  const feed = parser.parse(xml);
  const channel = feed?.rss?.channel || feed?.feed || {};
  const items = normalizeArray(channel.item || channel.entry);

  return items.map((item) => {
    const title = textValue(item.title);
    const link = rssLink(item);
    const description = textValue(item.description || item.summary || item['content:encoded'] || item.content);
    const { buyer, roleTitle } = splitBuyerTitle(title);
    return {
      source: source.name,
      url: link,
      buyer,
      title: roleTitle,
      date: textValue(item.pubDate || item.published || item.updated || item['dc:date']),
      description,
      notes: [
        textValue(item.region) && `region: ${textValue(item.region)}`,
        textValue(item.category) && `category: ${textValue(item.category)}`,
      ].filter(Boolean).join('; '),
    };
  });
}

async function fetchRemoteOk(source, userAgent) {
  const payload = JSON.parse(await fetchText(source.url, userAgent));
  return normalizeArray(payload).filter((item) => item?.position && item?.url).map((item) => ({
    source: source.name,
    url: item.url,
    buyer: item.company || '',
    title: item.position || '',
    date: item.date || '',
    description: item.description || '',
    notes: [
      item.location && `location: ${item.location}`,
      Array.isArray(item.tags) && item.tags.length ? `tags: ${item.tags.slice(0, 8).join(', ')}` : '',
      item.salary_min || item.salary_max ? `salary: ${[item.salary_min, item.salary_max].filter(Boolean).join('-')}` : '',
    ].filter(Boolean).join('; '),
  }));
}

async function fetchText(url, userAgent) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/rss+xml, application/xml, application/json, text/xml, */*',
        'user-agent': userAgent,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`fetch failed ${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCandidate(candidate, source, scanDate) {
  const date = parseDate(candidate.date) || scanDate;
  const description = stripHtml(candidate.description || '');
  const budget = extractBudget(`${candidate.title} ${candidate.notes} ${description}`);
  const contractSignal = hasContractSignal(`${candidate.title} ${candidate.notes} ${description}`);
  const notes = [
    candidate.notes,
    budget && `budget/rate seen: ${budget}`,
    !contractSignal && 'employment type unknown; qualify before applying',
  ].filter(Boolean).join('; ');

  return {
    source: source.name,
    url: candidate.url || source.url,
    buyer: candidate.buyer || source.default_buyer || 'Unknown buyer',
    title: candidate.title || 'Untitled opportunity',
    date,
    deadline: '',
    budget,
    notes,
    description,
  };
}

function matchCandidate(candidate, source, clientProfile) {
  const text = `${candidate.title} ${candidate.buyer} ${candidate.notes} ${candidate.description}`.toLowerCase();
  const includeTerms = uniqueTerms([
    ...DEFAULT_INCLUDE,
    ...normalizeArray(source.include_keywords || source.keywords),
    ...profileTerms(clientProfile),
  ]);
  const hardExcludes = uniqueTerms([
    ...DEFAULT_EXCLUDE,
    ...normalizeArray(source.exclude_keywords),
  ]);

  const includeHits = includeTerms.filter((term) => termMatches(text, term));
  const excludeHits = hardExcludes.filter((term) => termMatches(text, term));
  const contractHits = CONTRACT_TERMS.filter((term) => termMatches(text, term));
  const score = includeHits.length + (contractHits.length * 2) - (excludeHits.length * 4);
  const minScore = Number(source.min_score ?? 2);

  return {
    keep: score >= minScore && excludeHits.length === 0,
    score,
    includeHits,
    excludeHits,
    contractHits,
  };
}

function profileTerms(clientProfile) {
  const terms = [];
  const preferences = clientProfile?.preferences || {};
  const positioning = clientProfile?.positioning || {};
  for (const value of normalizeArray(preferences.preferred_work)) terms.push(...keywordsFromText(value));
  for (const value of normalizeArray(positioning.strengths)) terms.push(...keywordsFromText(value));
  return terms;
}

function keywordsFromText(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9.+#-]+/)
    .filter((word) => word.length >= 3)
    .filter((word) => !STOP_WORDS.has(word));
}

function withinDays(value, maxDays) {
  if (!maxDays) return true;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return true;
  const ageMs = Date.now() - timestamp;
  return ageMs <= maxDays * 24 * 60 * 60 * 1000;
}

function isDuplicate(lead, existingText, pending) {
  const haystack = existingText.toLowerCase();
  return haystack.includes(lead.key.toLowerCase())
    || (lead.url && haystack.includes(lead.url.toLowerCase()))
    || pending.some((item) => item.key === lead.key || item.url === lead.url);
}

function readExistingState(root) {
  const paths = [
    join(root, 'data/pipeline.md'),
    join(root, 'data/applications'),
    join(root, 'reports'),
    join(root, 'batch/tracker-additions'),
  ];
  return paths.map(readTextRecursive).join('\n');
}

function readTextRecursive(path) {
  if (!existsSync(path)) return '';
  const info = statSync(path);
  if (info.isFile()) return readFileSync(path, 'utf8');
  if (!info.isDirectory()) return '';
  return readdirSync(path)
    .map((entry) => readTextRecursive(join(path, entry)))
    .join('\n');
}

function appendPipeline(path, leads, date) {
  mkdirSync(dirname(path), { recursive: true });
  const heading = `\n## Scan ${date}\n\n`;
  const lines = leads.map((lead) => `- [ ] ${date} | source: ${tsvEscape(lead.source)} | buyer: ${tsvEscape(lead.buyer)} | title: ${tsvEscape(lead.title)} | url: ${tsvEscape(lead.url)} | key: ${lead.key} | notes: ${tsvEscape(lead.notes)}`);
  appendFileSync(path, `${heading}${lines.join('\n')}\n`, 'utf8');
}

function printText(scan) {
  console.log(`software-contract-forge scan ${scan.write ? 'wrote leads' : 'dry run'}`);
  console.log(`new: ${scan.newLeads.length}, duplicates: ${scan.duplicates.length}, skipped: ${scan.skipped.length}, blocked: ${scan.blocked.length}`);

  for (const source of scan.sources) {
    console.log(`- ${source.name}: fetched ${source.fetched}, matched ${source.matched}, new ${source.new}, duplicates ${source.duplicates}`);
  }

  for (const blocked of scan.blocked) {
    console.log(`- blocked ${blocked.source}: ${blocked.reason}`);
  }

  for (const lead of scan.newLeads.slice(0, 20)) {
    console.log(`- ${lead.title} - ${lead.buyer} (${lead.url})`);
  }

  if (!scan.write && scan.newLeads.length) {
    console.log('dry run only; pass --write to append these leads to data/pipeline.md');
  }
}

function printTsv(scan) {
  console.log(['key', 'date', 'source', 'url', 'buyer', 'title', 'status', 'budget', 'deadline', 'notes'].join('\t'));
  for (const lead of scan.newLeads) {
    console.log([
      lead.key,
      lead.date,
      lead.source,
      lead.url,
      lead.buyer,
      lead.title,
      lead.status,
      lead.budget,
      lead.deadline,
      lead.notes,
    ].map(tsvEscape).join('\t'));
  }
}

function compactLead(lead) {
  return {
    key: lead.key,
    source: lead.source,
    url: lead.url,
    buyer: lead.buyer,
    title: lead.title,
  };
}

function parseDate(value) {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toISOString().slice(0, 10);
}

function splitBuyerTitle(title) {
  const value = textValue(title);
  const [buyer, ...rest] = value.split(':');
  if (rest.length && buyer.length <= 80) {
    return { buyer: buyer.trim(), roleTitle: rest.join(':').trim() };
  }
  return { buyer: '', roleTitle: value };
}

function rssLink(item) {
  const link = item.link;
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) {
    const alternate = link.find((entry) => entry?.['@_rel'] === 'alternate') || link[0];
    return alternate?.['@_href'] || textValue(alternate);
  }
  return link?.['@_href'] || textValue(link);
}

function textValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value.__cdata) return textValue(value.__cdata);
  if (value['#text']) return textValue(value['#text']);
  return '';
}

function stripHtml(value) {
  return decodeEntities(String(value || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractBudget(value) {
  const match = String(value || '').match(/\$[\d,]+(?:\s?-\s?\$?[\d,]+)?(?:\s?\/\s?(?:hr|hour|week|mo|month|year))?/i);
  return match?.[0] || '';
}

function hasContractSignal(value) {
  const text = String(value || '').toLowerCase();
  return CONTRACT_TERMS.some((term) => termMatches(text, term));
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null || value === '') return [];
  return [value];
}

function uniqueTerms(values) {
  return [...new Set(values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
}

function termMatches(text, term) {
  const value = String(term || '').trim().toLowerCase();
  if (!value) return false;
  if (value.includes(' ') || value.includes('-') || value.includes('.')) return text.includes(value);
  return new RegExp(`\\b${escapeRegExp(value)}\\b`, 'i').test(text);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function relativeProject(path) {
  return path.startsWith(PROJECT_DIR) ? path.slice(PROJECT_DIR.length + 1) : path;
}
