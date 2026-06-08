# BRUTAL-FOLDER-SPEC.md — OpenCode handoff (folder-sheet detail view + de-glass)

> **Role split:** Claude = supervisor/architect (wrote this + will review). **OpenCode = implementer.**
> Stack rules from `CLAUDE.md` apply verbatim (vanilla JS + ES modules, no React, no bundler,
> token-frugal, don't break the v1 archive). Read `CLAUDE.md` §0/§8/§14 before starting.

---

## 0. Mission (one sentence)

Clicking **any** building opens a brutalist **FOLDER that slides up from the BOTTOM** — filled with the
project's **role color**, text in the **contrasting ink** — with the building still visible up top, a real
**folder tab** you can **drag to extend** (bouncy spring), proper padding/alignment, and a graceful state for
projects with no evidence. Retire all remaining glass. Fix the cream-chrome readability bug.

The look: the user's reference images are **manila/colored file folders with protruding tabs** (see chat).
"Soft brutalism" — bold solid color fields, heavy type, hard borders, generous rounded corners. No frosted
glass, no translucency, no blur.

---

## 1. Current state (Claude already did a first pass this session — partly working, mostly buggy)

Files touched this session — **build on these, don't start from scratch:**

- **`app.js`**
  - `openProjectPage(entry)` (~line 589) rewritten to emit folder markup: `.folder-tab[data-folder-grip]`
    (with `.folder-handle`, `.folder-tab-label`, `.folder-tab-date`), `.folder-body` →
    `.folder-head` (`.folder-title` + `.folder-meta` of `.folder-chip`) → `.folder-main`
    (`.folder-hero-wrap` + `.folder-aside`). Sets `--fill`/`--ink` on `els.projectPage`, adds class
    `folder-sheet`. No-evidence → `.folder-filed` pull-quote block.
  - New `initFolderSheet(root)` (~line 780): pointer-drag controller on the tab; collapsed `0.56`,
    expanded `0.92`, dismiss `< 0.40` of viewport height. Stored where `_projectFx` was. `init3DPlane` is
    no longer called for this view (still used by the gallery artifact — leave it).
  - `leaveProjectArtifactMode()` (~line 769) now also strips `folder-sheet`/`expanded`/`dragging` and the
    inline `--sheet-h`.
- **`styles.css`** — end-of-file block `/* BRUTALIST PASS — glass retired + folder-sheet detail view */`
  (~line 5090+): token de-glass + `.folder-sheet` rules + cream chrome. Also the r02 `:root` glass tokens
  (~line 1808) were set solid (`--glass-blur: 0`, `--glass-bg: #14110D`, etc.).
- **`terrain.js`** — `focusCameraOnPoint` (~line 2361): removed the left-third lateral shift (centers the
  building) and lowered `targetY` so the building rises above the sheet.
- **`index.html`** — cache-bust bumped to `?v=brutal-folder-02` on `styles.css` and `app.js`. **Bump this
  again** (e.g. `brutal-folder-03`) whenever you edit those files.

What works: single-entry clicks DO fill with the role color (red `MovingImages`, lime `VisualSystems`).
What's broken: see §2.

---

## 2. Root-cause bugs to fix (the important part)

1. **Slides in from the RIGHT, not the bottom; weak animation.**
   Pass-03 rules at `styles.css:2308–2333` use `!important`:
   `.project-page { transform: translateX(100%); transition: transform 280ms … !important }` and
   `.project-page.visible { transform: translateX(0) !important }`. `!important` beats the folder-sheet's
   non-important `translateY`, so the sheet animates X (from the right) with the old 280ms easing.

2. **Layout broken / unpadded / "random info in half the modal".**
   `styles.css:2339` `.project-page-inner { display: grid !important; padding: 0 !important; margin: 0 !important; … }`
   forces the **old ledger-sidebar/mainboard grid** onto the folder content. (The `.project-page` block at
   `styles.css:2174` adds more conflicting paint.)

3. **Cream-chrome readability bug** (visible in the TAGS panel screenshot).
   The brutalist block does `.sidepanel * { color:#1A1714 !important }`, but chips/buttons inside
   (`.tag-cloud .tag-button`, `.stat`, etc.) still have a **dark** background from the solid glass token →
   **dark text on a dark chip = invisible.**

4. **Clusters still open full-screen.** `openClusterPage()` (~`app.js:835`) → `openGalleryOverlay()`
   (full-screen overlay). Most named buildings are clusters, so "most are still full screen." User wants the
   **folder treatment everywhere.**

5. **Folder identity is missing.** Only a thin handle line renders — no actual folder **tab**. It must read
   as a file folder (a tab protruding from the sheet's top edge, carrying the role label).

---

## 3. Target design (authoritative)

### 3.1 The folder sheet
- **Bottom-anchored.** `position: fixed; left/right/bottom: 0; top: auto; height: var(--sheet-h, 56vh)`.
  Collapsed `56vh` (building visible in the top ~44vh). Expanded `92vh`. Mobile collapsed `~64vh`.
- **Fill = role color, text = contrasting ink.** `--fill` = `bucket.modalBg`, `--ink` = `bucket.ink`
  (already wired; reuse `ROLE_PILLS`/`findBucketForTags` in `app.js:250/274`). Table:

  | bucket | fill | ink |
  |---|---|---|
  | MovingImages | `#F23B21` | `#FFFFFF` |
  | VisualSystems | `#E1FA3C` | `#1A1714` |
  | CompCulture | `#4A514A` | `#FFFFFF` |
  | DocResearch | `#C8923B` | `#FFFFFF` |
  | LeadershipEdu | `#5B8C3E` | `#FFFFFF` |
  | Other (null) | `#c8c0e0` | `#1A1714` |

- **Folder tab** on the top-left edge: a real tab shape (rounded-top, offset, slightly darker than the fill —
  e.g. `color-mix(in srgb, var(--ink) 12%, var(--fill))`), protruding above the sheet's top border, carrying
  the **role label** + a drag handle. This is the grab target.
- **Spring open, transform-only.** Hidden `translateY(100%)`; visible `translateY(0)`;
  `transition: transform .6s cubic-bezier(0.34, 1.45, 0.5, 1)` for the overshoot bounce. Opacity is owned by
  the `.visible` class (CSS). **Never** drive opacity via GSAP (documented strand bug — `CLAUDE.md` §0 Pass 11).
- **Drag-to-extend.** Drag the tab up → `.expanded` (92vh); drag down past the dismiss threshold → close;
  tap toggles. During an active drag set `--sheet-h` inline + add `.dragging` (transition: none) so it tracks
  the finger; on release remove both so the class transition animates the snap. (`initFolderSheet` already
  implements this — just make its CSS authoritative.)

### 3.2 Content layout (fix padding/alignment)
Single coherent column, generous consistent padding (`clamp(24px,4vw,64px)`), content `max-width` capped
(~`1100px`) and aligned to the left padding edge — **no empty left gutter**:
1. Folder tab (role label + handle) — sticky top of sheet.
2. `.folder-head`: huge title (Inter 800/900 uppercase, like the mockup) + meta row
   (Role · Org/Client · Location · Date) as tidy mono-labelled chips.
3. `.folder-main`: hero (evidence carousel: image / muted-autoplay video / muted YouTube — reuse the
   `heroMedia` builder already in `openProjectPage`) + dossier aside (story, tags, evidence grid via
   `renderEvidenceReadOnly` at `app.js:1372`, "Same month", Prev/Next).
4. **No-evidence (36/76 entries):** a deliberate "FILED UNDER {role}" block using the story as a bold
   pull-quote — never an empty card.

### 3.3 Clusters → folders too
`openClusterPage()` should open a **folder sheet** whose body lists the cluster's projects as brutalist rows
(or stacked sub-tabs). Clicking a project opens **that project's** folder sheet; the `×` becomes `←` and
returns to the cluster folder (the `refreshProjectBack` / `state.clusterContext` machinery already exists —
`app.js:1317`, `app.js:504`). Reuse the same `.folder-sheet` shell. **Exception:** `Travel & Gallery` is a
269-photo gallery — leave it on the existing full-screen gallery overlay (or confirm with Anirudh before
changing). De-glass that overlay (already solid dark) but it may stay full-screen.

### 3.4 Cream chrome (keep — Anirudh approved), made readable
Topnav / left sidepanel / map-toolbar / tooltip = warm paper `#EDE4CE`, dark ink `#1A1714`, hard 2px ink
borders, offset brutalist shadow. **Every control inside a cream panel** (tag chips, stat blocks, search,
icon buttons, nav links, Clear) must have a **paper background (`#FBF7EC`) + dark ink + 2px ink border** —
no dark-on-dark. Active/hover = invert (ink fill, paper text). Keep content overlays (gallery, nav-page
Roles/Clients, story intro) dark.

---

## 4. Tasks (priority order)

- **T1 — Stop the right-slide + grid leak.** Scope every old Pass-03 / bottom-drawer `.project-page` and
  `.project-page-inner` rule to `.project-page:not(.folder-sheet)` (the blocks at `styles.css:1121`, `2174`,
  `2308`). This single change fixes bugs #1 and #2. Verify the folder-sheet transform/transition/flex now win.
- **T2 — Folder tab + spring.** Build the real tab shape (§3.1). Confirm the bounce easing and bottom origin.
- **T3 — Layout/padding.** Implement §3.2 cleanly; kill the empty left gutter; align meta row; responsive
  stack < 900px.
- **T4 — Cream-chrome readability.** §3.4. Replace the blanket `.sidepanel * { color }` approach with
  per-control paper backgrounds. Audit topnav + sidepanel + toolbar so nothing is invisible.
- **T5 — Folderize clusters.** §3.3.
- **T6 — Camera.** Verify `focusCameraOnPoint` frames the building in the visible band above the 56vh sheet
  for both short and tall buildings; tune `targetY` if needed.
- **T7 — Cleanup.** Remove the now-dead `.artifact-*` / `.artifact-mode` CSS (`styles.css` ~4807–5007) and any
  base `.project-page` drawer rules no longer used, so there's one source of truth. Don't remove `init3DPlane`
  (gallery artifact still uses it).
- **T8 — Cache-bust + docs.** Bump `index.html` `?v=`; add a one-line Pass note to `CLAUDE.md` §0 and
  `AGENTS.md`.

---

## 5. Constraints (do not violate)

- Reuse, don't reinvent: `findBucketForTags`, `ROLE_PILLS` (`modalBg`/`ink`), `renderEvidenceReadOnly`,
  `formatDate`, `escapeHtml`, `selectEntry`.
- Keep working: Prev/Next, "Same month" related, cluster back (`×` ↔ `←`), Escape handler (`app.js:546`),
  edit mode `?edit=1` (`openProjectPage` early-returns to `renderEditView`).
- Open/close opacity = CSS `.visible` only. GSAP = transform only.
- Don't repaint the 3D city (it's a Three.js scene, intentionally dark) — only the DOM chrome/folder.

---

## 6. Acceptance criteria

- [ ] Click a single building → folder **slides up from the bottom** with a visible **bounce**; building
      stays framed in the top band.
- [ ] Sheet is filled with the role color; all text uses the contrasting ink and is fully legible.
- [ ] A clear **folder tab** reads as a file folder; dragging it up extends to ~92vh, down dismisses, tap toggles.
- [ ] Title/meta/hero/story/evidence are padded and aligned — no empty left gutter, no "random" stray text.
- [ ] Evidence-less entries show the "FILED UNDER" block, not an empty card.
- [ ] Clicking a **cluster** building opens a folder sheet (not full-screen), and drilling into a project →
      `←` returns to the cluster folder.
- [ ] No frosted glass anywhere; cream chrome has zero dark-on-dark/invisible text (check TAGS list, stats,
      search, nav links).
- [ ] Prev/Next, Escape, 2D view, Roles/Clients, edit mode all still work.

## 7. Run / verify

```
node scripts/static-server.mjs        # :4173 (hard-refresh; no live reload)
```
Open `http://127.0.0.1:4173/?archive`. Test: a lime `VisualSystems` building, a red `MovingImages` building,
a cluster building, an evidence-less entry. Drag the tab up/down. Prev/Next + Escape. Toggle 2D view. Open
Roles/Clients. Screenshot collapsed + expanded for 2–3 role colors.
```
```
