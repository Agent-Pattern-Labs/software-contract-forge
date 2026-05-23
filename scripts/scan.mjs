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
  'fractional',
  'temporary',
  'part-time',
  'part time',
  'project-based',
  'project based',
  'hourly',
  '1099',
  'independent contractor',
];

const CONTRACT_SIGNAL_PATTERNS = [
  { label: 'contract', scope: 'titleNotes', pattern: /\bcontract(?:or)?\b/i },
  { label: 'freelance', scope: 'titleNotes', pattern: /\bfreelance(?:r)?\b/i },
  { label: 'fractional', scope: 'titleNotes', pattern: /\bfractional\b/i },
  { label: 'temporary', scope: 'titleNotes', pattern: /\btemporary\b/i },
  { label: 'part-time', scope: 'titleNotes', pattern: /\bpart[-\s]?time\b/i },
  { label: 'project-based', scope: 'titleNotes', pattern: /\bproject[-\s]?based\b/i },
  { label: '1099', scope: 'all', pattern: /\b1099\b/i },
  { label: 'independent contractor', scope: 'all', pattern: /\bindependent contractor\b/i },
  { label: 'hourly', scope: 'all', pattern: /\b(?:hourly|per hour)\b|[$£€]\s?\d[\d,]*(?:\.\d+)?\s?(?:\/|per\s+)hr\b/i },
  {
    label: 'employment type: contract',
    scope: 'titleNotes',
    pattern: /\b(?:employment type|commitment|job type)\s*:\s*(?:contract|contractor|temporary|part[-\s]?time|freelance|consultant)\b/i,
  },
  {
    label: 'type: contract',
    scope: 'all',
    pattern: /\b(?:type|employment type|commitment|job type|engagement)\s*:\s*[^.;\n]{0,80}\b(?:contract|contractor|temporary|part[-\s]?time|freelance|consultant)\b/i,
  },
  {
    label: 'contract role',
    scope: 'all',
    pattern: /\b(?:this is|this will be|position is|role is)\s+(?:a\s+)?(?:contract|contractor|freelance|fractional|temporary|part[-\s]?time|project[-\s]?based)\b/i,
  },
  {
    label: 'contract role',
    scope: 'all',
    pattern: /\b(?:contract|contractor|freelance|fractional|temporary|part[-\s]?time|project[-\s]?based)\s+(?:role|position|opportunity|engagement|work|project)\b/i,
  },
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
  'designer',
  'graphic designer',
  'visual designer',
  'onsite only',
  'on-site only',
  'recruiting',
  'recruiting coordinator',
  'talent acquisition',
  'human resources',
  'people operations',
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
  - Supports public ATS feeds with adapter: greenhouse, lever, or ashby.
  - Supports explicit first-party HTML/job pages with adapter: public-html.
  - Supports bounded sitemap page extraction with adapter: sitemap.
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
  if (source.type === 'ats-public' && source.provider) return String(source.provider).toLowerCase();
  if (source.type === 'public-html' || source.type === 'company-careers') return 'public-html';
  if (source.type === 'sitemap' || source.type === 'public-sitemap') return 'sitemap';
  if (source.type === 'inbox') return 'manual';
  return '';
}

async function fetchCandidates(source, adapter, userAgent) {
  if (adapter === 'rss') return fetchRss(source, userAgent);
  if (adapter === 'remoteok') return fetchRemoteOk(source, userAgent);
  if (adapter === 'greenhouse') return fetchGreenhouse(source, userAgent);
  if (adapter === 'lever') return fetchLever(source, userAgent);
  if (adapter === 'ashby') return fetchAshby(source, userAgent);
  if (adapter === 'public-html' || adapter === 'html') return fetchPublicHtml(source, userAgent);
  if (adapter === 'sitemap') return fetchSitemap(source, userAgent);
  throw new Error(`unsupported scan adapter "${adapter}"`);
}

