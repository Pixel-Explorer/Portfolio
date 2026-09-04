import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

async function captureAllViews() {
  const root = 'D:/Portfolio/Archival app';
  const server = http.createServer((req, res) => {
    let filePath = path.join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
      '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  }).listen(3456, '127.0.0.1');

  console.log('Static server up on http://127.0.0.1:3456');

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const artifactDir = 'C:/Users/Anirudh/.gemini/antigravity/brain/a06d9bb3-b466-4a1c-ab50-5f2404304ae7';

  try {
    await page.addInitScript(() => {
      localStorage.setItem('has_seen_onboarding', 'true');
      localStorage.setItem('onboarding_dismissed', 'true');
    });

    await page.goto('http://127.0.0.1:3456/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000); // Wait for stairs preloader to complete and fade out
    await page.screenshot({ path: path.join(artifactDir, 'view_1_main_city.png') });
    console.log('Snapped view_1_main_city.png');

    // Click building near center
    await page.mouse.click(720, 420);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(artifactDir, 'view_6_building_isolated.png') });
    console.log('Snapped view_6_building_isolated.png');

    await page.click('.navlink[data-view="roles"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'view_2_roles.png') });
    console.log('Snapped view_2_roles.png');

    await page.click('.navlink[data-view="clients"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'view_3_clients.png') });
    console.log('Snapped view_3_clients.png');

    await page.click('.navlink[data-view="case-studies"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'view_4_case_studies.png') });
    console.log('Snapped view_4_case_studies.png');

    await page.click('.navlink[data-view="contact"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'view_5_contact.png') });
    console.log('Snapped view_5_contact.png');

  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    await browser.close();
    server.close();
    console.log('Browser & server closed.');
  }
}

captureAllViews();
