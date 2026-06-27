// One-off: upload the 3 orphaned proof images that the bulk migration missed
// (their disk filenames use an EN-DASH "–" but the ledger refs wrote a HYPHEN
// "-", so the basename match failed and they were never sent to Blob). Uploads
// each en-dash file, repoints the ledger to the new Blob URL, and records the
// upload in scripts/blob-proof-map.json.
//
//   node --env-file=.env.local scripts/fix-3-orphan-evidence.mjs
import { put, list as blobList } from "@vercel/blob";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LEDGER = path.join(ROOT, "data", "ledger.json");
const MAP_OUT = path.join(ROOT, "scripts", "blob-proof-map.json");

if (!process.env.BLOB_READ_WRITE_TOKEN) { console.error("X no BLOB_READ_WRITE_TOKEN"); process.exit(1); }

// { ledger ref (hyphen, what's stored now) -> actual file on disk (en-dash) }
const FIXES = [
  { oldSrc: "public/proof/78/Jar cap - 1.webp",          disk: "public/proof/78/Jar cap – 1.webp" },
  { oldSrc: "public/proof/Kind Health/Artboard - 3.webp", disk: "public/proof/Kind Health/Artboard – 3.webp" },
  { oldSrc: "public/proof/Kind Health/Logo - 2.webp",     disk: "public/proof/Kind Health/Logo – 2.webp" },
];

const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
let map = fs.existsSync(MAP_OUT) ? JSON.parse(fs.readFileSync(MAP_OUT, "utf8")) : {};

// Sanity: every disk file must exist before we touch anything.
for (const f of FIXES) {
  if (!fs.existsSync(path.join(ROOT, f.disk))) { console.error("X missing on disk:", f.disk); process.exit(1); }
}

const urlForOldSrc = {};
for (const f of FIXES) {
  const pathname = f.disk.replace(/^public\//, "");   // proof/78/Jar cap – 1.webp
  let url;
  const ex = await blobList({ prefix: pathname, limit: 1 });
  const hit = ex.blobs.find((b) => b.pathname === pathname);
  if (hit) { url = hit.url; console.log("  skip(on blob) ", pathname); }
  else {
    const data = fs.readFileSync(path.join(ROOT, f.disk));
    const res = await put(pathname, data, {
      access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "image/webp",
    });
    url = res.url;
    console.log(`  up ${(data.length / 1048576).toFixed(2)}MB  ${pathname}`);
  }
  map[f.disk] = url;
  urlForOldSrc[f.oldSrc] = url;
}
fs.writeFileSync(MAP_OUT, JSON.stringify(map, null, 2));

// Repoint the ledger evidence refs (match on the exact stored hyphen src).
let repointed = 0;
for (const e of ledger.entries || []) {
  for (const ev of e.evidence || []) {
    if (ev.src && urlForOldSrc[ev.src]) { ev.src = urlForOldSrc[ev.src]; repointed++; }
  }
}
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
console.log(`done: ${Object.keys(urlForOldSrc).length} uploaded/found, ${repointed} ledger refs repointed`);
