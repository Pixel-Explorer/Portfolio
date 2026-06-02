// Upload public/city/city.glb to Vercel Blob → a public CDN URL the deployed
// site can load (Vercel doesn't serve Git LFS files, so the GLB can't live in
// the repo for production). Your token stays on your machine.
//
// Usage (PowerShell):
//   $env:BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_xxx..."
//   node scripts/upload-city-blob.mjs
//
// Get the token: Vercel dashboard → your project → Storage → (create) Blob
// store → ".env.local" tab → copy BLOB_READ_WRITE_TOKEN.

import { put } from "@vercel/blob";
import { readFileSync, statSync } from "node:fs";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("✗ Set BLOB_READ_WRITE_TOKEN first (Vercel → Storage → Blob store → .env.local).");
  process.exit(1);
}

const path = "public/city/city.glb";
const size = statSync(path).size;
console.log(`Uploading ${path} (${(size / 1048576).toFixed(0)} MB) to Vercel Blob…`);

const blob = await put("city/city.glb", readFileSync(path), {
  access: "public",
  token,
  contentType: "model/gltf-binary",
  addRandomSuffix: false,   // stable URL so we don't have to rewire on re-upload
  allowOverwrite: true,
});

console.log("\n✅ Uploaded.\nPublic URL (paste this back to me):\n\n  " + blob.url + "\n");
