# Typography System: Archival Pages, Modals & Roles

## 1. Core Philosophy
The typographic approach merges utilitarian data-archiving with high-impact editorial design. Text acts as both pure information (ledger data) and structural graphics (massive role titles). Contrast is absolute: typography is either aggressively large or strictly functional and small.

## 2. Typographic Hierarchy

### Display / Hero Titles (Project Names & Roles)
Used for the primary subject of a modal (e.g., "First confirmed paid client — Greenopia") or top-level role categories.
* **Style:** Uppercase, Ultra-Bold / Black weight. Sans-serif.
* **Scale:** Massive (8rem - 12rem+). Should dominate the viewport upon opening a modal.
* **Treatment:** Tight tracking and line-height. Allow text to break mid-word across lines to fit strict grid columns, emphasizing the brutalist aesthetic.

### Sub-headers & Categorization (H2, H3)
Used for sections like "SAME WEEK", "HATS WORN OVER THE YEARS", or "NOTES".
* **Style:** Uppercase, Bold.
* **Scale:** Moderate (2rem - 3rem).
* **Treatment:** Always underlined with a heavy `2px` stroke, or placed inside a stark rectangular container.

### Archival Metadata & Micro-copy
The backbone of the archive. Used for specific data points (`ERA`, `EVIDENCE`, `PRODUCTIVITY`, `LOCATION`, `DATE`).
* **Style:** Uppercase, Regular weight. **Monospace is mandatory here** to reflect the "ledger/system" concept.
* **Scale:** Small (0.75rem - 0.85rem).
* **Tracking:** Very loose (`0.1em` or `2px`) for ultimate legibility at small sizes.
* **Treatment:** Often paired directly with a contrasting value (e.g., `[ERA]` in bold monospace, followed by `[4]` in regular sans-serif).

### Body Copy (Notes & Descriptions)
Used for the actual readable content, such as the context behind a failed startup or a project summary.
* **Style:** Sentence case, Regular weight, high-legibility sans-serif or brutalist serif.
* **Scale:** Base size (1rem - 1.125rem).
* **Alignment:** Flush left. Restricted to highly readable, narrow columns (max 60ch) within the rigid grid framework.

## 3. Interaction Typography
* **Tags & Badges:** Items like `[Milestone 44]` or `[Designer 29]` should feature inverted hover states (instant color flip, zero transition time). 
* **Navigation:** `[← PREVIOUS]` and `[NEXT →]` should rely on stark typographic arrows and all-caps text, heavily underlined.