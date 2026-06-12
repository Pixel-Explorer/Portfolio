# HANDOFF — Manila folders v2 (OpenCode)

> Claude built the stack (current: `manila-stack-d17`) but the folders still
> read as tabs, not manila folders, and the motion doesn't match Anirudh's
> inspo. This brief hands the next pass to OpenCode. Vanilla JS + ES modules +
> Three.js 0.164 + GSAP 3.12 — **no React, no bundler**. Read OC-CODEMAP-MANILA-V2.md
> and OC-REFS-MANILA-V2.md before writing any code.

---

## What you're building

A **bottom drawer of manila folders** that opens over the live 3D city, then
optionally swaps to a **codex (indrajaal-style)** scroller for navigation,
then drills through to the **single-entry artifact**. The folders look and
behave like real manila folders (Massimo CodePen pattern, vertical variant)
with **Aceternity hover** + **Aceternity tabs**-style come-to-front-and-expand
+ **draggable-card** physics when stacked + **98.css multirows menu** at the
very bottom carrying the cluster label and a CODEX toggle.

## The six inspirations (one-line distill — full notes in OC-REFS-MANILA-V2.md)

| # | Ref | What to take |
|---|---|---|
| 1 | Aceternity Animated Tooltip | Tilt + lift + spotlight thumbnail on hover of a folder tab |
| 2 | Aceternity Tabs | On click, the clicked folder rises **in front** and expands; others recede |
| 3 | Aceternity Draggable Card | When folders are stacked/tucked, the user can drag them around the canvas |
| 4 | Massimo CodePen (oYWbqL) | The unibody folder shape + open animation — **port to vertical** (tab on top, body slides down → up) |
| 5 | 98.css tabs (multirows) | The bottom row of the drawer = full-width 98-style menu bar: left = building label, right = "CODEX →" mode toggle |
| 6 | Existing Indrajaal codex (in app) | CODEX mode swaps the folder pile for the big-type scroller; clicking a row opens the single-entry artifact view |

## Files to deliver

1. `app.js` — rewrite `openClusterPage` (~line 823) end-to-end per this spec.
   Keep `buildClusterCardContent` but extend it to render the full artifact
   body (carry over `openProjectPage`'s hero + meta + evidence). Add
   `initFolderDrag()`, `initFolderHover()`, `initFolderCodexMode()`.
2. `styles.css` — replace the current `.folder-deck` block (line 5503 → EOF)
   with the v2 styles. Use BEM-ish class names: `.mf-drawer`, `.mf-folder`,
   `.mf-tab`, `.mf-body`, `.mf-menubar`, `.mf-menubar-codex-btn`.
3. `index.html` — bump cache to `?v=manila-v2-01`.
4. `CLAUDE.md` + `AGENTS.md` — append iteration 8 note (one paragraph).
5. (Optional) `test-folders.html` — keep updated as a no-3D harness while you
   iterate (screenshots in the real app are blocked by WebGL load).

## Acceptance (every item must hold)

- [ ] Each folder is **one continuous unibody shape** — tab + body are visually
      one piece (no seam, matched corner, lip bridges them).
- [ ] **Tabs sized to heading text**, packed into multiple rows along the
      bottom edge (Windows 98 multirows tabs). Every header fully readable.
- [ ] At rest the folders are **tucked under the bottom**; only the tabs peek.
- [ ] **Hover** — the tab tilts + lifts + shows an Aceternity-style spotlight
      thumbnail (image preview + meta). Tilt follows the cursor's x within the tab.
- [ ] **Click a tab** — that folder **comes to the front** (z-raises above all
      others), the whole shape slides up as one, body unfurls in place; the
      other folders **recede** (scale-down + dim, Aceternity-tabs style).
- [ ] **Drag** — while in stacked mode, the user can grab a folder and drag it
      around the viewport (Aceternity draggable-card physics: spring-snap back
      to a slightly randomised resting jitter when released).
- [ ] **Bottom menubar** — the *very last* row of the drawer is a full-width
      98.css-style strip: left shows the cluster label + count
      (`HAUS OF PIXELS · 11`), right shows a `[ CODEX → ]` button.
- [ ] **Codex toggle** — clicking `CODEX →` cross-fades the folder pile out
      and reveals the indrajaal codex scroller for the same entries. Clicking
      a codex row opens that entry's single-page artifact view
      (`openProjectPage(entry)`). Back arrow on the artifact returns to the
      codex (one level), × exits the cluster.
- [ ] **Folder body** carries the full artifact content (hero media + meta
      chips + evidence + notes + prev/next) — not the stripped-down meta strip
      we have now.
- [ ] Existing things still work: × close, Escape, cluster ← back, building
      highlight, Travel & Gallery special-case, single-entry path,
      `ARCHIVE_APP_DEBUG.openCluster(label, entryIds)` debug hook.
- [ ] No console errors. CSS owns opacity (GSAP safety rule — see CODEMAP).
- [ ] `node --check app.js` passes; CSS braces balanced.
- [ ] Cache bumped, one-line note added to CLAUDE.md + AGENTS.md.

## Run / verify

```
node scripts/static-server.mjs       # localhost:4173
# Drive a cluster without raycasting a building:
# (open devtools console)
ARCHIVE_APP_DEBUG.openCluster("Haus of Pixels", [76,77,78,79,81,82,83,85,92,103,127])
ARCHIVE_APP_DEBUG.openCluster("Movies & Film",  [42,46,121,122,84,65,86,20])
```

Test every interaction listed above. Take screenshots from a real browser
(claude's preview tool can't capture the WebGL canvas — that's why we built
`test-folders.html`).

## Anti-asks (don't do)

- Don't bring back the flying tab from iteration 6.
- Don't introduce React / a bundler / Tailwind. Vanilla JS + plain CSS.
- Don't animate `opacity` with GSAP on overlay-level elements (transitions
  stall and strand the UI — see CLAUDE.md note on the gallery "back is broken" bug).
- Don't break the single-entry path (`openProjectPage`) — only `openClusterPage`
  is being rewritten. Reuse `openProjectPage` from inside CODEX mode's row click.
