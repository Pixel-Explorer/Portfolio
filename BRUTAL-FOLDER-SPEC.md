# BRUTAL-FOLDER-SPEC — PASS 3 (OpenCode handoff)

> Pass 1 (folder sheet, role fill, de-glass, cream chrome) and Pass 2 (bottom-spring fix, rich peek, cut
> tab, stacked cluster folders) are **merged + verified live by Claude**. This pass is polish + two real
> bugs found in review. Claude = supervisor/reviewer; **OpenCode = implementer.** `CLAUDE.md` rules apply.

## Verified working (do NOT redo)
Folder springs up from the **bottom** (reflow fix confirmed mid-animation); collapsed **peek** shows title +
meta + evidence thumb + tags + 3-line story; **drag-to-expand** reveals the dossier (hero carousel + evidence
+ same-month + prev/next); **clusters = stacked folders** (master tab + staggered per-bucket sub-folders,
drill-in → single folder, `×`↔`←` back); cream chrome readable; **no console errors**.

---

## P0 — BUG 1: peek ↔ dossier content is DUPLICATED on expand

When expanded, the **story and tags render twice** — once (clamped) in `.folder-peek`, once (full) in the
`.folder-dossier .folder-aside`. Confirmed live (e.g. FOUNDER/STUDIO/MILESTONE shown twice).

**Fix** in `openProjectPage` (`app.js:701`): the dossier must **not repeat** what the peek already shows.
- Remove the dossier aside's `<p class="folder-story">` and `<div class="folder-tags">` (they live in the
  peek).
- Dossier aside keeps **only**: evidence grid, same-month, prev/next. Dossier keeps the hero carousel.
- So the peek's story stays the single source. When `.expanded`, **un-clamp the peek story** so the full
  text shows there: `.project-page.folder-sheet.expanded .folder-peek-story { -webkit-line-clamp: unset; }`.
- Net: title/meta/tags/story appear **once**; expanding adds the hero carousel + evidence + nav below.

## P0 — BUG 2: the focused building isn't identified ("can't see the building")

Opening an entry sometimes frames a **wide skyline** (e.g. "Haus of Pixels…" showed the whole city), so the
user can't tell which building is this project — that's the real complaint, not just darkness.

**Fix** (mostly `terrain.js`):
1. **Center + tighten on the actual clicked building.** `focusCameraOnObject`/`focusCameraOnPoint`
   (`terrain.js:~2379/2361`) must frame the **specific node**, not a wide shot. Verify single-entry and
   cluster-building focus both center the real building above the 46vh sheet.
2. **Emphasize it.** Use the existing focus mechanism (`setCityFocus` fades non-matching buildings; there's a
   ground halo for prisms ~`terrain.js:2757`) so the focused building is bright/clear and the rest dim — it
   should read as the hero behind the folder. If `setCityFocus` isn't firing on entry-open, wire it.
3. Confirm it's actually brighter than the surrounding city when settled (earlier MOVIES open looked near-black).

---

## P1 — Folder physicality (make the stack read as real folders)

The stacked sub-folders currently look like thin horizontal **bars** with small tabs. Push them toward the
reference (chunky manila/colored file folders):
- More vertical **overlap** between stacked cards (each sits ~70–80% behind the one above), real depth via
  layered **drop shadows**, so it reads as a physical stack, not a list.
- Slightly **thicker** cards + bolder tab cut; keep the per-bucket multi-color.
- Optional: a faint paper-grain/edge highlight on the top card. Keep it brutalist (hard borders, no glass).
- Single-folder tab + stack tabs should share one consistent **tab-cut** shape.

## P1 — Minor polish
- **Collapsed peek bleed:** a faint slice of the dossier peeks at the very bottom of the 46vh collapsed
  sheet. Clip it so collapsed shows only the peek.
- **Long titles** (e.g. "VISUAL DESIGNER CONSULTANT - RABBLE LABS") wrap to 2–3 lines and dominate; cap with
  a sensible `font-size: clamp()` / max 2 lines + smaller fallback.
- **Year-slider coherence:** the dark pill year-window bar floats awkwardly under the cream nav — restyle it
  to match the brutalist cream chrome (or move/hide it while a folder is open).
- **Close-on-`×` camera:** optionally `terrain.resetView()` so closing returns to the full skyline.

---

## Constraints (unchanged)
Vanilla JS + ES modules; reuse `findBucketForTags`, `ROLE_PILLS`, `renderEvidenceReadOnly`, `formatDate`,
`escapeHtml`, `selectEntry`, `setCityFocus`. Open/close opacity = CSS `.visible` only; JS/GSAP animate
**transform only**. Keep prev/next, same-month, cluster back (`×`↔`←`), Escape, edit mode `?edit=1`,
cream-chrome readability, de-glass. Bump `index.html` `?v=` (→ `brutal-folder-05`); one-line note to
`CLAUDE.md` §0 + `AGENTS.md`.

## Acceptance criteria
- [ ] Expanded folder shows story + tags **once** (no peek/dossier duplication); expanding adds carousel +
      evidence + nav only; the peek story un-clamps when expanded.
- [ ] Opening any entry **centers and visibly highlights that one building** above the folder (others dimmed);
      it's clearly the hero, not a dark wide skyline.
- [ ] Cluster stack reads as **overlapping physical folders** with depth/shadow, per-bucket colors.
- [ ] No collapsed-peek bleed; long titles don't blow out; year-slider fits the cream chrome.
- [ ] Prev/Next, Escape, 2D view, Roles/Clients, edit mode still work; no console errors; no glass.

## Run / verify
```
node scripts/static-server.mjs        # :4173, hard-refresh (server has died between sessions — restart if 404)
```
`http://127.0.0.1:4173/?archive` → open a single building (check no dup, building highlighted), expand it,
open a cluster (check folder-stack depth), drill a sub-folder + back. Screenshot collapsed + expanded + stack.
```
```
