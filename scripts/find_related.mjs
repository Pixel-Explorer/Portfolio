// find_related.mjs
// Scan ledger.json and output candidate duplicate groups based on shared keywords and fuzzy title distance.
import fs from 'fs';
import path from 'path';
import { distance as lev } from '../utils/levenshtein.js';

const ledgerPath = path.resolve('data', 'ledger.json');
const { entries } = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));

const TITLE_MAX_DIST = 6; // allow a bit more variation
const KEYWORD_MIN_LEN = 4; // ignore very short words

function words(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= KEYWORD_MIN_LEN);
}

// Build inverted index word -> entry indices
const index = new Map();
entries.forEach((e, i) => {
  words(e.title).forEach(w => {
    if (!index.has(w)) index.set(w, []);
    index.get(w).push(i);
  });
});

const groups = [];
const used = new Set();

entries.forEach((e, i) => {
  if (used.has(i)) return;
  const candidateSet = new Set();
  words(e.title).forEach(w => {
    index.get(w).forEach(idx => candidateSet.add(idx));
  });
  const candidates = [...candidateSet].filter(j => j !== i);
  const similar = candidates.filter(j => {
    const other = entries[j];
    // same year (or both undefined) is a strong hint
    if (e.year && other.year && e.year !== other.year) return false;
    // fuzzy title distance
    return lev(e.title.toLowerCase(), other.title.toLowerCase()) <= TITLE_MAX_DIST;
  });
  if (similar.length >= 1) {
    const group = [i, ...similar];
    group.forEach(idx => used.add(idx));
    groups.push(group.map(idx => entries[idx]));
  }
});

if (groups.length === 0) {
  console.log('No related entry groups found.');
} else {
  console.log(`Found ${groups.length} related group(s):\n`);
  groups.forEach((g, idx) => {
    console.log(`Group ${idx + 1}:`);
    g.forEach(e => {
      console.log(
        `  id:${e.id} year:${e.year} title:\"${e.title}\" org:\"${e.org}\" era:\"${e.eraName}\" tags:${JSON.stringify(e.tags)}`
      );
    });
    console.log('');
  });
  console.log('Review the groups above and tell me which ID should be kept as the parent for each group, and which IDs should become children (by id).');
}
