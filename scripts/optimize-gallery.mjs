// Gallery photo optimizer.
//
// The raw gallery (public/proof/Gallery/) is 2.1GB of full-res Fujifilm JPEGs
// (~29MB each) — unshippable. This generates two web-sized WebP derivatives
// per photo and rewrites data/gallery.json to point at them:
//   • thumb   — 500px wide,  q72  → grid / codex / floating preview
//   • display — 1600px max,  q80  → the artifact (single-photo) view
//
// Outputs land in public/gallery/{thumb,display}/<id>.webp (committed as plain
// git — small enough that Vercel serves them directly; LFS would 404 on deploy).
//
// Usage:  node scripts/optimize-gallery.mjs [--force]
// Idempotent: skips photos whose derivatives already exist (unless --force).

import sharp from "sharp";
import { readdirSync, existsSync, mkdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";

const root = resolve(process.cwd());
const SRC_DIR = join(root, "public/proof/Gallery");
const THUMB_DIR = join(root, "public/gallery/thumb");
const DISPLAY_DIR = join(root, "public/gallery/display");
const LEDGER = join(root, "data/gallery.json");
const force = process.argv.includes("--force");

const THUMB = { width: 500, quality: 72 };
const DISPLAY = { width: 1600, height: 1600, quality: 80 };

for (const d of [THUMB_DIR, DISPLAY_DIR]) mkdirSync(d, { recursive: true });

if (!existsSync(SRC_DIR)) {
  console.error(`✗ Source folder missing: ${SRC_DIR}`);
  process.exit(1);
}

const files = readdirSync(SRC_DIR).filter((f) => /\.(jpe?g|png|tiff?)$/i.test(f));
const mb = (n) => (n / 1048576).toFixed(1) + " MB";
const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log(`Optimizing ${files.length} photos → thumb ${THUMB.width}px + display ${DISPLAY.width}px WebP`);

// id matches gallery.json convention: lowercased basename without extension.
const idOf = (file) => basename(file, extname(file)).toLowerCase();
const webRel = (abs) => abs.replace(root + "\\", "").replace(root + "/", "").replace(/\\/g, "/");

let done = 0, skipped = 0, thumbBytes = 0, dispBytes = 0;
const paths = {}; // id → { thumb, src }

for (const file of files) {
  const id = idOf(file);
  const input = join(SRC_DIR, file);
  const thumbOut = join(THUMB_DIR, `${id}.webp`);
  const dispOut = join(DISPLAY_DIR, `${id}.webp`);
  paths[id] = { thumb: webRel(thumbOut), src: webRel(dispOut) };

  if (!force && existsSync(thumbOut) && existsSync(dispOut)) {
    thumbBytes += statSync(thumbOut).size; dispBytes += statSync(dispOut).size;
    skipped++; continue;
  }
  try {
    await sharp(input).rotate().resize({ width: THUMB.width, withoutEnlargement: true })
      .webp({ quality: THUMB.quality }).toFile(thumbOut);
    await sharp(input).rotate().resize({ width: DISPLAY.width, height: DISPLAY.height, fit: "inside", withoutEnlargement: true })
      .webp({ quality: DISPLAY.quality }).toFile(dispOut);
    thumbBytes += statSync(thumbOut).size; dispBytes += statSync(dispOut).size;
    done++;
    if (done % 25 === 0) console.log(`  …${done + skipped}/${files.length}`);
  } catch (e) {
    console.error(`  ✗ ${file}: ${e.message}`);
  }
}

console.log(`\nGenerated ${done}, skipped ${skipped}.`);
console.log(`  thumbnails: ${mb(thumbBytes)} (avg ${kb(thumbBytes / files.length)})`);
console.log(`  display:    ${mb(dispBytes)} (avg ${kb(dispBytes / files.length)})`);
console.log(`  committed total: ${mb(thumbBytes + dispBytes)}`);

// Rewrite gallery.json src → display, add thumb. Keep everything else intact.
if (existsSync(LEDGER)) {
  const data = JSON.parse(readFileSync(LEDGER, "utf8"));
  let updated = 0;
  for (const item of data) {
    // Match on the source FILENAME, not item.id — ids are normalized
    // (underscores/leading-underscores stripped) and don't always equal the
    // file's basename, whereas item.src always points at the real file.
    const srcName = basename(String(item.src || ""), extname(String(item.src || ""))).toLowerCase();
    const p = paths[srcName] || paths[String(item.id).toLowerCase()];
    if (!p) continue;
    item.src = p.src;
    item.thumb = p.thumb;
    updated++;
  }
  writeFileSync(LEDGER, JSON.stringify(data, null, 2));
  console.log(`\nRewrote data/gallery.json — ${updated}/${data.length} items repointed to optimized WebP.`);
}