async function fetchRss(source, userAgent) {
  if (!source.url) throw new Error('missing source url');
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
  if (!source.url) throw new Error('missing source url');
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

async function fetchGreenhouse(source, userAgent) {
  const board = source.board || source.board_token || source.organization || greenhouseBoardFromUrl(source.url);
  const apiUrl = source.api_url || (board ? `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true` : '');
  if (!apiUrl) throw new Error('missing Greenhouse board or api_url');

  const payload = await fetchJson(apiUrl, userAgent);
  return normalizeArray(payload.jobs).map((job) => ({
    source: source.name,
    url: job.absolute_url || job.url || source.url || apiUrl,
    buyer: source.default_buyer || source.buyer || payload.name || board,
    title: job.title || '',
    date: job.updated_at || '',
    description: job.content || job.description || '',
    notes: [
      job.location?.name && `location: ${job.location.name}`,
      Array.isArray(job.departments) && job.departments.length ? `departments: ${job.departments.map((department) => department.name).filter(Boolean).join(', ')}` : '',
      Array.isArray(job.metadata) && job.metadata.length ? `metadata: ${job.metadata.map((entry) => [entry.name, entry.value].filter(Boolean).join(': ')).filter(Boolean).slice(0, 6).join('; ')}` : '',
      `ats: greenhouse`,
    ].filter(Boolean).join('; '),
  }));
}

async function fetchLever(source, userAgent) {
  const company = source.company || source.organization || leverCompanyFromUrl(source.url);
  const apiUrl = source.api_url || (company ? `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json` : '');
  if (!apiUrl) throw new Error('missing Lever company or api_url');

  const payload = await fetchJson(apiUrl, userAgent);
  return normalizeArray(payload).map((job) => ({
    source: source.name,
    url: job.hostedUrl || job.applyUrl || source.url || apiUrl,
    buyer: source.default_buyer || source.buyer || company,
    title: job.text || '',
    date: job.createdAt || '',
    description: [
      job.descriptionPlain || job.description,
      job.additionalPlain || job.additional,
      leverListsText(job.lists),
    ].filter(Boolean).join('\n\n'),
    budget: leverSalary(job.salaryRange),
    notes: [
      job.categories?.location && `location: ${job.categories.location}`,
      job.categories?.team && `team: ${job.categories.team}`,
      job.categories?.commitment && `commitment: ${job.categories.commitment}`,
      job.workplaceType && `workplace: ${job.workplaceType}`,
      job.applyUrl && `apply: ${job.applyUrl}`,
      `ats: lever`,
    ].filter(Boolean).join('; '),
  }));
}

async function fetchAshby(source, userAgent) {
  const organization = source.organization || source.company || ashbyOrganizationFromUrl(source.url);
  const apiUrl = source.api_url || (organization ? `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(organization)}` : '');
  if (!apiUrl) throw new Error('missing Ashby organization or api_url');

  const payload = await fetchJson(apiUrl, userAgent);
  return normalizeArray(payload.jobs || payload).map((job) => ({
    source: source.name,
    url: job.jobUrl || job.url || job.applyUrl || ashbyJobUrl(organization, job.id) || source.url || apiUrl,
    buyer: source.default_buyer || source.buyer || payload.organization?.name || organization,
    title: job.title || '',
    date: job.publishedDate || job.updatedAt || '',
    description: job.descriptionHtml || job.descriptionPlain || job.description || '',
    notes: [
      textValue(job.location) && `location: ${textValue(job.location)}`,
      job.department && `department: ${textValue(job.department)}`,
      job.employmentType && `employment type: ${job.employmentType}`,
      job.applyUrl && `apply: ${job.applyUrl}`,
      `ats: ashby`,
    ].filter(Boolean).join('; '),
  }));
}

async function fetchPublicHtml(source, userAgent) {
  const urls = sourceUrls(source);
  if (!urls.length) throw new Error('missing source url or urls');

  const maxPages = numberValue(source.max_pages, source.crawl_links ? 10 : urls.length);
  const queue = [...urls];
  const seen = new Set();
  const candidates = [];

  while (queue.length && seen.size < maxPages) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const html = await fetchText(url, userAgent);
    const pageCandidates = extractHtmlCandidates(html, url, source);
    candidates.push(...pageCandidates);

    if (source.crawl_links && seen.size < maxPages) {
      for (const link of extractCandidateLinks(html, url, source)) {
        if (!seen.has(link) && !queue.includes(link)) queue.push(link);
        if (seen.size + queue.length >= maxPages) break;
      }
    }
  }

  return candidates;
}

async function fetchSitemap(source, userAgent) {
  if (!source.url) throw new Error('missing sitemap url');
  const locs = (await fetchSitemapPageUrls(source.url, source, userAgent))
    .filter((url) => sitemapUrlAllowed(url, source))
    .slice(0, numberValue(source.max_pages, 25));

  const candidates = [];
  for (const loc of locs) {
    try {
      const html = await fetchText(loc, userAgent);
      candidates.push(...extractHtmlCandidates(html, loc, source));
    } catch (error) {
      if (source.stop_on_page_error) throw error;
    }
  }
  return candidates;
}

