// find_duplicates.mjs
// Scans ledger.json and prints groups of entries that appear to be duplicates
// based on fuzzy title (Levenshtein distance <= 3) and same year.
import fs from 'fs';
import path from 'path';
import { distance } from '../utils/levenshtein.js';

const ledgerPath = path.resolve('data', 'ledger.json');
const raw = fs.readFileSync(ledgerPath, 'utf-8');
const { entries } = JSON.parse(raw);

function norm(str) { return (str || '').trim().toLowerCase(); }

const TITLE_MAX_DIST = 3;

// Group by year, then fuzzy title similarity
const groups = [];
entries.forEach(entry => {
  const yr = entry.year || 'unknown';
  // try to find existing group
  let placed = false;
  for (const g of groups) {
    if (g.year !== yr) continue;
    const rep = g.representative;
    if (distance(norm(entry.title), norm(rep.title)) <= TITLE_MAX_DIST) {
      g.entries.push(entry);
      placed = true;
      break;
    }
  }
  if (!placed) {
    groups.push({ year: yr, representative: entry, entries: [entry] });
  }
});

// Filter groups with more than one entry (potential duplicates)
const dupGroups = groups.filter(g => g.entries.length > 1);

if (dupGroups.length === 0) {
  console.log('No potential duplicate groups found.');
} else {
  console.log(`Found ${dupGroups.length} potential duplicate group(s):`);
  dupGroups.forEach((g, idx) => {
    console.log(`\nGroup ${idx + 1} (year: ${g.year}):`);
    g.entries.forEach(e => {
      console.log(`  id:${e.id} title:"${e.title}" org:"${e.org}"`);
    });
  });
  console.log('\nPlease review these groups and tell me which ones you want to merge (e.g., "Group 1"), and which entry should be kept as the parent (by id).');
}
