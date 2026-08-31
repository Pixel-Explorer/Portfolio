import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function captureLandingScreenshots() {
  console.log('Launching browser to inspect landing.html...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto('http://127.0.0.1:3000/landing.html', { waitUntil: 'domcontentloaded' });
    console.log('Page loaded successfully.');
    await page.waitForTimeout(2000);

    const screenshotsDir = 'c:/Users/Anirudh/Documents/Portfolio/Archival app/assets/images';
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const scrollAndSnap = async (targetPct, filename) => {
      await page.evaluate((pct) => {
        const total = document.documentElement.scrollHeight - window.innerHeight;
        const targetY = total * pct;
        window.scrollTo(0, targetY);
        window.dispatchEvent(new Event('scroll'));
        if (window.ScrollTrigger) {
          const st = window.ScrollTrigger.getById('landingScroll');
          if (st) st.scroll(targetY);
          window.ScrollTrigger.update();
        }
        if (window.gsap) window.gsap.ticker.tick();
      }, targetPct);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(screenshotsDir, filename) });
      console.log(`Saved ${filename} at pct ${targetPct}`);
    };

    await scrollAndSnap(0.0, 'screenshot_beat1.png');
    await scrollAndSnap(0.2, 'screenshot_beat2.png');
    await scrollAndSnap(0.5, 'screenshot_beat4.png');
    await scrollAndSnap(0.95, 'screenshot_beat7.png');

  } catch (err) {
    console.error('Error taking screenshots:', err);
  } finally {
    await browser.close();
  }
}

captureLandingScreenshots();
