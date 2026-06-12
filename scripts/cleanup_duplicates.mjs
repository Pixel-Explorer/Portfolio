// cleanup_duplicates.mjs
// Backup ledger.json and remove duplicate entries.
import { promises as fs } from 'fs';
import path from 'path';

const ledgerPath = path.resolve('c:/Users/Anirudh/Documents/Portfolio/Archival app/data/ledger.json');
const backupPath = path.resolve('c:/Users/Anirudh/Documents/Portfolio/Archival app/data/ledger.backup.json');

async function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function levenshtein(a, b) {
  const matrix = [];
  const al = a.length;
  const bl = b.length;
  for (let i = 0; i <= al; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bl; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }
  return matrix[al][bl];
}

async function main() {
  // Load ledger
  const data = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
  const entries = data.entries;

  // Backup
  await fs.copyFile(ledgerPath, backupPath);
  console.log('Backup created at', backupPath);

  // Helper to find duplicate groups
  const groups = new Map();

  for (const entry of entries) {
    const key = `${entry.year}|${entry.role}|${entry.org}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const toRemove = new Set();
  const merged = [];

  for (const [key, group] of groups.entries()) {
    if (group.length <= 1) continue;
    // Within group, also check title similarity
    const primary = group.reduce((best, cur) => (best.id > cur.id ? best : cur)); // keep highest id as parent
    for (const entry of group) {
      if (entry.id === primary.id) continue;
      // title similarity check
      const d = await levenshtein(entry.title || '', primary.title || '');
      if (d <= 3) {
        // merge evidence
        const existingEvidence = primary.evidence || [];
        const newEvidence = entry.evidence || [];
        const mergedEvidence = [...existingEvidence];
        for (const ev of newEvidence) {
          if (!mergedEvidence.find(e => JSON.stringify(e) === JSON.stringify(ev))) {
            mergedEvidence.push(ev);
          }
        }
        primary.evidence = mergedEvidence;
        // merge tags
        const tagSet = new Set([...(primary.tags || []), ...(entry.tags || [])]);
        primary.tags = Array.from(tagSet);
        // merge roleTags similarly
        const roleSet = new Set([...(primary.roleTags || []), ...(entry.roleTags || [])]);
        primary.roleTags = Array.from(roleSet);
        // mark removal
        toRemove.add(entry.id);
      }
    }
  }

  data.entries = cleaned;
  // Remove "Milestone" tag from all entries
  data.entries.forEach(entry => {
    if (Array.isArray(entry.tags)) entry.tags = entry.tags.filter(t => t !== "Milestone");
    if (Array.isArray(entry.roleTags)) entry.roleTags = entry.roleTags.filter(t => t !== "Milestone");
  });
  await fs.writeFile(ledgerPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Removed duplicate entries:', Array.from(toRemove));
}

main().catch(err => console.error(err));
