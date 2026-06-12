// tmp_duplicate_check.mjs
import { promises as fs } from 'fs';
import path from 'path';

const ledgerPath = path.resolve('c:/Users/Anirudh/Documents/Portfolio/Archival app/data/ledger.json');

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

(async () => {
  const data = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
  const entries = data.entries;
  const potential = [];
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      if (a.year !== b.year) continue;
      const titleDist = levenshtein(normalize(a.title), normalize(b.title));
      const orgDist = levenshtein(normalize(a.org), normalize(b.org));
      const roleDist = levenshtein(normalize(a.role), normalize(b.role));
      if (titleDist <= 4 || orgDist <= 3 || roleDist <= 3) {
        potential.push({aId:a.id,bId:b.id,year:a.year,titleDist,orgDist,roleDist,titleA:a.title,titleB:b.title,orgA:a.org,orgB:b.org,roleA:a.role,roleB:b.role});
      }
    }
  }
  console.log('Potential duplicate pairs:', potential.length);
  potential.slice(0,50).forEach(p=>{
    console.log(`- IDs ${p.aId}<->${p.bId} | Year ${p.year}`);
    console.log(`  TitleDist ${p.titleDist}: "${p.titleA}" ↔ "${p.titleB}"`);
    console.log(`  OrgDist ${p.orgDist}: "${p.orgA}" ↔ "${p.orgB}"`);
    console.log(`  RoleDist ${p.roleDist}: "${p.roleA}" ↔ "${p.roleB}"`);
  });
})();
