// Screenshot the live local app and save it as the anirudh.website case-study hero
// (public/images/tech-stack.webp). Re-run after visual redesigns to keep the hero honest.
// Usage: node scripts/shoot-site-hero.mjs [url]   (default http://localhost:4173/)
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL = process.argv[2] || "http://localhost:4173/";
const OUT = fileURLToPath(new globalThis.URL("../public/images/tech-stack.webp", import.meta.url));
const TMP = path.join(os.tmpdir(), "site-hero-raw.png");

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction("document.body.classList.contains('has-terrain')", null, { timeout: 90000 });
await page.waitForTimeout(12000); // let the city entrance + camera settle
// Dismiss the onboarding tour if it appeared
const skip = page.locator("button", { hasText: /^Skip$/ }).first();
if (await skip.isVisible().catch(() => false)) {
  await skip.click();
  await page.waitForTimeout(1200);
}
await page.screenshot({ path: TMP });
await browser.close();

mkdirSync(path.dirname(OUT), { recursive: true });
await sharp(TMP).resize({ width: 1600 }).webp({ quality: 82 }).toFile(OUT);
console.log("saved", OUT);
