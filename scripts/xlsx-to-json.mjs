// xlsx-to-json.mjs
// One-time migration: anirudh-ledger-v4.xlsx → data/ledger.json
//
// Mirrors the schema produced by data/ledger-data.js (the runtime browser loader)
// so the app can swap from live-xlsx-parsing to JSON-fetch without UI changes.
//
// Adds an empty `evidence: []` array on each entry — the editor populates this
// going forward. The legacy string columns `evidenceSource` / `evidenceDetail`
// are preserved unchanged so old data still renders.
//
// Usage:
//   node scripts/xlsx-to-json.mjs              # uses default paths
//   node scripts/xlsx-to-json.mjs IN OUT       # explicit input/output

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const inputPath  = process.argv[2] || resolve(projectRoot, "data/anirudh-ledger-v4.xlsx");
const outputPath = process.argv[3] || resolve(projectRoot, "data/ledger.json");

if (!existsSync(inputPath)) {
  console.error(`xlsx not found at ${inputPath}`);
  process.exit(1);
}

// ────────── normalisation helpers — ported from data/ledger-data.js ─────────

const normalizeKey = (k) => String(k || "").trim().toLowerCase();

function parseTags(value) {
  const tags = Array.isArray(value)
    ? value.map((t) => String(t || "").trim())
    : String(value || "").split(/[,;]+/).map((t) => t.trim());
  return [...new Set(tags.filter(Boolean))];
}

function parseDateParts(entry) {
  const date = String(entry.date || "").trim();
  const m = date.match(/^(?:~\s*)?(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/);
  if (!m) return entry;
  const year = Number(m[1]);
  const month = Number(m[2] || 1);
  const day = Number(m[3] || 1);
  return {
    ...entry,
    year: entry.year || year,
    month: entry.month || month,
    day: entry.day || day,
  };
}

function formatWeekKey(entry) {
  const year = Number(entry.year);
  const month = Number(entry.month) || 1;
  const day = Number(entry.day) || 1;
  if (!year) return undefined;
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const wY = d.getUTCFullYear();
  const wN = Math.ceil((((d - new Date(Date.UTC(wY, 0, 1))) / 86400000) + 1) / 7);
  return `${wY}-W${String(wN).padStart(2, "0")}`;
}

const FIELD_MAP = {
  id: "id",
  year: "year",
  month: "month",
  quarter: "quarter",
  date: "date",
  era: "era",
  "era name": "eraName",
  "activity type": "activityType",
  title: "title",
  role: "role",
  "org/client": "org",
  "org client": "org",
  org: "org",
  location: "location",
  description: "description",
  "evidence source": "evidenceSource",
  "evidence detail": "evidenceDetail",
  "earnings amount": "earningsAmount",
  currency: "currency",
  "identity tag": "identityTag",
  status: "status",
  "role tags": "roleTags",
  notes: "notes",
  tags: "tags",
  weekkey: "weekKey",
  "week key": "weekKey",
};

function mapEntryFields(rawEntry) {
  const entry = {};
  for (const [rawKey, rawValue] of Object.entries(rawEntry)) {
    const nk = normalizeKey(rawKey);
    const mk = FIELD_MAP[nk] || nk.replace(/[^a-z0-9]/g, "");
    if (!mk) continue;
    let value = rawValue;
    if (mk === "year" || mk === "month" || mk === "day" || mk === "quarter") {
      value = Number(rawValue) || undefined;
    } else if (mk === "earningsAmount") {
      const n = Number(rawValue);
      value = Number.isFinite(n) ? n : String(rawValue || "").trim();
    } else {
      value = String(rawValue || "").trim();
    }
    entry[mk] = value;
  }
  if (!entry.era && entry.eraName) entry.era = entry.eraName;
  entry.tags = parseTags(entry.tags || entry.roleTags);
  entry.roleTags = parseTags(entry.roleTags || entry.tags);
  const p = parseDateParts(entry);
  entry.year = p.year || entry.year;
  entry.month = p.month || entry.month;
  entry.day = p.day || entry.day;
  if (!entry.weekKey) entry.weekKey = formatWeekKey(entry);
  if (entry.id !== undefined && entry.id !== null) {
    const n = Number(entry.id);
    entry.id = Number.isFinite(n) && String(entry.id).trim() !== "" ? n : String(entry.id);
  }
  // New in Pass 04: per-entry media collection used by the editor.
  // Each item is { type: 'image' | 'video' | 'youtube', src?: string, url?: string, caption?: string }
  entry.evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
  return entry;
}

function buildTagSummary(entries) {
  const counts = {};
  for (const e of entries) {
    const t = Array.from(new Set([...(e.tags || []), ...(e.roleTags || [])]));
    for (const tag of t) counts[tag] = (counts[tag] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function parseKeyValueRows(rows) {
  const r = {};
  for (const row of rows) {
    const keys = Object.keys(row);
    if (!keys.length) continue;
    const k = row[keys[0]];
    const v = row[keys[1]];
    if (!k) continue;
    r[String(k).trim()] = Number(v) || String(v).trim();
  }
  return r;
}

function parseWorkbook(workbook) {
  const data = {};
  const sheetNames = workbook.SheetNames || [];
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
    const lower = normalizeKey(name);
    if (!rows.length) continue;
    if (lower.includes("master") || lower.includes("entry"))      data.entries = rows;
    else if (lower.includes("weekly") || lower.includes("email")) data.weeklyEmailCounts = parseKeyValueRows(rows);
    else if (lower.includes("tag"))                               data.tags = rows;
    else if (lower.includes("role"))                              data.roles = rows;
    else if (lower.includes("first"))                             data.firsts = rows;
    else if (lower.includes("person") || lower.includes("people")) data.people = rows;
    else if (lower.includes("film"))                              data.films = rows;
    else if (lower.includes("earning"))                           data.earnings = rows;
    else if (lower.includes("meta") || lower.includes("config") || lower.includes("info")) {
      for (const row of rows) {
        const keys = Object.keys(row);
        if (keys.length >= 2) data[String(row[keys[0]]).trim()] = row[keys[1]];
      }
    } else if (!data.entries && sheetNames.length === 1) {
      data.entries = rows;
    }
  }
  if (!data.entries && sheetNames.length) {
    const masterName = sheetNames.find((n) => normalizeKey(n).includes("master"));
    const sheet = workbook.Sheets[masterName || sheetNames[0]];
    data.entries = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
  }
  if (Array.isArray(data.entries)) data.entries = data.entries.map(mapEntryFields);
  if ((!data.tags || !data.tags.length) && Array.isArray(data.entries)) data.tags = buildTagSummary(data.entries);
  if (!data.yearStart || !data.yearEnd) {
    const years = (data.entries || []).map((e) => Number(e.year)).filter(Boolean);
    if (years.length) {
      data.yearStart = Math.min(...years);
      data.yearEnd = Math.max(...years);
    }
  }
  return data;
}

// ────────── run ──────────

const buf = readFileSync(inputPath);
const wb = xlsx.read(buf, { type: "buffer" });
const data = parseWorkbook(wb);
data.generatedAt = new Date().toISOString();
data.sourceWorkbook = inputPath;
data.schemaVersion = 2;   // version 1 was xlsx-only; 2 adds evidence[]

writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf8");
console.log(`Wrote ${outputPath}`);
console.log(`  ${(data.entries || []).length} entries`);
console.log(`  years ${data.yearStart}–${data.yearEnd}`);
console.log(`  ${(data.tags || []).length} tags`);
