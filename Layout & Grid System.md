# Layout & Grid System: Archival Pages, Modals & Roles

## 1. Core Philosophy
The layout is treated as a literal ledger or blueprint. The invisible grid is made completely visible. Content is compartmentalized into strict, bordered zones. There are no floating elements; everything exists within a hard-edged, geometric container.

## 2. Modal & Detail View Structure

### The Visible Blueprint (Borders)
* Every distinct piece of information in an archive modal must be separated by a solid `1px` or `2px` dark border. 
* Avoid `border-radius` entirely. All corners must be sharp 90-degree angles.

### Split-Screen Archival Layout
When an entry (like "Greenopia") is expanded, utilize an asymmetrical split-screen or bento-box grid:
* **The Ledger Sidebar (25% - 30% width):** * A sticky column dedicated purely to metadata. 
    * Stacked vertically with heavy horizontal dividers between each data point: `ROLE`, `ORG`, `LOCATION`, `ERA`, `EVIDENCE`, `PRODUCTIVITY`.
* **The Content Mainboard (70% - 75% width):**
    * Houses the massive Display Title at the top.
    * Contains the primary image/evidence (treated with high contrast or duotone).
    * Contains the `NOTES` section below the imagery.

## 3. Archival Specific Layout Patterns

### "The Prism" Interaction
* The visual representation of "Click any prism to dive into a moment" should reflect physical, structural blocks on the screen. 
* When clicked, the modal should not softly fade in; it should snap into place or slide in aggressively like a filing cabinet drawer opening, heavily utilizing stark shadows (e.g., `box-shadow: 6px 6px 0px #000;`).

### Sequential Navigation ("Same Week")
* The footer of individual modals (`SAME WEEK`, `PREVIOUS`, `NEXT`) must look like a physical ticket or a control panel. 
* Grid cells for these navigational elements should span the full width of the modal bottom, divided equally into columns with heavy vertical strokes.

### Massive Lists ("Hats Worn")
* For dense pages like "Roles", avoid simple bulleted lists. 
* Treat list items as dense, inline tags packed tightly together, or as a massive, full-width scrolling table where the Role Name is massive, and the "moment count" (e.g., *22 moments*) is tiny, monospaced, and right-aligned.

## 4. Visual Treatments
* **Layering over the Grid:** While the grid is strict, allow specific "Evidence" images (like a screenshot of *Gmail Thread 13b3b824f285945c*) to occasionally break the borders or overlap adjacent cells to create an editorial, "scrapbook" feeling.
* **Monochrome Base:** Keep the base layout monochrome (black, white, greys) and use one highly saturated brand color (e.g., a stark red or electric blue) *only* for active tags, current eras, or interactive links.