// merge_all_duplicates.mjs
import { promises as fs } from 'fs';
import path from 'path';

const ledgerPath = path.resolve('c:/Users/Anirudh/Documents/Portfolio/Archival app/data/ledger.json');
const backupPath = path.resolve('c:/Users/Anirudh/Documents/Portfolio/Archival app/data/ledger.backup.json');

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshtein(a, b) {
  const al = a.length, bl = b.length;
  const dp = Array.from({ length: al + 1 }, (_, i) => i);
  for (let j = 1; j <= bl; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= al; i++) {
      const cur = dp[i];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return dp[al];
}

// Union‑Find structure for grouping duplicates
class DSU {
  constructor(n) { this.parent = new Array(n); for (let i = 0; i < n; i++) this.parent[i] = i; }
  find(x) { return this.parent[x] === x ? x : (this.parent[x] = this.find(this.parent[x])); }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.parent[rb] = ra; }
}

async function main() {
  const raw = await fs.readFile(ledgerPath, 'utf8');
  const data = JSON.parse(raw);
  const entries = data.entries;

  // backup original
  await fs.copyFile(ledgerPath, backupPath);
  console.log('Backup created at', backupPath);

  const n = entries.length;
  const dsu = new DSU(n);

  // Compare each pair (same year only) and union if similar
  for (let i = 0; i < n; i++) {
    const a = entries[i];
    for (let j = i + 1; j < n; j++) {
      const b = entries[j];
      if (a.year !== b.year) continue; // strong hint
      const titleDist = levenshtein(normalize(a.title), normalize(b.title));
      const orgDist = levenshtein(normalize(a.org), normalize(b.org));
      const roleDist = levenshtein(normalize(a.role), normalize(b.role));
      if (titleDist <= 4 || orgDist <= 3 || roleDist <= 3) {
        dsu.union(i, j);
      }
    }
  }

  // Gather groups
  const groupsMap = new Map(); // root -> [indices]
  for (let i = 0; i < n; i++) {
    const r = dsu.find(i);
    if (!groupsMap.has(r)) groupsMap.set(r, []);
    groupsMap.get(r).push(i);
  }

  const toRemove = new Set();
  for (const group of groupsMap.values()) {
    if (group.length <= 1) continue; // no duplicates
    // choose canonical entry: highest id (most recent) to keep
    let canonicalIdx = group[0];
    for (const idx of group) {
      if (entries[idx].id > entries[canonicalIdx].id) canonicalIdx = idx;
    }
    const canon = entries[canonicalIdx];
    // merge other entries into canonical
    for (const idx of group) {
      if (idx === canonicalIdx) continue;
      const dup = entries[idx];
      // merge evidence
      const existingEvidence = canon.evidence || [];
      const newEvidence = dup.evidence || [];
      const mergedEvidence = [...existingEvidence];
      for (const ev of newEvidence) {
        if (!mergedEvidence.find(e => JSON.stringify(e) === JSON.stringify(ev))) {
          mergedEvidence.push(ev);
        }
      }
      canon.evidence = mergedEvidence;
      // merge tags
      const tagSet = new Set([...(canon.tags || []), ...(dup.tags || [])]);
      canon.tags = Array.from(tagSet);
      const roleTagSet = new Set([...(canon.roleTags || []), ...(dup.roleTags || [])]);
      canon.roleTags = Array.from(roleTagSet);
      // merge notes (optional)
      if (dup.notes && dup.notes.trim()) {
        canon.notes = (canon.notes || '') + (canon.notes ? '\n' : '') + dup.notes;
      }
      // mark duplicate for removal
      toRemove.add(idx);
    }
    // Clean generic Milestone tag from canonical if present
    if (Array.isArray(canon.tags)) {
      canon.tags = canon.tags.filter(t => t.toLowerCase() !== 'milestone');
    }
    if (Array.isArray(canon.roleTags)) {
      canon.roleTags = canon.roleTags.filter(t => t.toLowerCase() !== 'milestone');
    }
    // Optional: Normalise org name – pick the most common non‑empty org in group
    const orgCounts = {};
    for (const idx of group) {
      const o = entries[idx].org?.trim();
      if (o) {
        orgCounts[o] = (orgCounts[o] || 0) + 1;
      }
    }
    const mostCommonOrg = Object.entries(orgCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
    if (mostCommonOrg) canon.org = mostCommonOrg;
  }

  // Build cleaned entries array
  const cleaned = entries.filter((_, i) => !toRemove.has(i));
  data.entries = cleaned;

  await fs.writeFile(ledgerPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Merged duplicates. Removed', toRemove.size, 'entries.');
}

main().catch(err => console.error('Error:', err));
