// Consolidate ledger entries into merged single entries per the user's instructions:
//   - AIESEC (6 entries) → one
//   - Chhello Divas (2 entries) → one  
//   - Pixelate (5 entries) → one
//   - KindHealth (2 entries) → one
//   - BBA (2 entries) → one
// Keeps the earliest entry id; unions evidence (deduped by src/url); merges descriptions.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'data', 'ledger.json');
const BAK = path.join(ROOT, 'data', 'ledger.json.bak');

const raw = fs.readFileSync(SRC, 'utf-8');
const data = JSON.parse(raw);
console.log(`Loaded ${data.entries.length} entries`);

fs.writeFileSync(BAK, raw);
console.log(`Backup written to ${BAK}`);

function unionEvidence(list) {
  const seen = new Set();
  const r = [];
  for (const e of list) for (const ev of (e.evidence || [])) {
    const k = ev.src || ev.url || '';
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    r.push(ev);
  }
  return r;
}
function unionTags(list, f) { return [...new Set(list.flatMap(e => [...(e[f] || [])]))]; }
function pickModel(list) { for (const e of list) if (e.model) return e.model; return null; }
function unionRoles(list, f) { return [...new Set(list.flatMap(e => [...(e[f] || [])]))]; }

const consolidations = [
  {
    label: 'AIESEC', ids: [9, 11, 13, 15, 17, 18],
    title: 'AIESEC: Induction, Design & Leadership (2010–2012)',
    description: 'AIESEC was the crucible. Inducted on 14 October 2010 — the day my structured creative life began. Over two years I designed the first commercial posters and t-shirts for the OGX Fair, was elected VP Communications and later Local Committee Coordinator (the top chapter role), and led JNC 2012 and GoGujarat. AIESEC taught me design under deadline, leadership over volunteers, and the discipline of making things happen with few resources.',
    role: 'Designer / Leader', org: 'AIESEC Vidyanagar',
    evidenceSource: 'Gmail + LinkedIn', evidenceDetail: 'Multiple sources',
    identityTag: 'AIESEC alumni', status: 'Completed', activityType: 'Milestone',
    location: 'Anand', era: '2', eraName: 'AIESEC', excludeFromClients: false,
  },
  {
    label: 'Chhello Divas', ids: [42, 46],
    title: 'Chhello Divas: Unit Stills, BTS & Release (2015)',
    description: "Unit Still Photographer and BTS videographer on Krishnadev Yagnik's Gujarati cult classic Chhello Divas (released 20 Nov 2015). My behind-the-scenes coverage went on to 539,000+ combined YouTube views — the most-seen credit of my early film career. The film became a genuine cult classic, and this project remains the most-cherished entry in my portfolio.",
    role: 'Unit Still Photographer', org: 'Krishnadev Yagnik',
    evidenceSource: 'YouTube + Portfolio', evidenceDetail: 'Multiple sources',
    identityTag: 'Cinematographer', status: 'Completed', activityType: 'Project',
    location: 'Gujarat', era: '5', eraName: 'Hustle + Chhello Divas', excludeFromClients: false,
  },
  {
    label: 'Pixelate', ids: [53, 54, 57, 71, 97],
    title: 'Pixelate: Blockchain Photo Startup (2017–2024)',
    description: 'Co-founded Pixelate with Ronak P Amin and Pranav Burnwal — an AMM for camera-sensor photographs ("Pixel Tokens"). Won the 54-hour Startup Weekend Bangalore challenge (2017), drafted the whitepaper (2018), joined the NEAR Protocol Accelerator (2021), and received a $15,000 NEAR Fast Grant on 14 Oct 2021 — exactly 11 years after my AIESEC induction. The venture wound down in July 2024 after a 7-year run.',
    role: 'Co-founder', org: 'Pixelate',
    evidenceSource: 'NEAR Medium + LinkedIn', evidenceDetail: 'Multiple sources',
    identityTag: 'Co-founder + Blockchain Expert', status: 'Completed', activityType: 'Milestone',
    location: 'Anand → Ahmedabad', era: '6', eraName: 'Pixelate', excludeFromClients: false,
  },
  {
    label: 'KindHealth', ids: [90, 91],
    title: 'KindHealth: Health-Tech Venture (2024)',
    description: 'Co-founded KindHealth, a health-tech venture, in early 2024. Built the financial model and initial product concept. Status: Stalled.',
    role: 'Co-founder', org: 'KindHealth',
    evidenceSource: 'Internal docs', evidenceDetail: '',
    identityTag: 'Co-founder', status: 'Stalled', activityType: 'Milestone',
    location: '', era: '8', eraName: 'KindHealth', excludeFromClients: false,
  },
  {
    label: 'BBA', ids: [7, 30],
    title: 'BBA in Information Technology: SEMCOM (2009–2013)',
    description: 'Completed a Bachelor of Business Administration in Information Technology at SEMCOM, Vallabh Vidyanagar (2009–2013). The campus that shaped the next decade, from student to visiting faculty — a 17+ year relationship with the institution.',
    role: 'Student', org: 'SEMCOM College',
    evidenceSource: 'LinkedIn', evidenceDetail: 'Education',
    identityTag: 'Student', status: 'Completed', activityType: 'Education',
    location: 'Anand', era: '1', eraName: 'First emails', excludeFromClients: false,
  },
];

