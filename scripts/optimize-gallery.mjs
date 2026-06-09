// Gallery photo optimizer — recursive subfolder edition.
//
// Recursively walks public/proof/Gallery/** for raster images, generates
// thumb (500px) + display (1600px) WebP derivatives, then rewrites
// data/gallery.json to point at them.
//
// Idempotent: skips photos whose derivatives already exist (unless --force).
// Basename collisions across subfolders get a slug prefix for uniqueness.
//
// Usage: node scripts/optimize-gallery.mjs [--force]
//
import sharp from "sharp";
import { readdirSync, existsSync, mkdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename, extname, resolve, relative, sep } from "node:path";

const root = resolve(process.cwd());
const SRC_DIR = join(root, "public/proof/Gallery");
const THUMB_DIR = join(root, "public/gallery/thumb");
const DISPLAY_DIR = join(root, "public/gallery/display");
const GALLERY_JSON = join(root, "data/gallery.json");
const force = process.argv.includes("--force");

const THUMB = { width: 500, quality: 72 };
const DISPLAY = { width: 1600, height: 1600, quality: 80 };
const IMG_RE = /\.(jpe?g|png|tiff?)$/i;

for (const d of [THUMB_DIR, DISPLAY_DIR]) mkdirSync(d, { recursive: true });

if (!existsSync(SRC_DIR)) {
  console.error(`✗ Source folder missing: ${SRC_DIR}`);
  process.exit(1);
}

// Recursive file collection
function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (entry.isFile() && IMG_RE.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

// Build id: basename lowercased; append subfolder slug if collision
function buildIdMap(filePaths) {
  const byId = {};
  const counts = {};
  const idFor = (fp) => basename(fp, extname(fp)).toLowerCase();

  // First pass: count collisions
  for (const fp of filePaths) {
    const id = idFor(fp);
    counts[id] = (counts[id] || 0) + 1;
  }

  // Second pass: disambiguate
  for (const fp of filePaths) {
    const id = idFor(fp);
    if (counts[id] > 1) {
      const subSlug = basename(join(fp, "..")).toLowerCase().replace(/[^a-z0-9]/g, "");
      const disambig = subSlug ? `${subSlug}_${id}` : id;
      byId[fp] = disambig;
    } else {
      byId[fp] = id;
    }
  }
  return byId;
}

const files = collectFiles(SRC_DIR);
console.log(`Found ${files.length} photos across subfolders.`);

const idMap = buildIdMap(files);
const mb = (n) => (n / 1048576).toFixed(1) + " MB";
const kb = (n) => (n / 1024).toFixed(0) + " KB";
const webRel = (abs) => relative(root, abs).replace(/\\/g, "/");

let done = 0, skipped = 0, thumbBytes = 0, dispBytes = 0;
const paths = {}; // id → { thumb, src }

for (const input of files) {
  const id = idMap[input];
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
    console.error(`  ✗ ${input}: ${e.message}`);
  }
}

console.log(`\nGenerated ${done}, skipped ${skipped}.`);
console.log(`  thumbnails: ${mb(thumbBytes)} (avg ${kb(thumbBytes / files.length)})`);
console.log(`  display:    ${mb(dispBytes)} (avg ${kb(dispBytes / files.length)})`);
console.log(`  committed total: ${mb(thumbBytes + dispBytes)}`);

// Rewrite gallery.json src → display, add thumb. Keep everything else intact.
if (existsSync(GALLERY_JSON)) {
  const data = JSON.parse(readFileSync(GALLERY_JSON, "utf8"));
  let updated = 0;
  for (const item of data) {
    const srcName = basename(String(item.src || ""), extname(String(item.src || ""))).toLowerCase();
    const p = paths[srcName] || paths[String(item.id).toLowerCase()];
    if (!p) continue;
    item.src = p.src;
    item.thumb = p.thumb;
    updated++;
  }
  writeFileSync(GALLERY_JSON, JSON.stringify(data, null, 2));
  console.log(`\nRewrote ${GALLERY_JSON} — ${updated}/${data.length} items repointed to optimized WebP.`);
}
