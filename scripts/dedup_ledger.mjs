// dedup_ledger.mjs
// Run with: node scripts/dedup_ledger.mjs
import fs from 'fs';
import path from 'path';
import { distance } from '../utils/levenshtein.js';

const ledgerPath = path.resolve('data', 'ledger.json');
const outPath = path.resolve('data', 'ledger-deduped.json');

const raw = fs.readFileSync(ledgerPath, 'utf-8');
const obj = JSON.parse(raw);
const entries = obj.entries;

// Normalisation helpers
function norm(str) {
  return (str || '').trim().toLowerCase();
}
function titleKey(entry) {
  return norm(entry.title);
}
function orgKey(entry) {
  return norm(entry.org);
}

// Parameters for fuzzy matching
const TITLE_MAX_DIST = 3; // max Levenshtein distance for titles
const ORG_MAX_DIST = 3;   // max distance for organization names (optional)

// Group entries by year, then fuzzy title/org similarity
const groups = new Map(); // key: year, value: array of groups

entries.forEach(e => {
  const yr = e.year || 'unknown';
  if (!groups.has(yr)) groups.set(yr, []);
  const yearGroups = groups.get(yr);

  // Try to find an existing group where title and org are similar
  let matchedGroup = null;
  for (const g of yearGroups) {
    const rep = g.representative; // first entry in the group
    const titleDist = distance(titleKey(e), titleKey(rep));
    if (titleDist <= TITLE_MAX_DIST) {
      // If both have org fields, also check org distance; otherwise ignore
      const orgDist = distance(orgKey(e), orgKey(rep));
      if (orgKey(e) && orgKey(rep) && orgDist > ORG_MAX_DIST) continue;
      matchedGroup = g;
      break;
    }
  }

  if (matchedGroup) {
    matchedGroup.entries.push(e);
  } else {
    // Create a new group with this entry as the first member and representative
    yearGroups.push({ representative: e, entries: [e] });
  }
});

let mergedCount = 0;
// Now process each group to pick a parent and link children
for (const [, yearGroups] of groups.entries()) {
  for (const g of yearGroups) {
    const group = g.entries;
    if (group.length <= 1) continue;
    // Choose parent: entry with most description/evidence length
    let parent = group.reduce((p, c) => {
      const pScore = (p.description?.length || 0) + (p.evidence?.length || 0);
      const cScore = (c.description?.length || 0) + (c.evidence?.length || 0);
      return cScore > pScore ? c : p;
    }, group[0]);
    const childIds = [];
    group.forEach(e => {
      if (e.id === parent.id) return;
      e.parentId = parent.id;
      // Merge tags and roleTags (unique values)
      const mergeArray = (a1, a2) => {
        const set = new Set([...(a1 || []), ...(a2 || [])]);
        return Array.from(set);
      };
      parent.tags = mergeArray(parent.tags, e.tags);
      parent.roleTags = mergeArray(parent.roleTags, e.roleTags);
      childIds.push(e.id);
    });
    if (!parent.linkedChildren) parent.linkedChildren = [];
    parent.linkedChildren.push(...childIds);
    mergedCount += group.length - 1;
  }
}

fs.writeFileSync(outPath, JSON.stringify({ entries }, null, 2), 'utf-8');
console.log(`Deduplication complete. Merged ${mergedCount} duplicate entries.`);
