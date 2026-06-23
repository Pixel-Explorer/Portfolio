// Read-only Vercel Blob connectivity check. Lists the store contents.
// Run: node --env-file=.env.local scripts/blob-check.mjs
// Never prints the token.
import { list } from "@vercel/blob";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("X BLOB_READ_WRITE_TOKEN not in env. Put it in .env.local and run with --env-file=.env.local");
  process.exit(1);
}

const { blobs } = await list({ limit: 1000 });
let total = 0;
for (const b of blobs) total += b.size;
console.log(`OK connected - ${blobs.length} blob(s), ${(total / 1048576).toFixed(1)} MB total`);
for (const b of blobs.slice(0, 60)) {
  console.log(`  ${(b.size / 1048576).toFixed(2).padStart(9)} MB  ${b.pathname}`);
}
if (blobs.length > 60) console.log(`  ... +${blobs.length - 60} more`);
