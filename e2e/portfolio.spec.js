const { test, expect } = require('playwright/test');

test.describe('Anirudh Archive — Core flows', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4173/?archive=1');
    await page.evaluate(() => localStorage.clear());
    await page.waitForLoadState('networkidle');
    await page.locator('.navlink[data-view="archive"]').first().waitFor({ state: 'visible', timeout: 15000 });
  });

  test('page loads with portfolio title and 3D stage', async ({ page }) => {
    await expect(page).toHaveTitle(/Anirudh Venkatesan/);
    await expect(page.locator('#terrainStage')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#terrainCanvas')).toBeVisible({ timeout: 10000 });
  });

  test('navigation opens roles overlay and closes via Escape', async ({ page }) => {
    const archiveBtn = page.locator('button.navlink[data-view="archive"]');
    const rolesBtn = page.locator('button.navlink[data-view="roles"]');
    const navPage = page.locator('#navPage');

    await expect(archiveBtn).toBeVisible();
    await expect(rolesBtn).toBeVisible();

    await rolesBtn.click();
    await expect(navPage).toHaveClass(/visible/);

    await page.keyboard.press('Escape');
    await expect(navPage).not.toHaveClass(/visible/);
  });

  test('theme toggle switches dark/light mode', async ({ page }) => {
    // Carbon UI shell uses a button toggle (#themeToggleBtn), not a checkbox.
    const btn = page.locator('#themeToggleBtn');
    await expect(btn).toBeVisible();

    const initial = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'));

    await btn.click();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    ).not.toBe(initial);

    await btn.click();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    ).toBe(initial);
  });



  test('role pills render with All work selected by default', async ({ page }) => {
    await expect(page.locator('#rolePills .rolepill').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.rolepill.active[data-role="all"]')).toBeVisible();
  });

  test('search input accepts user input', async ({ page }) => {
    const searchInput = page.locator('#searchInput');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('photography');
    await expect(searchInput).toHaveValue('photography');
  });
});
