// Wire proof folders into ledger.json entries.
//
// Scan all files in proof subfolders, build evidence items:
//   raw image → type:"image", src pointing at sibling .webp
//   video     → type:"video", youtubePending:true
//   pdf       → type:"pdf"
//
// Numbered folders → MERGE into same-id entry.
// Named folders §4b → MERGE into specific entry.
// Named folders §4c → CREATE new draft entries.
//
// Usage: node scripts/wire-proof-evidence.mjs
//
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.cwd();
const PROOF = join(root, "public/proof");
const LEDGER_PATH = join(root, "data/ledger.json");

const RAW_IMG_RE = /\.(jpe?g|png|tiff?)$/i;
const VIDEO_RE = /\.(mp4|mov)$/i;
const PDF_RE = /\.(pdf)$/i;

// 4a. Numbered folders → same-id entry
const NUMBERED = [78, 79, 83, 98, 126, 127];

// 4b. Named folders → attach to existing entry
const NAMED_ATTACH = {
  "Chello Divas": 42,
  "Diana": 117,
  "Iti music video": 65,
  "Jadi Duty": 70,
  "Khyaal": 60,
  "Kind Health": 90,
  "Sameer Movie bts": 121,
  "Serena music video": 84,
  "WOW": 77,
  "Weddings": 36,
  "Haus Studio Aesthetics": 76,
};

// 4c. Named folders → create new entry
const NAMED_NEW = [
  { folder: "Dell TVC ad", title: "Dell TVC ad", year: "" },
  { folder: "Home Halt - brand and web development", title: "Home Halt — brand & web development", year: "" },
  { folder: "My village tea branding", title: "My Village Tea branding", year: "" },
  { folder: "Passport movie bts", title: "Passport (film) — BTS / unit stills", year: "" },
  { folder: "Swach Bharat Abhiyam - Documentation", title: "Swachh Bharat Abhiyan — documentation", year: "" },
  { folder: "Travel film - kalarigram mahashivratri celebration 2025", title: "Kalarigram Mahashivratri 2025 — travel film", year: 2025 },
];

function scanFolder(folderPath, folderName) {
  const items = [];
  if (!existsSync(folderPath)) { console.warn(`  ⚠ Folder not found: ${folderPath}`); return items; }
  const entries = readdirSync(folderPath, { withFileTypes: true }).filter(e => e.isFile());
  for (const entry of entries) {
    const ext = extname(entry.name);
    // Skip .webp files — they're the optimizer output, reference via raw source
    if (/\.webp$/i.test(ext)) continue;

    let item = null;
    if (RAW_IMG_RE.test(ext)) {
      // Point at the optimized .webp sibling
      const webpName = entry.name.replace(RAW_IMG_RE, ".webp");
      item = { type: "image", src: `public/proof/${folderName}/${webpName}`, caption: "" };
    } else if (VIDEO_RE.test(ext)) {
      item = { type: "video", src: `public/proof/${folderName}/${entry.name}`, caption: "▶ YouTube upload pending", youtubePending: true };
    } else if (PDF_RE.test(ext)) {
      item = { type: "pdf", src: `public/proof/${folderName}/${entry.name}`, caption: "" };
    }
    if (item) items.push(item);
  }
  return items;
}

function dedupeEvidence(existing, newItems) {
  const srcSet = new Set(existing.map(e => e.src));
  for (const item of newItems) {
    if (!srcSet.has(item.src)) {
      existing.push(item);
      srcSet.add(item.src);
    }
  }
  return existing;
}

const data = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
const entries = data.entries;
let maxId = Math.max(...entries.map(e => e.id));

console.log(`Read ${entries.length} entries, max id ${maxId}`);

// 1. Numbered folders → merge
for (const id of NUMBERED) {
  const folderName = String(id);
  const folderPath = join(PROOF, folderName);
  const entry = entries.find(e => e.id === id);
  if (!entry) { console.warn(`  ⚠ Entry ${id} not found`); continue; }
  const items = scanFolder(folderPath, folderName);
  const oldLen = (entry.evidence || []).length;
  entry.evidence = dedupeEvidence(entry.evidence || [], items);
  console.log(`  #${id} "${entry.title}": ${oldLen} → ${entry.evidence.length} items`);
}

// 2. Named folders → attach to existing
for (const [folder, targetId] of Object.entries(NAMED_ATTACH)) {
  const folderPath = join(PROOF, folder);
  const entry = entries.find(e => e.id === targetId);
  if (!entry) { console.warn(`  ⚠ Entry ${targetId} not found for "${folder}"`); continue; }
  const items = scanFolder(folderPath, folder);
  const oldLen = (entry.evidence || []).length;
  entry.evidence = dedupeEvidence(entry.evidence || [], items);
  console.log(`  #${targetId} "${entry.title}": +${items.length} from "${folder}" (was ${oldLen}, now ${entry.evidence.length})`);
}

// 3. New draft entries
for (const spec of NAMED_NEW) {
  maxId++;
  const folderPath = join(PROOF, spec.folder);
  const items = scanFolder(folderPath, spec.folder);
  const newEntry = {
    id: maxId,
    year: spec.year,
    date: "",
    era: "",
    eraName: "",
    activityType: "",
    title: spec.title,
    role: "",
    org: "",
    location: "",
    description: "",
    evidenceSource: "Drive",
    evidenceDetail: "",
    earningsAmount: 0,
    currency: "",
    identityTag: "",
    status: "Draft",
    roleTags: [],
    notes: "",
    tags: [],
    weekKey: "",
    evidence: items,
  };
  entries.push(newEntry);
  console.log(`  NEW #${maxId}: "${spec.title}" (${items.length} evidence items)`);
}

data.savedAt = new Date().toISOString();
writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2));
console.log(`\nDone. ${entries.length} entries written to ledger.json`);
