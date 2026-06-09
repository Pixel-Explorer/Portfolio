// Proof image optimizer.
//
// Recurse public/proof/ (skip Gallery/), convert every raster image to 2000px WebP.
// PDFs/videos untouched. Idempotent — skip if .webp exists (unless --force).
//
// Usage: node scripts/optimize-proof.mjs [--force]
//
import sharp from "sharp";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const PROOF = join(root, "public/proof");
const force = process.argv.includes("--force");

const IMG_RE = /\.(jpe?g|png|tiff?)$/i;
const SKIP = ["Gallery"];

const mb = (n) => (n / 1_048_576).toFixed(1) + " MB";
const kb = (n) => (n / 1024).toFixed(0) + " KB";

function collectFiles(dir, prefix = "") {
  let results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(collectFiles(full, join(prefix, entry.name)));
    } else if (entry.isFile() && IMG_RE.test(entry.name)) {
      results.push({ path: full, rel: join(prefix, entry.name) });
    }
  }
  return results;
}

const files = collectFiles(PROOF);
console.log(`Found ${files.length} raster images to process.`);

let done = 0, skipped = 0, rawBytes = 0, webpBytes = 0;
const folders = {};

for (const { path, rel } of files) {
  const folderKey = rel.split(/[\\/]/).slice(0, -1).join("/") || "(root)";
  if (!folders[folderKey]) folders[folderKey] = { raw: 0, webp: 0, rawSz: 0, webpSz: 0 };
  const wPath = path.replace(/\.(jpe?g|png|tiff?)$/i, ".webp");
  const rawSz = statSync(path).size;
  rawBytes += rawSz;
  folders[folderKey].raw++;
  folders[folderKey].rawSz += rawSz;

  if (!force && existsSync(wPath)) {
    const wSz = statSync(wPath).size;
    webpBytes += wSz;
    folders[folderKey].webp++;
    folders[folderKey].webpSz += wSz;
    skipped++;
    continue;
  }
  try {
    await sharp(path)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(wPath);
    const wSz = statSync(wPath).size;
    webpBytes += wSz;
    folders[folderKey].webp++;
    folders[folderKey].webpSz += wSz;
    done++;
    if (done % 25 === 0) console.log(`  …${done + skipped}/${files.length}`);
  } catch (e) {
    console.error(`  ✗ ${rel}: ${e.message}`);
  }
}

console.log(`\nGenerated ${done}, skipped ${skipped}.`);
console.log(`  Raw total:    ${mb(rawBytes)}`);
console.log(`  WebP total:   ${mb(webpBytes)}`);
console.log(`  Savings:      ${((1 - webpBytes / rawBytes) * 100).toFixed(1)}%`);
console.log(`\nPer-folder breakdown:`);
for (const [folder, stats] of Object.entries(folders).sort()) {
  const saved = stats.rawSz > 0 ? ((1 - stats.webpSz / stats.rawSz) * 100).toFixed(1) : "0.0";
  console.log(`  ${folder}: ${stats.raw}→${stats.webp} files, ${mb(stats.rawSz)} → ${mb(stats.webpSz)} (${saved}%)`);
}
