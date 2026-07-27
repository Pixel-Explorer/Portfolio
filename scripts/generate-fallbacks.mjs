import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const LEDGER_PATH = path.join(process.cwd(), 'data/ledger.json');
const SRC_DIR = path.join(process.cwd(), 'public');
const DEST_DIR = path.join(process.cwd(), 'public/proof_fallback');

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function run() {
  console.log('Reading ledger.json...');
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8'));
  
  const vUrls = new Set();
  
  // Extract all evidence
  for (const entry of ledger.entries) {
    if (entry.evidence && Array.isArray(entry.evidence)) {
      for (const ev of entry.evidence) {
        if (ev.src && typeof ev.src === 'string' && ev.src.includes('vercel-storage.com/proof/')) {
          if (ev.type === 'image') {
            vUrls.add(ev.src);
          }
        }
      }
    }
  }

  console.log(`Found ${vUrls.size} unique Vercel image URLs in ledger.`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let totalBytes = 0;

  for (const url of vUrls) {
    try {
      // url: https://th4xikrqb3qoxcmi.public.blob.vercel-storage.com/proof/...
      const match = url.match(/\/proof\/(.+)$/);
      if (!match) continue;
      
      // decode URI component to handle spaces (e.g. Serena%20music%20video)
      const relativePath = decodeURIComponent(match[1]);
      const srcFile = path.join(SRC_DIR, 'proof', relativePath);
      const destFile = path.join(DEST_DIR, relativePath);

      if (!fs.existsSync(srcFile)) {
        console.warn(`[WARN] Source file not found locally: ${srcFile}`);
        errors++;
        continue;
      }

      await ensureDir(path.dirname(destFile));

      // We always save as webp, but the extension will remain what it was in the URL
      // so that the error handler in app.js can easily map it.
      
      const stat = await sharp(srcFile)
        .resize({ width: 600, withoutEnlargement: true })
        .webp({ quality: 60 })
        .toFile(destFile);

      totalBytes += stat.size;
      processed++;
    } catch (err) {
      console.error(`[ERROR] Failed processing ${url}:`, err.message);
      errors++;
    }
  }

  console.log('---');
  console.log(`Finished processing fallbacks.`);
  console.log(`Processed: ${processed}`);
  console.log(`Errors:    ${errors}`);
  console.log(`Total Size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
}

run().catch(console.error);
