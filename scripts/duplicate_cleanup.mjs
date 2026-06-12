// duplicate_cleanup.mjs
// Utility to detect and merge duplicate ledger entries based on role + org (+ eraName) while preserving hierarchy.
const fs = require('fs');
const path = require('path');

const ledgerPath = path.resolve(__dirname, '../data/ledger.json');
const backupPath = ledgerPath + '.backup_' + Date.now();

function loadLedger() {
  const raw = fs.readFileSync(ledgerPath, 'utf8');
  return JSON.parse(raw);
}

function saveLedger(data) {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(ledgerPath, json, 'utf8');
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function mergeEntries(canonical, duplicate) {
  // Merge evidence (unique by url)
  const evidenceMap = new Map();
  (canonical.evidence || []).forEach(e => evidenceMap.set(e.url, e));
  (duplicate.evidence || []).forEach(e => evidenceMap.set(e.url, e));
  canonical.evidence = Array.from(evidenceMap.values());

  // Merge tags and roleTags (unique)
  const uniq = (arr) => Array.from(new Set((arr || []).map(t => t.trim())));
  canonical.tags = uniq([...canonical.tags, ...duplicate.tags]);
  canonical.roleTags = uniq([...canonical.roleTags, ...duplicate.roleTags]);

  // Merge description
  if (duplicate.description && duplicate.description.trim()) {
    canonical.description = (canonical.description || '') + '\n---\n' + duplicate.description;
  }
  // Merge notes
  const note = `Merged duplicate entry id ${duplicate.id} into this record.`;
  canonical.notes = (canonical.notes || '') + (canonical.notes ? '\n' + note : note);

  // Keep earliest date
  if (new Date(duplicate.date) < new Date(canonical.date)) {
    canonical.date = duplicate.date;
    canonical.year = duplicate.year;
    canonical.month = duplicate.month;
    canonical.day = duplicate.day;
  }
}

function groupDuplicates(entries) {
  const groups = {};
  for (const entry of entries) {
    if (!entry.role || !entry.org) continue;
    const key = `${entry.role.toLowerCase()}||${entry.org.toLowerCase()}||${(entry.eraName||'').toLowerCase()}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }
  return Object.values(groups).filter(g => g.length > 1);
}

function run({apply = false} = {}) {
  const ledger = loadLedger();
  const entries = ledger; // assuming top-level array
  const dupGroups = groupDuplicates(entries);
  const report = [];
  for (const group of dupGroups) {
    // sort by date then id
    const sorted = group.slice().sort((a,b) => new Date(a.date) - new Date(b.date) || a.id - b.id);
    const canonical = sorted[0];
    const toMerge = sorted.slice(1);
    report.push({canonicalId: canonical.id, mergedIds: toMerge.map(e=>e.id)});
    if (apply) {
      for (const dup of toMerge) {
        mergeEntries(canonical, dup);
        // remove dup from entries array
        const idx = entries.findIndex(e=>e.id===dup.id);
        if (idx!==-1) entries.splice(idx,1);
      }
    }
  }

  if (apply) {
    // backup original
    fs.copyFileSync(ledgerPath, backupPath);
    // add report as comment block at end
    const comment = '\n/* __duplicate_cleanup__\n' + JSON.stringify(report, null, 2) + '\n*/\n';
    const finalJson = JSON.stringify(entries, null, 2) + comment;
    fs.writeFileSync(ledgerPath, finalJson, 'utf8');
    console.log('Duplicate cleanup applied. Backup:', backupPath);
    console.log('Report:', JSON.stringify(report, null, 2));
  } else {
    console.log('Duplicate groups found (dry run):', JSON.stringify(report, null, 2));
  }
}

// CLI handling
const args = process.argv.slice(2);
const apply = args.includes('--apply');
run({apply});