async function fetchSitemapPageUrls(url, source, userAgent, seen = new Set()) {
  const maxSitemaps = numberValue(source.max_sitemaps, 5);
  if (!url || seen.has(url) || seen.size >= maxSitemaps) return [];
  seen.add(url);

  const xml = await fetchText(url, userAgent);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: true,
    htmlEntities: true,
  });
  const parsed = parser.parse(xml);
  const urls = normalizeArray(parsed?.urlset?.url).map((entry) => textValue(entry.loc)).filter(Boolean);
  const childSitemaps = normalizeArray(parsed?.sitemapindex?.sitemap).map((entry) => textValue(entry.loc)).filter(Boolean);

  for (const child of childSitemaps) {
    urls.push(...await fetchSitemapPageUrls(child, source, userAgent, seen));
  }

  return uniqueValues(urls);
}

async function fetchJson(url, userAgent) {
  return JSON.parse(await fetchText(url, userAgent));
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
  const budget = candidate.budget || extractBudget(`${candidate.title} ${candidate.notes} ${description}`);
  const contractSignal = contractSignalHits({ ...candidate, description }).length > 0;
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
    deadline: parseDate(candidate.deadline) || '',
    budget,
    notes,
    description,
  };
}

function extractHtmlCandidates(html, pageUrl, source) {
  const structured = extractJobPostingJsonLd(html, pageUrl, source);
  if (structured.length) return structured;

  if (source.html_fallback === false) return [];

  const title = htmlTitle(html) || source.default_title || 'Untitled opportunity';
  const description = metaContent(html, 'description') || firstMeaningfulText(html);
  const pageText = `${title} ${description}`;
  if (!looksLikeOpportunity(pageText, source)) return [];

  return [{
    source: source.name,
    url: pageUrl,
    buyer: source.default_buyer || source.buyer || hostBuyer(pageUrl),
    title,
    date: source.default_date || '',
    description,
    notes: [
      directApplyLinks(html, pageUrl).slice(0, 3).map((link) => `apply: ${link}`).join('; '),
      extractEmails(`${html} ${description}`).slice(0, 3).map((email) => `email: ${email}`).join('; '),
      'source: public-html fallback',
    ].filter(Boolean).join('; '),
  }];
}

function extractJobPostingJsonLd(html, pageUrl, source) {
  const scripts = [...String(html || '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => decodeEntities(match[1]).trim())
    .filter(Boolean);
  const postings = [];

  for (const script of scripts) {
    for (const item of parseJsonLdDocuments(script)) {
      collectJobPostings(item, postings);
    }
  }

  return postings.map((job) => {
    const applyLinks = directApplyLinks(html, pageUrl);
    const hiringOrganization = firstValue(job.hiringOrganization);
    const locations = normalizeArray(job.jobLocation)
      .map((location) => locationAddressText(location))
      .filter(Boolean);
    const employmentTypes = normalizeArray(job.employmentType).map(textValue).filter(Boolean);
    return {
      source: source.name,
      url: absoluteUrl(textValue(job.url) || pageUrl, pageUrl),
      buyer: source.default_buyer || source.buyer || textValue(hiringOrganization?.name) || hostBuyer(pageUrl),
      title: textValue(job.title) || source.default_title || '',
      date: textValue(job.datePosted),
      deadline: textValue(job.validThrough),
      budget: salaryText(job.baseSalary),
      description: textValue(job.description) || metaContent(html, 'description') || '',
      notes: [
        employmentTypes.length ? `employment type: ${employmentTypes.join(', ')}` : '',
        locations.length ? `location: ${locations.join(', ')}` : '',
        job.directApply !== undefined ? `direct apply: ${Boolean(job.directApply)}` : '',
        applyLinks.slice(0, 3).map((link) => `apply: ${link}`).join('; '),
        extractEmails(String(job.description || '')).slice(0, 3).map((email) => `email: ${email}`).join('; '),
        'source: json-ld JobPosting',
      ].filter(Boolean).join('; '),
    };
  });
}

function parseJsonLdDocuments(value) {
  const candidates = [value];
  const trimmed = String(value || '').trim();
  if (trimmed.includes('\n}{')) candidates.push(`[${trimmed.replace(/}\s*{/g, '},{')}]`);

  const parsed = [];
  for (const candidate of candidates) {
    try {
      parsed.push(JSON.parse(candidate));
      break;
    } catch {
      // Try the next normalization.
    }
  }
  return parsed;
}

function collectJobPostings(value, postings) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectJobPostings(item, postings);
    return;
  }
  if (typeof value !== 'object') return;

  const types = normalizeArray(value['@type']).map((type) => String(type).toLowerCase());
  if (types.includes('jobposting')) postings.push(value);

  collectJobPostings(value['@graph'], postings);
  for (const key of ['itemListElement', 'mainEntity', 'mainEntityOfPage']) {
    collectJobPostings(value[key], postings);
  }
}

