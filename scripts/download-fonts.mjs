import { writeFileSync, mkdirSync } from "fs";
import { join, extname } from "path";

const OUT = join(import.meta.dirname, "..", "public", "fonts");
mkdirSync(OUT, { recursive: true });

// Download a woff2 file from a URL
async function download(url, dest) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`  Downloaded ${dest.split("/").pop()} (${(buf.length / 1024).toFixed(0)}KB)`);
}

// Fetch font CSS from Google Fonts CSS API and download all woff2 files
async function downloadGoogleFont(family, weights, display = "swap") {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:${weights}&display=${display}`;
  console.log(`\n=== ${family} ===`);
  const resp = await fetch(cssUrl, { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" } });
  if (!resp.ok) { console.error(`  FAILED HTTP ${resp.status}`); return; }
  const css = await resp.text();
  // Parse: url(https://...) format('woff2')
  const urlRegex = /url\((https:\/\/[^)]+)\)/g;
  let match, i = 0;
  while ((match = urlRegex.exec(css)) !== null) {
    const url = match[1];
    const ext = url.includes(".ttf") ? ".ttf" : url.includes(".woff2") ? ".woff2" : ".woff2";
    const dest = join(OUT, `${family.replace(/[\s+]/g, "")}-${i}${ext}`);
    await download(url, dest);
    i++;
  }
  // Save the CSS for reference
  writeFileSync(join(OUT, `${family.replace(/\s+/g, "")}.css`), css);
  console.log(`  Reference CSS saved`);
}

// Only download what's actually used in this project
await downloadGoogleFont("Inter", "wght@300;400;500;600;700;800;900");
await downloadGoogleFont("Instrument+Serif", "ital@0;1");
await downloadGoogleFont("Climate+Crisis", "wght@400");
await downloadGoogleFont("Cascadia+Code", "wght@400;500;600;700");
await downloadGoogleFont("Caveat", "wght@400;500;600;700");

console.log("\nDone. Fonts saved to public/fonts/");
