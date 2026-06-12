// generate_duplicate_report.mjs
// Reads data/ledger.json and creates a markdown report of potential duplicate titles, client names, and role names.
import { promises as fs } from 'fs';
import path from 'path';

const ledgerPath = path.resolve('c:/Users/Anirudh/Documents/Portfolio/Archival app/data/ledger.json');
const reportPath = path.resolve('c:/Users/Anirudh/.gemini/antigravity/brain/e691cccc-4702-4695-9ded-6a14d69a37f1/duplicate_report.md');

function normalize(str) {
  return str?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
}

async function main() {
  const raw = await fs.readFile(ledgerPath, 'utf8');
  const data = JSON.parse(raw);
  const entries = data.entries || [];
  const titleMap = new Map();
  const orgMap = new Map();
  const roleMap = new Map();

  for (const e of entries) {
    const t = normalize(e.title);
    const o = normalize(e.org);
    const r = normalize(e.role);
    if (t) titleMap.set(t, (titleMap.get(t) || []).concat(e));
    if (o) orgMap.set(o, (orgMap.get(o) || []).concat(e));
    if (r) roleMap.set(r, (roleMap.get(r) || []).concat(e));
  }

  function formatGroup(map, label) {
    let md = `## Potential duplicate ${label}\n\n`;
    for (const [key, group] of map.entries()) {
      if (group.length > 1) {
        md += `### ${label.slice(0, -1)}: "${key}" (${group.length} entries)\n`;
        for (const e of group) {
          md += `- ID ${e.id}: ${e.title} – ${e.org} – ${e.role} – ${e.year}\n`;
        }
        md += '\n';
      }
    }
    return md;
  }

  let report = `# Duplicate Detection Report\n\nGenerated on ${(new Date()).toISOString()}\n\n`;
  report += formatGroup(titleMap, 'titles');
  report += formatGroup(orgMap, 'client names');
  report += formatGroup(roleMap, 'roles');
  await fs.writeFile(reportPath, report, 'utf8');
  console.log('Report written to', reportPath);
}

main().catch(err => {
  console.error('Error generating report:', err);
  process.exit(1);
});
