// Screenshot the live local app views and save them as the anirudh.website case-study evidence.
// Usage: node scripts/shoot-website-evidence.mjs
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL = "http://localhost:4173/";
const dir = fileURLToPath(new globalThis.URL("../public/images", import.meta.url));
mkdirSync(dir, { recursive: true });

console.log("Launching browser...");
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1.5 });

// 1. Screenshot the 3D City View
console.log("Navigating to", URL);
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction("document.body.classList.contains('has-terrain')", null, { timeout: 90000 });
await page.waitForTimeout(10000); // let entrance transition finish

// Dismiss the onboarding tour if visible
const skip = page.locator("button", { hasText: /^Skip$/ }).first();
if (await skip.isVisible().catch(() => false)) {
  await skip.click();
  await page.waitForTimeout(1000);
}

const cityTmp = path.join(dir, "cs-website-3dcity-raw.png");
await page.screenshot({ path: cityTmp, timeout: 120000, animations: "disabled" });
console.log("Captured 3D City view.");

// Hide the resource-intensive main 3D terrain canvas to free up CPU for screenshots
await page.evaluate(() => {
  const el = document.getElementById("terrainCanvas");
  if (el) el.style.display = "none";
});

// Helper for navigation
async function navigateToView(viewName) {
  const tab = page.locator(`[data-fx-tab="${viewName}"]`).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(2000);
    return;
  }
  
  const btn = page.locator(`button[data-view="${viewName}"]`).first();
  if (!(await btn.isVisible().catch(() => false))) {
    const toggle = page.locator("#navMenuToggle");
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(800);
    }
  }
  await btn.click();
  await page.waitForTimeout(2000);
}

// 2. Open Roles tab and screenshot
console.log("Opening Roles page...");
await navigateToView("roles");
const rolesTmp = path.join(dir, "cs-website-roles-raw.png");
await page.screenshot({ path: rolesTmp, timeout: 120000, animations: "disabled" });
console.log("Captured Roles view.");

// 3. Open Clients tab and screenshot
console.log("Opening Clients page...");
await navigateToView("clients");
const clientsTmp = path.join(dir, "cs-website-clients-raw.png");
await page.screenshot({ path: clientsTmp, timeout: 120000, animations: "disabled" });
console.log("Captured Clients view.");

// 4. Open Case Studies -> Anirudh.website -> scroll to graph -> screenshot
console.log("Opening Case Studies explorer...");
await navigateToView("case-studies");

console.log("Opening Anirudh.website Case Study...");
const csFolder = page.locator('button[data-cs-folder="anirudh-website"]').first();
await csFolder.click();
await page.waitForTimeout(4000); // let page load and force-graph instantiate

// Scroll down to the graphify section
await page.evaluate(() => {
  const sec = document.querySelector(".cs-graph-section");
  if (sec) {
    sec.scrollIntoView({ block: "center" });
  }
});
await page.waitForTimeout(8000); // wait for 3D force-graph simulation layout to stabilize

const graphTmp = path.join(dir, "cs-website-graph-raw.png");
await page.screenshot({ path: graphTmp, timeout: 120000, animations: "disabled" });
console.log("Captured 3D semantic graph view.");

await browser.close();

console.log("Optimizing screenshots to webp...");
await sharp(cityTmp).resize({ width: 1400 }).webp({ quality: 85 }).toFile(path.join(dir, "cs-website-3dcity.webp"));
await sharp(rolesTmp).resize({ width: 1400 }).webp({ quality: 85 }).toFile(path.join(dir, "cs-website-roles.webp"));
await sharp(clientsTmp).resize({ width: 1400 }).webp({ quality: 85 }).toFile(path.join(dir, "cs-website-clients.webp"));
await sharp(graphTmp).resize({ width: 1400 }).webp({ quality: 85 }).toFile(path.join(dir, "cs-website-graph.webp"));

console.log("All evidence screenshots captured and optimized!");