function extractCandidateLinks(html, pageUrl, source) {
  const include = normalizeArray(source.link_include_patterns).length
    ? normalizeArray(source.link_include_patterns)
    : ['job', 'jobs', 'career', 'careers', 'opening', 'openings', 'contract', 'consultant', 'engineer', 'developer'];
  const exclude = normalizeArray(source.link_exclude_patterns).length
    ? normalizeArray(source.link_exclude_patterns)
    : ['privacy', 'terms', 'cookie', 'login', 'signin', 'sign-in'];
  const sameOrigin = source.same_origin !== false;
  const pageOrigin = origin(pageUrl);

  return uniqueValues([...String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const url = absoluteUrl(decodeEntities(match[1]), pageUrl);
      const label = stripHtml(match[2]);
      return { url, text: `${url} ${label}`.toLowerCase() };
    })
    .filter((link) => link.url.startsWith('http'))
    .filter((link) => !sameOrigin || origin(link.url) === pageOrigin)
    .filter((link) => include.some((term) => termMatches(link.text, term)))
    .filter((link) => !exclude.some((term) => termMatches(link.text, term)))
    .map((link) => link.url));
}

function directApplyLinks(html, pageUrl) {
  return uniqueValues([...String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ url: absoluteUrl(decodeEntities(match[1]), pageUrl), label: stripHtml(match[2]) }))
    .filter((link) => /apply|submit|interest|contact/i.test(`${link.url} ${link.label}`))
    .map((link) => link.url));
}

function extractEmails(value) {
  return uniqueValues(String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []);
}

function looksLikeOpportunity(value, source) {
  const text = String(value || '').toLowerCase();
  const terms = uniqueTerms([
    ...DEFAULT_INCLUDE,
    ...CONTRACT_TERMS,
    ...normalizeArray(source.include_keywords || source.keywords),
  ]);
  return terms.some((term) => termMatches(text, term));
}

function htmlTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : '';
}

function metaContent(html, name) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${escapeRegExp(name)}["'])[^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const match = String(html || '').match(pattern);
  return match ? decodeEntities(match[1]).trim() : '';
}

function firstMeaningfulText(html) {
  return stripHtml(html).split(/\s+/).slice(0, 80).join(' ');
}

function sitemapUrlAllowed(url, source) {
  const text = String(url || '').toLowerCase();
  const includes = normalizeArray(source.url_include_patterns).length
    ? normalizeArray(source.url_include_patterns)
    : ['job', 'jobs', 'career', 'careers', 'opening', 'openings', 'contract', 'consultant'];
  const excludes = normalizeArray(source.url_exclude_patterns);
  return includes.some((term) => termMatches(text, term))
    && !excludes.some((term) => termMatches(text, term));
}

