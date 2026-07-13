// One-off: optimize curated case-study evidence images from D:\Portfolio into
// public/proof-local/<id>/*.webp (max 1500px, webp q82). Idempotent.
// Run: node scripts/optimize-cs-evidence.mjs
import sharp from "sharp";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

const SRC_ROOT = "D:/Portfolio";
const OUT_ROOT = "public/proof-local";

// { id, src (relative to SRC_ROOT), out (basename, no ext) }
const PICKS = [
  // ── Haus of Pixels — brand systems / client work ──
  ["haus-of-pixels", "House of Glam All Logos_Page_2.png", "house-of-glam-logo"],
  ["haus-of-pixels", "House of Glam All Logos_Page_3.jpg", "house-of-glam-system"],
  ["haus-of-pixels", "Its_a_baby_studio_Brand_logo.png", "its-a-baby-logo"],
  ["haus-of-pixels", "sticker logo collage.png", "brand-collage"],
  ["haus-of-pixels", "Box Mockup by Webandcat.png", "packaging-mockup"],

  // ── Rabble Labs — product brand + template system ──
  ["rabble-labs", "2031.png", "rabble-keyart"],
  ["rabble-labs", "Scribble values.png", "scribble-values"],
  ["rabble-labs", "Instagram post - 144.png", "ig-template-144"],
  ["rabble-labs", "Instagram post - 166.png", "ig-template-166"],
  ["rabble-labs", "rabble objects phone booth-Camera 2.png", "rabble-3d-objects"],

  // ── Pixelate — MVP product + pitch ──
  ["pixelate", "Pixelate MVP Dec 21/1783762348901-355d7afd-fc91-4391-9fba-3ed61de565df_1.jpg", "mvp-welcome-rooms"],
  ["pixelate", "Pixelate MVP Dec 21/1783762348901-355d7afd-fc91-4391-9fba-3ed61de565df_5.jpg", "mvp-screen-5"],
  ["pixelate", "Pixelate MVP Dec 21/1783762348901-355d7afd-fc91-4391-9fba-3ed61de565df_10.jpg", "mvp-screen-10"],
  ["pixelate", "pixelateit_logo.jpg", "pixelate-logo"],
  ["pixelate", "startup-weekend-logo.png", "startup-weekend"],

  // ── Buddy Tales — animation production ──
  ["buddy-tales", "Buddy Tales Animation Board krishna turnaround 2.png", "krishna-turnaround"],
  ["buddy-tales", "Buddy Tales Animation Board kans front.png", "kans-model-sheet"],
  ["buddy-tales", "YK Output/CMW_1630.jpg", "onset-1630"],
  ["buddy-tales", "YK Output/CMW_1745.jpg", "onset-1745"],
];

const MAXW = 1500;
let ok = 0, miss = 0, bytes = 0;

for (const [id, rel, out] of PICKS) {
  const src = join(SRC_ROOT, rel);
  if (!existsSync(src)) { console.warn("MISS", rel); miss++; continue; }
  const dir = join(OUT_ROOT, id);
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${out}.webp`);
  try {
    const info = await sharp(src)
      .rotate()
      .resize({ width: MAXW, height: MAXW, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(dest);
    bytes += info.size;
    ok++;
    console.log(`OK  ${id}/${out}.webp  ${(info.size / 1024).toFixed(0)}KB  ${info.width}x${info.height}`);
  } catch (e) {
    console.error("FAIL", rel, e.message);
    miss++;
  }
}
console.log(`\n${ok} written, ${miss} missing/failed, total ${(bytes / 1024 / 1024).toFixed(2)}MB`);
