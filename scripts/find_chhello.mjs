// find_chhello.mjs
import fs from 'fs';
import path from 'path';

const ledgerPath = path.resolve('data', 'ledger.json');
const { entries } = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));

const matches = entries.filter(e => {
  const title = (e.title || '').toLowerCase();
  const era = (e.eraName || '').toLowerCase();
  return title.includes('chhello divas') || era.includes('chhello divas');
});

if (matches.length === 0) {
  console.log('No Chhello Divas related entries found.');
} else {
  console.log(`Found ${matches.length} Chhello Divas related entries:`);
  matches.forEach(e => {
    console.log(`  id:${e.id} year:${e.year} title:"${e.title}" era:"${e.eraName}" org:"${e.org}"`);
  });
  console.log('\nPlease reply with a JSON mapping where the key is the id you want to keep as parent and the value is an array of ids to merge into it.');
}
