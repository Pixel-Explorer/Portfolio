const { test, expect } = require('playwright/test');

test.describe('Recruiter UX Audit', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4173/?archive=1');
    await page.evaluate(() => localStorage.clear());
    await page.waitForLoadState('networkidle');
    // Wait for main UI to be visible
    await page.locator('.navlink[data-view="archive"]').first().waitFor({ state: 'visible', timeout: 15000 });
  });

  test('Time to Contact: Contact details should be easily discoverable', async ({ page }) => {
    // Check if there is an obvious contact button or link in the top nav
    const contactLinks = page.locator('a[href^="mailto:"], a[href^="tel:"], button:has-text("Contact"), a:has-text("Contact")');
    const contactCount = await contactLinks.count();
    
    // We expect at least one clear contact call-to-action
    expect(contactCount, 'No clear contact CTA found in initial view').toBeGreaterThan(0);
    
    if (contactCount > 0) {
      await expect(contactLinks.first()).toBeVisible();
    }
  });

  test('Role Discoverability: Roles overlay should be quickly accessible and clear', async ({ page }) => {
    const rolesBtn = page.locator('button.navlink[data-view="roles"]');
    await expect(rolesBtn, 'Roles navigation link missing').toBeVisible();

    await rolesBtn.click();
    const navPage = page.locator('#navPage');
    await expect(navPage).toHaveClass(/visible/);

    // Recruiters need to see specific skill categories immediately
    const rolePills = page.locator('#rolePills .rolepill');
    const pillCount = await rolePills.count();
    expect(pillCount, 'Not enough role categories defined for breadth proof').toBeGreaterThan(3);
  });



  test('Search Functionality: Recruiter should be able to search for specific skills', async ({ page }) => {
    const searchInput = page.locator('#searchInput');
    await expect(searchInput, 'Search bar missing for quick discovery').toBeVisible();
    
    await searchInput.fill('Design');
    // We assume the search provides feedback, either by showing a clear button or changing the UI state
    // Just ensuring the input accepts text and exists is a baseline.
    await expect(searchInput).toHaveValue('Design');
  });

});