function sourceUrls(source) {
  return uniqueValues([
    ...normalizeArray(source.url),
    ...normalizeArray(source.urls),
  ]);
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function locationAddressText(location) {
  const value = firstValue(location);
  if (!value) return '';
  if (typeof value === 'string') return value;
  const address = firstValue(value.address);
  if (!address) return textValue(value.name);
  if (typeof address === 'string') return address;
  return [
    textValue(address.streetAddress),
    textValue(address.addressLocality),
    textValue(address.addressRegion),
    textValue(address.addressCountry?.name || address.addressCountry),
  ].filter(Boolean).join(', ');
}

function salaryText(baseSalary) {
  const salary = firstValue(baseSalary);
  if (!salary) return '';
  if (typeof salary === 'string' || typeof salary === 'number') return String(salary);
  const value = firstValue(salary.value);
  const currency = textValue(salary.currency);
  if (typeof value === 'string' || typeof value === 'number') return [currency, value].filter(Boolean).join(' ');
  if (!value) return '';
  const min = value.minValue || value.value;
  const max = value.maxValue;
  const unit = value.unitText ? `/${String(value.unitText).toLowerCase()}` : '';
  if (min && max) return `${currency ? `${currency} ` : ''}${min}-${max}${unit}`;
  if (min) return `${currency ? `${currency} ` : ''}${min}${unit}`;
  return '';
}

function leverListsText(lists) {
  return normalizeArray(lists)
    .map((list) => [list.text, list.content].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}

function leverSalary(salaryRange) {
  if (!salaryRange) return '';
  const min = salaryRange.min || salaryRange.minValue;
  const max = salaryRange.max || salaryRange.maxValue;
  const currency = salaryRange.currency || '';
  const interval = salaryRange.interval ? `/${salaryRange.interval}` : '';
  if (min && max) return `${currency ? `${currency} ` : ''}${min}-${max}${interval}`;
  if (min) return `${currency ? `${currency} ` : ''}${min}${interval}`;
  return '';
}

function greenhouseBoardFromUrl(url) {
  const match = String(url || '').match(/greenhouse\.io\/([^/?#]+)/i);
  return match?.[1] || '';
}

function leverCompanyFromUrl(url) {
  const match = String(url || '').match(/jobs\.lever\.co\/([^/?#]+)/i);
  return match?.[1] || '';
}

function ashbyOrganizationFromUrl(url) {
  const match = String(url || '').match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
  return match?.[1] || '';
}

function ashbyJobUrl(organization, id) {
  if (!organization || !id) return '';
  return `https://jobs.ashbyhq.com/${encodeURIComponent(organization)}/${encodeURIComponent(id)}`;
}

function hostBuyer(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown buyer';
  }
}

function absoluteUrl(value, base) {
  try {
    return new URL(value, base).toString();
  } catch {
    return value || base;
  }
}

function origin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
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
  const contractHits = contractSignalHits(candidate);
  const missingRequiredContractSignal = Boolean(source.require_contract_signal) && contractHits.length === 0;
  const score = includeHits.length + (contractHits.length * 2) - (excludeHits.length * 4);
  const minScore = Number(source.min_score ?? 2);

  return {
    keep: score >= minScore && excludeHits.length === 0 && !missingRequiredContractSignal,
    score,
    includeHits,
    excludeHits,
    contractHits,
    missingRequiredContractSignal,
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
  if (typeof value === 'number') {
    const numericDate = new Date(value);
    if (Number.isFinite(numericDate.getTime())) return numericDate.toISOString().slice(0, 10);
  }
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
  if (value.name) return textValue(value.name);
  if (value.value) return textValue(value.value);
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
  const text = String(value || '').replace(/\s+/g, ' ');
  const money = '[$£€]\\s?\\d[\\d,]*(?:\\.\\d+)?\\s?(?:k|K|m|M)?';
  const range = `${money}(?:\\s?(?:-|–|to)\\s?[$£€]?\\s?\\d[\\d,]*(?:\\.\\d+)?\\s?(?:k|K|m|M)?)?`;
  const period = '(?:hr|hour|day|week|mo|month|year)';
  const patterns = [
    new RegExp(`${range}\\s?(?:/|per\\s+)\\s?${period}\\b`, 'i'),
    new RegExp(`\\b(?:rate|budget|compensation|salary|pay|base(?: cash)? comp)\\b[^.;\\n]{0,100}?${range}`, 'i'),
    new RegExp(`${money}\\s?(?:-|–|to)\\s?[$£€]?\\s?\\d[\\d,]*(?:\\.\\d+)?\\s?(?:k|K|m|M)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const budget = match[0].match(new RegExp(range, 'i'))?.[0]?.trim();
    if (budget && !/\b(?:million|billion)\b/i.test(budget)) return budget;
  }
  return '';
}

function hasContractSignal(value) {
  return contractSignalHits(value).length > 0;
}

function contractSignalHits(value) {
  const candidate = typeof value === 'object' && value !== null ? value : { description: String(value || '') };
  const titleNotes = `${candidate.title || ''} ${candidate.notes || ''}`;
  const all = `${titleNotes} ${candidate.description || ''}`;
  const hits = [];

  for (const { label, scope, pattern } of CONTRACT_SIGNAL_PATTERNS) {
    const haystack = scope === 'titleNotes' ? titleNotes : all;
    if (pattern.test(haystack)) hits.push(label);
  }

  return uniqueValues(hits);
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null || value === '') return [];
  return [value];
}

function uniqueTerms(values) {
  return [...new Set(values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
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
