const { test, expect } = require('playwright/test');

test.describe('Case Studies & Evidence Gallery E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the archival app page
    await page.goto('http://localhost:4173/?archive=1');
    await page.evaluate(() => localStorage.clear());
    await page.waitForLoadState('networkidle');
    // Wait for case-studies navigation button to be visible
    await page.locator('button.navlink[data-view="case-studies"]').first().waitFor({ state: 'visible', timeout: 15000 });
  });

  test('case studies tab opens grid showing all 5 case studies', async ({ page }) => {
    const caseStudiesBtn = page.locator('button.navlink[data-view="case-studies"]');
    await expect(caseStudiesBtn).toBeVisible();
    await expect(page.locator('#navCaseStudiesCount')).toHaveText('5');

    // Click case studies navigation
    await caseStudiesBtn.click();

    // Verify navigation overlay opens
    const navPage = page.locator('#navPage');
    await expect(navPage).toHaveClass(/visible/);

    // Verify all 5 case studies show up in the bento folder grid
    const folders = page.locator('.fx-folder[data-cs-folder]');
    await expect(folders).toHaveCount(5);

    // Check their titles
    const expectedTitles = [
      'haus of pixels',
      'rabble labs',
      'pixelate',
      'buddy tales',
      'anirudh.website'
    ];
    for (let i = 0; i < 5; i++) {
      const folderLabel = folders.nth(i).locator('.fx-folder-label');
      await expect(folderLabel).toHaveText(expectedTitles[i]);
    }
  });

  test('deep-dive page loads correctly for Buddy Tales', async ({ page }) => {
    // Open case studies grid
    await page.locator('button.navlink[data-view="case-studies"]').click();

    // Click on Buddy Tales folder
    const buddyTalesFolder = page.locator('.fx-folder[data-cs-folder="buddy-tales"]');
    await buddyTalesFolder.click();

    // Verify we are inside the detail layout for Buddy Tales
    await expect(page.locator('.cs-editorial-title')).toHaveText('BUDDY TALES');

    // Verify Stats
    const metas = page.locator('.cs-meta');
    await expect(metas.nth(0).locator('.cs-meta-val')).toHaveText('Producer · Director');
    await expect(metas.nth(1).locator('.cs-meta-val')).toHaveText('2023 – 2024');
    await expect(metas.nth(2).locator('.cs-meta-val')).toHaveText('ANIMATION SERIES');

    // Verify Stats Band
    const statfigs = page.locator('.cs-statfig');
    await expect(statfigs.nth(0).locator('.cs-statfig-num')).toHaveText('2');
    await expect(statfigs.nth(0).locator('.cs-statfig-label')).toHaveText('Years');
    await expect(statfigs.nth(1).locator('.cs-statfig-num')).toHaveText('50+');
    await expect(statfigs.nth(1).locator('.cs-statfig-label')).toHaveText('Interviews');
    await expect(statfigs.nth(2).locator('.cs-statfig-num')).toHaveText('4');
    await expect(statfigs.nth(2).locator('.cs-statfig-label')).toHaveText('Hires');

    // Verify Pipeline Steps
    const pipelineStepBtn = page.locator('[data-cs-flow-step="0"]');
    await expect(pipelineStepBtn).toBeVisible();

    // Verify Milestones Chronology
    const chronologyNode = page.locator('.cs-timeline-node-group').first();
    await expect(chronologyNode).toBeVisible();

    // Verify Outcomes and Retrospective
    const outcomesSection = page.locator('.cs-section:has-text("Outcomes & Retrospective")');
    await expect(outcomesSection).toBeVisible();
    await expect(outcomesSection.locator('.cs-chip')).toHaveCount(4);
    await expect(outcomesSection.locator('.cs-pull')).toContainText('Buddy Tales was the hardest thing I have built');

    // Verify Evidence Section
    const evidenceSection = page.locator('.cs-block--evidence');
    await expect(evidenceSection).toBeVisible();
    await expect(evidenceSection.locator('h2.cs-h2 i')).toContainText('artifacts');
    
    // Buddy Tales' current evidence set is image-only.
    const imageTiles = evidenceSection.locator('.cs-ev2[data-cs-lightbox]');
    await expect(imageTiles).toHaveCount(2);
    await expect(imageTiles.first()).toBeVisible();
  });

  test('evidence gallery image lightbox functions correctly', async ({ page }) => {
    // Open case studies and drill down to Buddy Tales
    await page.locator('button.navlink[data-view="case-studies"]').click();
    await page.locator('.fx-folder[data-cs-folder="buddy-tales"]').click();

    // Find the first image evidence tile and click it
    const firstImageTile = page.locator('.cs-ev2[data-cs-lightbox]').first();
    await firstImageTile.click();

    // Check that lightbox is open
    const lightbox = page.locator('.ev-lightbox');
    await expect(lightbox).toBeVisible();

    // Verify image in lightbox is visible
    const lightboxImg = lightbox.locator('.ev-lightbox-content img');
    await expect(lightboxImg).toBeVisible();

    // Get counter state dynamically (handles potential network fallback shifts)
    const counter = lightbox.locator('.ev-lightbox-counter');
    const counterText = await counter.innerText();
    const match = counterText.match(/(\d+)\s*\/\s*(\d+)/);
    expect(match).not.toBeNull();
    const initialIdx = parseInt(match[1]);
    const totalCount = parseInt(match[2]);

    // Click Next and check if it advances by 1
    const nextBtn = lightbox.locator('.ev-lightbox-nav--next');
    await nextBtn.click();
    const expectedNextIdx = (initialIdx % totalCount) + 1;
    await expect(counter).toHaveText(`${expectedNextIdx} / ${totalCount}`);

    // Click Prev and check if it goes back to initialIdx
    const prevBtn = lightbox.locator('.ev-lightbox-nav--prev');
    await prevBtn.click();
    await expect(counter).toHaveText(`${initialIdx} / ${totalCount}`);

    // Press Escape to close lightbox
    await page.keyboard.press('Escape');
    await expect(lightbox).not.toBeVisible();
  });

  test('PDF and video evidence check for Haus of Pixels', async ({ page }) => {
    // Open case studies and drill down to Haus of Pixels
    await page.locator('button.navlink[data-view="case-studies"]').click();
    await page.locator('.fx-folder[data-cs-folder="haus-of-pixels"]').click();

    // Check for the PDF evidence tile
    const pdfTile = page.locator('.cs-ev2--pdf').first();
    await expect(pdfTile).toBeVisible();

    const pdfLink = pdfTile.locator('a.cs-ev2-pdf-link');
    await expect(pdfLink).toHaveAttribute('href', 'https://th4xikrqb3qoxcmi.public.blob.vercel-storage.com/proof/78/SD_Identity_25.pdf');
    await expect(pdfLink).toHaveAttribute('target', '_blank');

    // Check for Video evidence tile
    const videoTile = page.locator('.cs-ev2--video').first();
    await expect(videoTile).toBeVisible();
  });

  test('Relations Map toggle displays force network and navigates on node click', async ({ page }) => {
    // Open case studies grid
    await page.locator('button.navlink[data-view="case-studies"]').click();

    // Find relations map toggle button and click it
    const toggleBtn = page.locator('#cs-toggle-relations');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    // Relations map container should render
    const relationsContainer = page.locator('#cs-relations-container');
    await expect(relationsContainer).toBeVisible();

    // Verify that SVG nodes are drawn
    const csNodes = relationsContainer.locator('svg circle.cs-rel-node-cs');
    const roleNodes = relationsContainer.locator('svg circle.cs-rel-node-role');
    const links = relationsContainer.locator('svg line.cs-rel-link');

    await expect(csNodes).toHaveCount(5); // 5 case studies
    await expect(roleNodes.first()).toBeVisible();
    await expect(links.first()).toBeVisible();

    // Hover on a case study node and check opacity style changes
    await csNodes.first().hover();

    // Click on a case study node to navigate (let's click the Buddy Tales node).
    // Using the specific node group class for clear selection.
    const buddyTalesNode = relationsContainer.locator('.cs-rel-node-group').filter({ hasText: 'Buddy Tales' }).locator('circle.cs-rel-node-cs');
    await buddyTalesNode.click();

    // Verify we navigated to Buddy Tales detailed view
    await expect(page.locator('.cs-editorial-title')).toHaveText('BUDDY TALES');
  });
});

