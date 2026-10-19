// Truth checks for the public ledger. Run before every deploy:
//
//   node scripts/check-ledger.mjs
//
// Each rule exists because the site once shipped the problem it catches
// (see TRUTH-AUDIT.md, 19 Oct 2026). Exits 1 on any failure.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ledger = JSON.parse(readFileSync(resolve(root, "data/ledger.json"), "utf8"));
const cs = JSON.parse(readFileSync(resolve(root, "data/case-studies.json"), "utf8")).caseStudies;

const FAMILIES = new Set(["Director", "Cinematographer", "Photographer", "Editor", "Art Director", "Producer",
  "Designer", "Founder", "Teaching", "Research", "Leadership & Volunteering"]);
const NO_ROLE_TYPES = new Set(["Certification", "Skills", "Internship"]);
const PRIVATE = ["evidenceSource", "evidenceDetail", "notes", "identityTag", "clientGroup", "clientOutcome"];
const PRIVATE_SHEETS = ["people", "firsts", "roles", "films", "sourceWorkbook"];

const fails = [];
const fail = (where, msg) => fails.push(`${where}: ${msg}`);

for (const k of PRIVATE_SHEETS) if (k in ledger) fail("ledger", `private sheet "${k}" is in the public file`);

const ids = new Set();
for (const e of ledger.entries) {
  const at = `#${e.id} "${e.title}"`;
  if (ids.has(e.id)) fail(at, "duplicate id");
  ids.add(e.id);

  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(e.date || "")) fail(at, `date "${e.date}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
  if (Number(String(e.date).slice(0, 4)) !== e.year) fail(at, `year ${e.year} disagrees with date ${e.date}`);

  // A year in the title must agree with the date ("(DP, 2026)" on a 2017 film).
  const span = (e.title.match(/\((?:[^()]*,\s*)?((?:19|20)\d{2})(?:-((?:19|20)\d{2}))?\)\s*$/) || []);
  if (span[1]) {
    const from = Number(span[1]), to = Number(span[2] || span[1]);
    if (e.year < from - 1 || e.year > to) fail(at, `title years ${from}${span[2] ? "-" + to : ""} vs date ${e.date}`);
  }

  if (!Array.isArray(e.roles)) fail(at, "roles must be an array of role families");
  for (const r of e.roles || []) if (!FAMILIES.has(r)) fail(at, `"${r}" is not a role family`);
  if (!(e.roles || []).length && !NO_ROLE_TYPES.has(e.activityType)) fail(at, "no role family (only certifications, skills and internships may have none)");
  if ((e.roles || []).length && !String(e.role || "").trim()) fail(at, "has role families but no exact credit in `role`");

  if (!String(e.clientCanonical || "").trim() && !String(e.org || "").trim()) fail(at, "no client and no org: the Roles page would have nothing honest to show");
  if (e.clientCanonical && e.excludeFromClients) fail(at, "has a client but is excluded from clients");

  for (const k of PRIVATE) if (k in e) fail(at, `private field "${k}" in the public file`);

  for (const field of ["title", "description", "role"]) {
    if (/—/.test(e[field] || "")) fail(at, `em-dash in ${field}`);
  }

  const seen = new Set();
  for (const v of e.evidence || []) {
    const key = String(v.src || "").replace(/\.(png|webp)$/i, "");
    if (seen.has(key)) fail(at, `duplicate evidence ${v.src}`);
    seen.add(key);
  }
}

for (const c of cs) {
  for (const m of c.milestones || []) {
    if (m.ledgerEntryId != null && !ids.has(m.ledgerEntryId)) fail(`case study ${c.id}`, `milestone "${m.title}" links to missing entry #${m.ledgerEntryId}`);
  }
}

if (fails.length) {
  console.error(`check-ledger: ${fails.length} problem(s)\n  ` + fails.join("\n  "));
  process.exit(1);
}
const clients = new Set(ledger.entries.map((e) => e.clientCanonical).filter(Boolean));
const fam = new Set(ledger.entries.flatMap((e) => e.roles));
console.log(`check-ledger: ok. ${ledger.entries.length} entries, ${fam.size} role families, ${clients.size} clients.`);
