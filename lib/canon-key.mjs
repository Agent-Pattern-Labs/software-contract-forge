import { createHash } from 'crypto';

import { slugify } from './text.mjs';

export function urlKey(value) {
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

export function opportunityKey({ url, source, buyer, title }) {
  const sourceKey = url ? urlKey(url) : slugify(source || 'manual');
  return `opportunity:${sourceKey}:${slugify(buyer)}:${slugify(title)}`;
}
