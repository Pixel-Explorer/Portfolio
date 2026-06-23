// Rewrite local proof paths -> Blob URLs in data/ledger.json and landing.html,
// using scripts/blob-proof-map.json. Both files are committed, so `git checkout`
// reverts if needed. Idempotent: only replaces tokens that still match a local path.
//   node scripts/rewrite-proof-refs.mjs [--dry]
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");
const ROOT = path.resolve(import.meta.dirname, "..");
const map = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "blob-proof-map.json"), "utf8"));

// --- data/ledger.json : "src": "public/proof/..."  ->  "src": "<blobUrl>"
const ledgerPath = path.join(ROOT, "data", "ledger.json");
let ledger = fs.readFileSync(ledgerPath, "utf8");
let lc = 0;
for (const [local, url] of Object.entries(map)) {
  const token = JSON.stringify(local);            // exact quoted token, safe boundary
  if (ledger.includes(token)) { ledger = ledger.split(token).join(JSON.stringify(url)); lc++; }
}

// --- landing.html : /public/proof/<url-encoded>  ->  <blobUrl>
const landingPath = path.join(ROOT, "landing.html");
let landing = fs.readFileSync(landingPath, "utf8");
let hc = 0;
const refs = [...new Set([...landing.matchAll(/\/public\/proof\/[^"')\s]+/g)].map(x => x[0]))];
for (const ref of refs) {
  const local = decodeURIComponent(ref.replace(/^\//, ""));
  if (map[local]) { landing = landing.split(ref).join(map[local]); hc++; }
  else console.warn("  landing ref has no Blob mapping (left as-is):", ref);
}

console.log(`ledger src tokens replaced: ${lc}/${Object.keys(map).length}`);
console.log(`landing.html refs replaced: ${hc}/${refs.length}`);
if (DRY) { console.log("(dry run — files NOT written)"); process.exit(0); }
fs.writeFileSync(ledgerPath, ledger);
fs.writeFileSync(landingPath, landing);
console.log("written.");