// Collect ALL ids to remove upfront
const allIdsToRemove = new Set(consolidations.flatMap(c => c.ids));
const mergedEntries = [];

for (const cfg of consolidations) {
  const members = data.entries.filter(e => cfg.ids.includes(e.id));
  if (members.length === 0) { console.warn(`  ⚠ No entries for ${cfg.label}`); continue; }
  
  const sorted = [...members].sort((a, b) => (a.year || 0) - (b.year || 0) || (a.month || 0) - (b.month || 0));
  const primary = sorted[0];
  
  const merged = {
    ...primary,
    id: primary.id,
    title: cfg.title,
    year: primary.year || 0,
    month: primary.month || 1,
    date: primary.date || '',
    description: cfg.description,
    role: cfg.role,
    org: cfg.org,
    location: cfg.location,
    evidenceSource: cfg.evidenceSource,
    evidenceDetail: cfg.evidenceDetail,
    identityTag: cfg.identityTag,
    status: cfg.status,
    activityType: cfg.activityType,
    era: cfg.era,
    eraName: cfg.eraName,
    roleTags: unionTags(members, 'roleTags'),
    tags: unionTags(members, 'tags'),
    evidence: unionEvidence(members),
    roles: unionRoles(members, 'roles'),
    roleGroups: unionRoles(members, 'roleGroups'),
    model: pickModel(members),
    excludeFromClients: primary.excludeFromClients || false,
    notes: '',
    clientCanonical: primary.clientCanonical || '',
    clientGroup: primary.clientGroup || '',
    clientOutcome: primary.clientOutcome || '',
    _consolidated: true,
    _mergedIds: cfg.ids,
  };
  
  mergedEntries.push(merged);
  console.log(`  ✅ ${cfg.label}: ${members.length} entries → merged (id=${merged.id})`);
}

// Remove originals, add merged, sort
data.entries = data.entries.filter(e => !allIdsToRemove.has(e.id));
data.entries.push(...mergedEntries);
data.entries.sort((a, b) => (a.year || 0) - (b.year || 0) || (a.month || 0) - (b.month || 0) || (a.id || 0) - (b.id || 0));

fs.writeFileSync(SRC, JSON.stringify(data, null, 2));
console.log(`\nDone! ${data.entries.length} entries written to ledger.json`);
console.log(`Removed ${allIdsToRemove.size} old entries, added ${mergedEntries.length} merged`);
