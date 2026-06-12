// clean_ledger.mjs
// Reads data/ledger.json, removes entry id 46, strips "Milestone" from tags/roleTags, dedupes arrays, writes data/ledger-deduped.json
import fs from 'fs';
import path from 'path';

const ledgerPath = path.resolve('data', 'ledger.json');
const outPath = path.resolve('data', 'ledger-deduped.json');
const raw = fs.readFileSync(ledgerPath, 'utf-8');
const obj = JSON.parse(raw);
let entries = obj.entries;

// Remove entry with id 46
entries = entries.filter(e => e.id !== 46);

// Helper to dedupe array
const uniq = arr => Array.from(new Set(arr));

entries = entries.map(e => {
  // Clean tags
  if (Array.isArray(e.tags)) {
    e.tags = uniq(e.tags.filter(t => t !== 'Milestone'));
  }
  if (Array.isArray(e.roleTags)) {
    e.roleTags = uniq(e.roleTags.filter(t => t !== 'Milestone'));
  }
  return e;
});

fs.writeFileSync(outPath, JSON.stringify({ entries }, null, 2), 'utf-8');
console.log('Cleaned ledger written to', outPath);
