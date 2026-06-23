// Migrate proof media -> Vercel Blob, build a src -> Blob URL map.
// Reversible: tracked files stay in git history; videos are gitignored raws.
//
//   node --env-file=.env.local scripts/migrate-proof-to-blob.mjs --dry   (preview)
//   node --env-file=.env.local scripts/migrate-proof-to-blob.mjs         (upload, merge map)
//
// Upload set = (tracked AND ledger-referenced proof images)
//            U (youtubePending video srcs that exist on disk)
//            U (proof files referenced by landing.html)
// Already-mapped files are skipped (idempotent). Does NOT edit ledger/landing.
import { put, list as blobList } from "@vercel/blob";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const DRY = process.argv.includes("--dry");
const ROOT = path.resolve(import.meta.dirname, "..");
const LEDGER = path.join(ROOT, "data", "ledger.json");
const LANDING = path.join(ROOT, "landing.html");
const MAP_OUT = path.join(ROOT, "scripts", "blob-proof-map.json");

if (!process.env.BLOB_READ_WRITE_TOKEN) { console.error("X no BLOB_READ_WRITE_TOKEN"); process.exit(1); }

const CT = { webp:"image/webp", png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg",
  gif:"image/gif", mp4:"video/mp4", mov:"video/quicktime", pdf:"application/pdf", svg:"image/svg+xml" };

const onDisk = (s) => fs.existsSync(path.join(ROOT, s));
const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));

// referenced proof srcs + youtubePending videos
const referenced = new Set();
const videos = new Set();
for (const e of ledger.entries || []) for (const ev of e.evidence || []) {
  if (typeof ev.src === "string" && ev.src.startsWith("public/proof/")) {
    referenced.add(ev.src);
    if (ev.youtubePending && onDisk(ev.src)) videos.add(ev.src);
  }
}
const tracked = new Set(
  execSync("git ls-files public/proof", { cwd: ROOT, encoding: "utf8" })
    .split("\n").map(s => s.trim()).filter(Boolean)
);
const images = [...referenced].filter(s => tracked.has(s));        // tracked AND referenced
// landing.html refs (decode %20, strip leading slash)
const landing = [];
const lh = fs.readFileSync(LANDING, "utf8");
for (const m of lh.matchAll(/\/public\/proof\/[^"')\s]+/g)) {
  const p = decodeURIComponent(m[0].replace(/^\//, ""));
  if (onDisk(p)) landing.push(p);
}

const list = [...new Set([...images, ...videos, ...landing])].sort();
let map = fs.existsSync(MAP_OUT) ? JSON.parse(fs.readFileSync(MAP_OUT, "utf8")) : {};
const todo = list.filter(s => !map[s])
  .sort((a, b) => fs.statSync(path.join(ROOT, a)).size - fs.statSync(path.join(ROOT, b)).size); // small first
let bytes = 0; for (const s of todo) bytes += fs.statSync(path.join(ROOT, s)).size;

console.log(`total in upload set: ${list.length}  (images ${images.length}, videos ${videos.size}, landing ${landing.length})`);
console.log(`already mapped: ${list.length - todo.length}  |  TO UPLOAD: ${todo.length} files, ${(bytes/1048576).toFixed(1)} MB`);
if (DRY) { todo.forEach(s => console.log("   +", s)); console.log("(dry run)"); process.exit(0); }

// Sequential + checkpoint after every file so a timeout-kill loses nothing;
// re-running resumes (skips files already on Blob). Robust for the big videos.
let done = 0, skipped = 0, failed = 0;
const save = () => fs.writeFileSync(MAP_OUT, JSON.stringify(map, null, 2));
for (const s of todo) {
  const pathname = s.replace(/^public\//, "");
  const ext = s.split(".").pop().toLowerCase();
  try {
    const ex = await blobList({ prefix: pathname, limit: 1 });
    const hit = ex.blobs.find(b => b.pathname === pathname);
    if (hit) { map[s] = hit.url; save(); skipped++; console.log(`  skip(on blob)  ${s}`); continue; }
    const data = fs.readFileSync(path.join(ROOT, s));
    const res = await put(pathname, data, {
      access: "public", addRandomSuffix: false, allowOverwrite: true,
      multipart: data.length > 50 * 1048576,   // multipart for big videos
      contentType: CT[ext] || "application/octet-stream",
    });
    map[s] = res.url; save();
    console.log(`  up ${(++done)}  ${(data.length/1048576).toFixed(1)}MB  ${s}`);
  } catch (err) { console.error("  FAIL", s, err.message); failed++; }
}
save();
console.log(`done: ${done} uploaded, ${skipped} already-on-blob, ${failed} failed, ${Object.keys(map).length} total in map`);
process.exit(failed ? 1 : 0);
