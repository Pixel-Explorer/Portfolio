import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const FONTS_DIR = join(import.meta.dirname, "..", "public", "fonts");

// Map family name to local file prefix + weight map
// Each .css reference file from Google Fonts has @font-face with `src: url(https://fonts.gstatic.com/...)`
// We replace the url to point to our local files
const families = ["Inter", "InstrumentSerif", "ClimateCrisis", "CascadiaCode", "Caveat"];

let output = "/* Auto-generated @font-face declarations — self-hosted */\n";

for (const family of families) {
  const cssPath = join(FONTS_DIR, `${family}.css`);
  let css;
  try {
    css = readFileSync(cssPath, "utf-8");
  } catch {
    console.log(`  Skipping ${family} — no reference CSS`);
    continue;
  }

  // Parse each @font-face block and rewrite the src URL to local path
  const blocks = css.split("@font-face").filter(Boolean);
  let idx = 0;
  for (const block of blocks) {
    const fullBlock = "@font-face" + block;
    // Extract font properties
    const familyName = fullBlock.match(/font-family:\s*'([^']+)'/)?.[1];
    const weight = fullBlock.match(/font-weight:\s*(\d+)/)?.[1];
    const style = fullBlock.match(/font-style:\s*(\w+)/)?.[1] || "normal";
    const unicodeRange = fullBlock.match(/unicode-range:\s*([^;]+)/)?.[1];

    // Find the woff2 url
    const urlMatch = fullBlock.match(/url\(([^)]+\.woff2)\)/);
    if (!urlMatch) continue;

    const originalUrl = urlMatch[1];
    // Extract file extension to find local file
    const urlParts = originalUrl.split("/");
    const remoteFile = urlParts[urlParts.length - 1];

    // Find matching local file — Google Fonts filenames are versioned
    // but our download keeps the URL pattern. We need to map by weight+style.
    // Simple approach: incrementally assign filenames in order
    const localFile = `${family}-w${weight}-${style}.woff2`;

    // Rename the downloaded file to a human-readable name
    const oldPath = join(FONTS_DIR, `${family}-${idx}.woff2`);
    const newPath = join(FONTS_DIR, localFile);
    try {
      // Check if source exists before rename
      if (readFileSync(oldPath)) {
        // Actually just symlink/copy — rename might break if we already did it
        const content = readFileSync(oldPath);
        writeFileSync(newPath, content);
      }
    } catch {}
    idx++;

    output += `@font-face {\n`;
    output += `  font-family: '${familyName}';\n`;
    output += `  font-style: ${style};\n`;
    output += `  font-weight: ${weight};\n`;
    output += `  font-display: swap;\n`;
    output += `  src: url('/fonts/${localFile}') format('woff2');\n`;
    if (unicodeRange) output += `  unicode-range: ${unicodeRange};\n`;
    output += `}\n`;
  }
}

// Geist — manual entries for the weights we use (400, 500, 600, 700, 800, 900)
const geistWeights = [
  [400, "Regular"], [500, "Medium"], [600, "SemiBold"],
  [700, "Bold"], [800, "ExtraBold"], [900, "Black"],
];
for (const [w, name] of geistWeights) {
  const src = join(FONTS_DIR, `Geist-${name}.woff2`);
  // Check if exists (may not for all weights)
  try { readFileSync(src); } catch { continue; }
  output += `@font-face {\n`;
  output += `  font-family: 'Geist';\n`;
  output += `  font-style: normal;\n`;
  output += `  font-weight: ${w};\n`;
  output += `  font-display: swap;\n`;
  output += `  src: url('/fonts/Geist-${name}.woff2') format('woff2');\n`;
  output += `}\n`;
}

writeFileSync(join(FONTS_DIR, "fonts.css"), output);
console.log("Generated public/fonts/fonts.css");
