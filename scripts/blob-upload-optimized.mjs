// Push optimized proof media staged in bin/blob-opt/ to Vercel Blob at
// proof/<relative path>. Re-runnable; overwrites existing blobs at the same
// pathname so data/*.json URLs never change.
//
// Context (Jul 2026): the store blew its 1GB Hobby cap on raw video exports
// and Vercel SUSPENDED it (public URLs 403, uploads rejected). The fat blobs
// were deleted and re-encoded copies staged in bin/blob-opt/ (sources remain
// in public/proof/). Run this once the suspension lifts:
//   node --env-file=.env.local scripts/blob-upload-optimized.mjs
// Verify with: node --env-file=.env.local scripts/blob-check.mjs
import { put } from "@vercel/blob";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const STAGE = path.resolve(import.meta.dirname, "..", "bin", "blob-opt");

const TYPES = { mp4: "video/mp4", mov: "video/quicktime", webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", pdf: "application/pdf" };

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let ok = 0, failed = 0;
for (const file of walk(STAGE)) {
  const rel = path.relative(STAGE, file).replaceAll("\\", "/");
  const target = `proof/${rel}`;
  const ext = rel.split(".").pop().toLowerCase();
  try {
    const data = readFileSync(file);
    await put(target, data, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: TYPES[ext] || "application/octet-stream",
    });
    console.log(`up ${(data.length / 1048576).toFixed(1).padStart(6)} MB  ${target}`);
    ok++;
  } catch (e) {
    console.error(`FAIL ${target}: ${e.message}`);
    failed++;
  }
}
console.log(`${ok} uploaded, ${failed} failed.`);
if (failed) process.exit(1);
