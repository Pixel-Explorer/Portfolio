# CLAUDE.md

> Persistent project memory for Claude Code. Auto-loaded at session start.
> Keep this under 400 lines. Anything that bloats it costs context every session.

---

## 0a. Code knowledge graph (graphify) — consult BEFORE scanning files

`graphify-out/` holds a pre-built knowledge graph of this repo (994 nodes · 1199 edges · 77 named communities). Orienting from it is cheaper than re-grepping the codebase:

- `graphify-out/GRAPH_REPORT.md` — community map, god nodes (`BeatBuildings`, `StoryEngine`, `AudioManager`, `StoryUI`, `Orb`…), surprising cross-file connections. **Read this first when orienting on unfamiliar code.**
- Terminal queries against `graphify-out/graph.json`: `graphify explain "X"`, `graphify path "A" "B"`. CLI lives at `C:\Users\Anirudh\AppData\Local\Python\pythoncore-3.14-64\Scripts\graphify.exe` (not on PATH).
- `graphify-out/graph.html` — interactive visualization (open in browser).
- **After code changes:** run `graphify update .` — pure tree-sitter rebuild, zero LLM/API cost. Curated community names persist in `graphify-out/.graphify_labels.json`; don't regenerate them.
- `.graphifyignore` excludes `public/`, `node_modules/`, data backups.

---

## 0. Where we are (rev 2026-07-20)

**CITY SAME-ORIGIN + BLOB DIET (rev 2026-07-20, cache `?v=city-src-1`).**
- **Prod was rendering the legacy procedural prisms** — the Vercel Blob store blew its 1GB Hobby cap (1220MB, mostly raw video exports) and Vercel **suspended** it: every blob URL 403'd (city GLB + ALL proof evidence), and `loadStagerCity`'s catch fell back silently. Root fixes:
- **city.glb ships inside the deployment.** `terrain.js` loads `/public/city/city.glb` same-origin in EVERY environment (localhost/Blob hostname fork deleted). File converted **LFS → plain git** (43.6MB): Vercel deploys LFS pointers as raw 133-byte text, so any LFS-tracked deployable is broken on prod by construction. `.gitattributes` now bans LFS and says why. **Never re-add LFS for anything Vercel must serve.**
- **Dead per-entry hero models purged from git** (`public/models/<id>/model.glb` ×18 + hospital OBJ, 211MB): only reachable from the pre-KitBash procedural path, which `USE_STAGER_CITY=true`'s early return makes unreachable. Parked in `bin/dead-models/`. `entry.model` fields stay in ledger.json (editor-only metadata).
- **Blob diet:** 9 raw videos (858MB) deleted from the store; re-encoded from `public/proof/` originals (H.264 CRF25, ≤1920) to 209MB, staged in `bin/blob-opt/`. Three `.MOV` evidence URLs repointed to `.mp4` in ledger.json + case-studies.json. **PENDING: store still suspended → uploads rejected.** Once Vercel lifts it (store now ~320MB, well under cap; may need a look at the dashboard), run `node --env-file=.env.local scripts/blob-upload-optimized.mjs` then verify with `scripts/blob-check.mjs`. Until then proof/evidence images 403 on prod — the city does NOT (it no longer touches Blob).
- `scripts/upload-city-blob.mjs` retired to `bin/` (city never goes back to Blob).

**BENTO SHELL + MENU-ONLY CHROME (rev 2026-07-16b, cache `?v=bento-1`).**
- **Manila folder cutout is fully dead.** The `@supports shape()` block was re-applying the notch clip-path LATER in the same force layer than the `clip-path:none` — half the chrome assumed a rectangle, half still cut the corner. The whole FOLDER SHELL generation in fluent.css is rewritten as **BENTO SHELL**: every top-level surface (`.map-stage`, `.fx-sheet`, `.np-codex`, `.cl-grid`) is ONE plain rectangle — `--panel-stroke-w:2px` border, `--panel-radius:16px`, uniform `--panel-margin:18px` (12px ≤720px). Shell tab/slope/clip vars, the drop-shadow border-tracing filter hack, and the search-open tab contraction are all deleted.
- **Chrome = ONE hamburger.** Search (`.search-wrap`, moved in index.html) and the dark-mode switch (`#themeToggle`, wrapped in a `.nav-menu-theme` label row) now live INSIDE the `#topnavLinks` flyout, above a `.nav-menu-divider` and the section links. In-menu search is always-expanded full-width (hover-expand choreography deleted). `updateThemeToggleUI` inverted: **checked = dark** (was checked = light — backwards under a "dark mode" label). `.available-sticker` hidden in the flyout (hung outside the card edge).
- **`.fx-tabrow` retired (`display:none`).** The explorer's duplicate pill row existed to hide behind the old topnav pills; after the hamburger collapse it surfaced and collided with the chrome cluster on BOTH desktop and mobile. The flyout is the one nav surface; explorer back-nav = breadcrumb + menu.
- **Onboarding tour contained.** It floated over every overlay (roles grid, CS pages, contact). Now CSS-hidden (`body:has(...)`) while `.nav-page`/`.project-page`/`.gallery-overlay`/`.gallery-artifact`/detail-panel is open; resumes on the archive. Tour step 4 retargeted `.topnav-actions`→`#navMenuToggle` with menu-aware copy.
- **Codex containing-block fix:** `.np-codex` is `position:fixed inset:18px`, but `#navPageInner` carries an identity transform and `#navPage` has backdrop-filter + `padding:80px 0 64px` — both become the fixed containing block. `.nav-page.codex-mode` zeroes padding + transform so the codex bento sits at a true uniform margin.
- **CS folder tiles**: label stacked above status (side-by-side 1fr/auto grid squeezed "haus / of / pixels" one word per line). `.fx-folder-fan .stickle-item` 52%→64% so sticker tiles weigh like logo tiles.
- **Verify harness**: `bin/ui-audit.mjs` (Playwright, blocks `*.glb`/`*.exr` — headless WebGL stalls the compositor and screenshots return stale frames; DOM assertions accompany every shot). Probes: `bin/probe-*.mjs`.

**MOBILE BOOT FIX + DISK CLEANUP (rev 2026-07-16, cache `?v=folio-nav-8`).**
- **Mobile was stuck on the boot loader forever.** `init()`'s mobile branch returns early and never calls `initTerrain()` — which was the ONLY code path that retires `#loader` (its `onLoadComplete` / catch / 8s safety timeout all live inside it). Loader froze at 14% ("Reading 89 documented moments") on every phone. Fix: the mobile branch now completes the loader itself (`updateLoaderProgress(100)` + `.done`) before `openNavPage("roles")`.
- **One mobile detector.** `isMobile()` now keys off the `<html data-mobile="1">` attr stamped by the inline gate script (UA + coarse&narrow), width<700 fallback; the old bare `pointer: coarse` check made touch-screen laptops take the mobile JS without the mobile CSS. The mobile branch also stamps `data-mobile`/`data-mobile-listmode` itself if only the width fallback fired, so JS mode and listmode CSS can't diverge.
- **fx-tabrow no longer collides with the chrome cluster on phones** — the desktop rule right-aligns the explorer tabs into the same corner as Dark-mode·Menu; the ≤720px block in fluent.css force layer now anchors pills left with `right:96px` + wrap. Verified via headless Playwright (Pixel-8 viewport): gate → continue → roles folder view, codex list toggle, hamburger flyout → clients, both themes, zero console errors.
- **Disk cleanup → `bin/`** (gitignored holding pen, recreated): `scratch/` (315MB probes), `.agents/` → `bin/dot-agents` (77MB — 1,556 bulk-installed community skill folders incl. the 54-font canvas-design pack; this was the "250+ font files" sighting), root `_audit.mjs`/`_chk.mjs`, `data/ledger.json.bak`, unreferenced `public/stickers/branding sticker.png`. KEPT: `public/proof/` (5GB Blob-upload source), `public/models/<id>/model.glb` (git-tracked, referenced by ledger.json evidence), `public/fonts/` Geist (used by index.html). **`bin/` added to `.graphifyignore`** — without it the graph ballooned to 71k nodes.

**HAMBURGER NAV + CASE-STUDY FOLIO SYNC + LEAN REPO (rev 2026-07-13, cache `?v=folio-nav-1`).**
- **Nav collapsed to a hamburger.** The 5 section tabs (archive/roles/clients/case-studies/contact) now live in a flyout (`#topnavLinks`), toggled by `#navMenuToggle`; the visible chrome cluster is just **Search · Dark-mode · Menu**. A "download folio" link (→ `public/Anirudh-Venkatesan-Folio-2026.pdf`) sits at the bottom of the flyout. Wiring: `bindNavMenu()` in app.js (open/close, outside-click, Esc); styles appended LAST in `fluent.css @layer force` so they outrank the earlier inline-pill nav generation.
- **Search icon alignment fixed.** The old design pinned `.search-icon{position:absolute;left:16px}`; the new flex-circle never reset it → off-centre. Reset to a centred flex child in the force layer.
- **Manila cutout no longer blocked.** The `styles.css` acrylic-surfaces rule painted a full-width `.topnav` background over the folder silhouette; dropped `.topnav` from that selector (individual controls keep their own bg from the force layer). Folder tab re-tuned bigger now the cluster is small.
- **Case studies synced to the 2026 folio (`Folio 6 Page 2026_s.pdf`).** `data/case-studies.json` reordered to folio sequence (Haus → Rabble → Pixelate → Buddy Tales → website) with folio `tagline`, `roleFull`, `summary`, `capabilities[]`, `pullQuote`, and headline `stats` (15+/13+/7+/100+ etc.). NOTE: website stats use the folio's pitch figures (30 days / 200+ commits / 35M tokens) which differ from the literal git history (45 days / 187 commits) — the folio is treated as authoritative per owner.
- **New local evidence** committed under `public/proof-local/<id>/*.webp` (curated from `D:\Portfolio`, optimized via `scripts/optimize-cs-evidence.mjs`). `renderCSDetail` gained a folio hero (`.cs-tagline` + `.cs-summary`), a big count-up stat band (`.cs-statband`, IntersectionObserver; final values are pre-rendered so it degrades gracefully with JS off), and a capabilities grid (`.cs-caps`). CSS at the END of styles.css.
- **Repo cleaned (lean folder).** Deleted one-off spec/handoff docs (GEO-COPY-*, LANDING-PASS2-SPEC, STORY_ASSET_PLAN, C1-IMPORTANT-REFACTOR-SPEC, CLAUDE-STORY-MODE, PRODUCT, web-interaction-study-report), dead beat previews, legacy stub htmls (firsts/roles/throughlines/test-folders), `bin/`, `utils/`, and ~9 spent one-off migration scripts. Kept design docs (design.md, typography.md, Layout & Grid System.md) + the active build/pipeline scripts.

**FOLDER SHELL polish (rev 2026-06-28, cache `?v=fluent2-44`).** Tuning on top of the v43 shell: shorter cut (`--shell-tab-h` 44→28, `-w` 50→56%, `-slope` 34→24); the `@supports shape()` clip rounds the 4 OUTER corners with `arc … ccw` (shape()'s y-down space inverts sweep — the earlier default `cw` made corners look inverted); smaller pills (font 14→12.5, h 38→34, sub-count 9px); contact pill stripped to text (`.navlink--contact img{display:none}`); search collapsed shows icon only (`input.search-glass{opacity:0}` until `:hover/:focus-within`). Also fixed the **nav-widget restore toggle lingering over the open controls**: `.nav-widget-toggle{display:flex}` out-specified UA `[hidden]{display:none}` → added `.nav-widget-toggle[hidden]{display:none!important}` (same pattern as the onboarding-modal fix). JS flow (terrain.js `setWidgetState`) was already correct.

**FOLDER SHELL — body shape + pill nav (rev 2026-06-28, cache `?v=fluent2-43`).** ONE authoritative chrome generation appended to the END of `fluent.css` inside `@layer force` (outranks every earlier topnav/workspace generation in styles.css + fluent.css — the deliberate "write in core root, no mixup" the owner asked for). Two things, applied identically to archive (`.topnav`+`.map-stage`) AND explorer (`.fx-tabrow`+`.fx-sheet`): (1) **simple pill nav, top-right** — `.navlink`/`.fx-ftab` are now rounded pills (active = amber fill); `.topnav { justify-content:flex-end }` + `.topnav-links { flex:0 0 auto }` (its default `flex:1 1 0%` was filling the bar and keeping pills LEFT); search collapsed to a 40px icon that expands to ~240px on hover/focus-within (icon `pointer-events:none` so a click hits the input). (2) **folder-tab body silhouette** via shared `--shell-clip` `clip-path` (`--shell-tab-h:44px / -w:50% / -slope:34px`): raised tab top-left, stepped-down notch top-right under the nav. The explorer `.fx-chrome` gets `padding-top: tab-h+10` so the header/meta clear the notch (else clipped). LESSON: chrome shape/position is owned here; per-view nav is the persistent `.topnav` (the explorer's `.fx-tabrow` sits behind it).

**CASE-STUDY INFOGRAPHIC PAGES (rev 2026-06-28, cache `?v=fluent2-42`).** The 5 case-study detail pages (`renderCSDetail` in app.js) are now full editorial infographics, driven per-study by `--cs-accent`. Sections: accent-blocked **hero** (mark + display title + ficha-técnica metadata + corner brackets + hero media), **stat medallions** (`.cs-fig`, decorative SVG ring + big number), a numbered **process flow** (`.cs-flow` from `pipeline.steps`), a **timeline spine** (`.cs-tl` from `milestones`, with ledger-proof jumps), **outcome chips** + a pulled retrospective (`.cs-pull`), and an **evidence bento** (`.cs-ev2`, was previously unused `cs.evidence`). Figures are extracted HONESTLY (`csFigures`/`csParseFig`): only real digits already in `stats`/`outcomes.metrics`, deduped by magnitude (so `$15K`≡`$15,000`, `311K`≡`~311K`), rejecting letter-glued numbers (`2D`/`E2E`). `.cs-*` CSS block at end of styles.css; old `.cs-detail-layout`/`.cs-step-card`/`.cs-milestone` CSS is now dead (harmless). Helpers + new layout sit in `renderCaseStudiesExplorer`. Lightbox via `data-cs-lightbox` in `handleClicks`.

**STATS PANEL OFF-SCREEN FIX (rev 2026-06-27, cache `?v=fluent2-41`).** The top-left stats HUD pushed its first stat ("89 PROJECTS") off-screen left. Root cause: `fluent.css` (high-priority `force`/`system` layer, the authoritative source) had `body.folio-home #statsPanel { left:50%; transform:translateX(-50%) }` — a centring transform that leaked onto the panel's pixel-left position. styles.css overrides couldn't win (a layered `!important` beats an unlayered one). Fixed AT SOURCE in `fluent.css` → `left:32px; transform:none; top:96px` (left-anchored). LESSON: stats/chrome position is owned by `fluent.css`'s force layer, not styles.css — fix chrome there.

**ROLE STICKERS ON CARDS + FAN + EXPLORER FIXES (rev 2026-06-27, cache `?v=fluent2-40`).** Role-driven 3D sticker system in app.js + a `.stickle-*`/`.fx-*` CSS block at end of `styles.css`.
- **`ROLE_STICKLE`** maps each individual role → a `STICKLE` icons8 id (authoritative; replaces the old keyword `pickStickleIcon`, now `entryStickleIds(entry)[0]`). `entryStickleIds(entry)` = distinct stickers for the entry's roles (theme fallback, then `boxFolders` default); `clientStickleIds(list)` = distinct roles across a client's entries. `renderStickleFan(ids,{size,extraClass})` lays 1–3 stickers fanned like cards (inline `--rot/--tx/--ty`; `.stickle-fan`/`.stickle-item`).
- **Where used:** the editorial **rebus** (`buildEditorialFeatureHTML`, fans multi-role), **thumbnail-less file cards** (`buildFiles` → `.fx-file-fan`), and **unbranded client folder cards** (`renderFolioExplorer` folders → `.fx-folder-fan`). Cards/folders WITH an evidence thumb or client logo keep it.
- **Explorer layout fixes:** (1) file-card art collapsed to ~53px — `aspect-ratio` dies inside the flex-column card / grid auto-row; pinned `.fx-file-art` height + `flex:0 0 auto` and forced `.fx.is-codex .fx-files { grid-auto-rows: max-content }` (default `auto` shrank rows to each card's `overflow:hidden` min-content → cards clipped + grid couldn't scroll). (2) The editorial feature inside the narrow inline `.fx-single` panel used viewport-vw type (92px) and a nested `height:100%` scroller → oversized + scroll-trapped; `.fx-single` overrides scale the type down, force single-column, and make `.fx-single` the sole scroller.

**EVIDENCE WIRING FIX + EDITORIAL FEATURE (rev 2026-06-27, cache `?v=fluent2-39`).** Two changes in `buildEntryArtifactHTML` (app.js) + a `.feature-*` CSS block at the end of `styles.css`.
1. **The dropped-evidence bug.** The full-page artifact view (`buildEntryArtifactHTML`, the canonical single-entry "expand") only built hero/thumb slots for image/video/youtube/pdf — it silently dropped `behance`/`instagram`/`x`/`link` evidence. Entries whose evidence was ALL unsupported (e.g. #56 Europe, #88 Behance anthology, #118 Arahantas) showed ZERO evidence; partials (#60 Tarikshir's 7 IG posts, #100 Rabble) lost media. Fixed by extracting **`evidenceToSlot(m, entry)`** — ONE source of truth that maps every evidence type to a slot (incl. drive + a youtube→drive fallthrough for items mislabeled `type:"youtube"` with a Drive URL). `openEntryArtifact` now calls `loadSocialEmbeds(container)`, and `wireArtifactThumbs` re-runs it after a thumb swap so IG/X heroes activate.
2. **Editorial feature** for evidence-light entries. Entries with **0–1 evidence items** (52 of 89) route to **`buildEditorialFeatureHTML`** instead of the image-hero: magazine layout — kicker chip (role theme glyph+colour from `getEntryThemePill`/`SPATIAL_FILTERS`), big Instrument-Serif display title, drop-cap lede (first sentence split off), body column, optional repeated pull-quote, a **3D "stickle" sticker icon (icons8 CDN) as the "rebus" anchor**, the single evidence woven inline (`.feature-figure`, reuses `evidenceToSlot`), and a sticky margin rail (facts + tags + client logo + evidence provenance). Accent = `--feat-accent` set inline. Light-theme overrides included; stacks <860px. `.feature { margin:auto }` centres short features yet stays scrollable. Entries with 2+ media keep the hero+thumb gallery.
   - **REBUS = themed 3D sticker over a faint year.** `.feature-rebus` layers a full-colour 3D sticker (`.feature-rebus-sticker`, drop-shadow + idle bob, `onerror=this.remove()`) over a faint giant year numeral (`.feature-rebus-year`). `pickStickleIcon(entry)` selects the icon by keyword rules → `THEME_STICKLE` role-theme fallback → default; `STICKLE` id map + `stickleUrl(id,size)` → `https://img.icons8.com/?id=<id>&format=png&size=<n>`. Catalog `data/icons8_stickle.json` (81 icons via `scripts/scrape_icons8_catalog.mjs`).
   - KNOWN: 3 stale local evidence refs (en-dash vs hyphen filename mismatch: #78 "Jar cap", #90 KindHealth ×2) never migrated to Blob; `scripts/fix-3-orphan-evidence.mjs` is ready BUT **Vercel Blob is at its 1GB Hobby cap** — upload blocked until space freed / plan upgraded (else drop the refs).

**MANILA V4 CASCADE (current cluster view — replaces all of the below).** `openClusterPage` in `app.js` + the `mf-*` CSS block at the end of `styles.css`. **Big folder sheets cascading in depth from the bottom edge** (refs: anikaagg folder covers / FLYQ tabs / index-divider cards): each folder = one FLAT shape — small rounded tab (`.mf-tab`, `left: var(--tabX)`) on a full-width sheet (`.mf-body`, always visible, 100vh tall, runs below the fold). `layoutStack()` positions folders absolutely: newest in front (lowest, highest z), each behind peeks its top edge + tab above the one in front (~31–54px step, clamped to 72vh); tabs cycle staggered x-slots so every tab stays visible. **Back sheets stay clean** — `.ms-body-inner` is opacity-0 except on `.is-front` (folder 0) + `.is-open`. Click anywhere on a folder → whole sheet slides up to 12vh (`--rise`); others get `.is-receded` (`--duck` +36px, dim); tab of open folder closes it. **Sheets render LAZILY** (`ensureSheet()` — only front + opened; rendering all up front decodes every full-res proof image and janks the entrance over WebGL; codex stage imgs use `data-src` for the same reason). No `will-change` on folders (11 viewport-sized layers thrash GPU). Sheet content = `buildFolderSheet()` (`ms-*`: title, meta chips, tags, story, hero carousel, evidence-grid sidebar → lightbox). **CODEX** = indrajaal big-type list overlay (`.mf-codex`): drag/wheel/momentum, `elementFromPoint` stage hover, row click → opens that folder. **Motion rules:** JS writes only layout (top/z/`--tabX`/`--sheetW`) + motion props (`--enter`/`--rise`/`--duck`) consumed in CSS `calc()` transforms; opacity is CSS-owned via classes — no GSAP in this path. Entrance = staggered `--enter` 70vh→0 (back folders first). Camera: `terrain.makeSpaceForBody()` on first open, `restoreCamera()` on close + in `closeProjectPage` via `clusterCameraPushed`. Resize re-runs `layoutStack()` (self-removing listener via `drawer.isConnected`). Test harness: `test-folders.html` (no WebGL, mock entries, same logic inline; needs `folder-sheet` class on `#projectPage`). Debug: `ARCHIVE_APP_DEBUG.openCluster("Label",[ids])`. Cache ver `?v=manila-v4-05`.

**Historical folder overlay evolution — elastic pop → cinematic slide-up → physical tab movement (6 iterations since Pass d2; ALL superseded by manila v3, kept for context):**

1. **Pass d2 baseline:** Full-viewport transparent overlay + bubble-pop (elastic.out scale pop) + scene cleanup (plinth removed). `makeSpaceForCluster('right')` + `cameraImpulse()` per card. Dead drag controller purged.

2. **Cinematic slide-up:** Elastic pop → GSAP `yPercent: 100 → 0` slide-up (power3.out, 0.6s) + content stagger. `makeSpaceForBody()` added (radius×1.35, polar×0.88). Evidence fan-out cards with rotation hover.

3. **Tab font & sizing:** Tabs 14px→22px→**26px**, `gap:0`, `flex-wrap: wrap`, `white-space: normal`. Tab bar flex-wrap (min-h 40px / max-h 150px).

4. **Hover peek tooltip:** Fixed `.folder-tab-tooltip` replaces clipped CSS peek-bubble. GSAP fade-in/out. Being upgraded for evidence thumbnails.

5. **Duplicate heading removed:** `.folder-card-heading` purged. Card title styled as heading (26px, `—` prefix). Tab button fades to opacity 0 during card slide-up.

6. **Physical tab movement (current — WIP):** Tab DOM element physically moves from tab bar to card top via spacer + GSAP `position:fixed`. No duplicates, no hiding. Camera push upgraded: 1.55× radius, 0.82× polar, +3.5 y-target.

**New terrain API:** `makeSpaceForBody()` / `restoreCamera()` / `animateCameraTo()`. Camera state saved on activate, restored on minimize.

**Stack unchanged:** vanilla JS + ES modules + Three.js 0.164 (CDN import map) + GSAP. **No React.** No bundler. `node scripts/static-server.mjs` on `:4173`.

**Archive Mode is no longer a year×month grid.** The city is now a **pre-composed GLB** from Adobe Dimensions — `public/models/main city composition.glb`. Every building is named and mapped to either a single ledger entry or a **cluster** of related work.

**Story Mode is not built yet.** §6 of this file is the spec; treat as future work.

**Pass 11 (this rev) shipped — photography gallery + cinematic motion:**

- **Photography gallery** opened from the "Travel & Gallery" building (`openClusterPage` special-cases that label → `openGalleryOverlay`). Full-screen overlay with **GRID** (masonry) + **CODEX (LIST)** tabs, and a single-photo **artifact** view (split media/metadata with EXIF). Data in `data/gallery.json` (269 photos; EXIF pulled by `scripts/extract-exif.mjs` via `exifr`).
- **Titles + day/night via EXIF** (`scripts/enrich-gallery.mjs`): the photos aren't human-named, so titles are derived from capture time + date (e.g., "Morning, 1 Jul 2024"), plus `timeOfDay`/`dayNight`/`date` fields and a grounded `story`. MERGES into gallery.json (preserves optimized webp src/thumb); reads EXIF from the raw originals; matches on `basename(src)`, not id. Only 2/269 are GPS-tagged so `location` is mostly "Unknown".
- **CODEX is an indrajaal-style big-type list** (`initCodexScroller`): big type = `timeOfDay` (conveys day/night), meta line = `year · camera · location` — NO file names. `.codex-track` rendered TWICE for a seamless infinite loop; custom transform scroller with drag + wheel + momentum. A **centered `#codexStageImg`** bleeds behind the titles and swaps to the hovered photo. Hover is **real-time via `document.elementFromPoint` in the RAF tick** (not mouseenter/leave) so the active row + image update while the list scrolls under a stationary cursor. Drag (>6px) sets `codexJustDragged` to suppress the click. NOTE: never `setPointerCapture` on the scroller (it steals the row click → artifact won't open).
- **GRID has drag-to-scroll + momentum** (`initGridDrag`) on the native-scrolling `.gallery-viewport`; `gridJustDragged` suppresses the click after a drag.
- **Artifact = centered hero** (indrajaal): title left, image centered over an ambient blurred backdrop (`.artifact-bg`), story + camera/lens/exposure right. The single × (now a `←`) is the back button → returns to the gallery (one level); the gallery's own × exits. No separate back button.
- **Nav close paths are CSS-driven, never GSAP.** `closeGalleryOverlay`/`closeArtifactView` just remove `.visible` (CSS `transition: opacity` fades them) + clear transforms. Driving the close with `gsap.to(opacity:0, onComplete)` was the "back is broken" bug: a stalled opacity tween's onComplete never fired, stranding the overlay. Opacity is owned by CSS `.visible` everywhere; GSAP only does transforms.
- **Photos optimized** by `scripts/optimize-gallery.mjs` (sharp): raw 2.1GB originals (`public/proof/Gallery/`, **gitignored**) → `public/gallery/thumb/*.webp` (500px, grid/codex/floating preview) + `public/gallery/display/*.webp` (1600px, artifact). **67MB committed as plain git** (NOT LFS — Vercel doesn't serve LFS; webp are small enough to serve directly). `gallery.json` `src`→display, `thumb`→thumb. Re-run the optimizer if photos change (idempotent; matches on `basename(src)`, not id).
- **Motion layer (GSAP):** custom magnetic "VIEW" cursor (`initGalleryMotion`, lerped in one RAF loop); graceful scale-in gallery open; artifact entrance (centered hero scales up, side columns slide in, text staggers); ambient Ken Burns zoom + interactive parallax pan on the centered hero image. (The old cursor-trailing floating preview was replaced by the codex's centered stage image.)
- **GSAP safety rule (important):** animate **transform only, never opacity**, for reveal staggers — CSS `.visible` owns overlay opacity. GSAP opacity/clip-path tweens are unreliable in this app (see `tweenMatProp` note) and a stalled tween would leave the overlay see-through or the grid invisible. Worst case with transform-only: a few px offset.

**Pass 10 shipped — new city composition + cluster buildings:**

- **Full city composition from Adobe Dimensions.** The GLB contains 35 named buildings arranged as a skyline. Replaces the old procedural phyllotaxis cluster. Loaded via `GLTFLoader` into the existing `stagerCityGroup`, scaled and centred onto the plinth automatically. The old procedural prisms are hidden when the composition is active.
- **Two building types:** `STAGER_BUILDING_ENTRY` in `terrain.js` maps each building name to either a **number** (single entry id → click opens detail panel) or a **cluster object** `{ cluster: true, label, entryIds: [...] }` (click opens a new entry-list modal showing all projects in that building). Decorative nodes (Car, Trees, Contact) map to `null`.
- **Cluster list modal.** `openClusterPage()` in `app.js` renders a bordered entry list (brutalist editorial style matching the existing modal). Each row shows title, role, org, date, and tag pills. Clicking a row drills through to the single-entry detail view.
- **Smooth fade transitions.** Non-matching buildings fade to 8% opacity via `tweenMatProp` (600ms easeOutCubic) instead of being hidden — both for role-filter pills and the Year Window slider. Matching buildings fade back to full opacity on reset.
- **Material restyling preserved.** Glass/window materials → dark; single-material towers → light glass-gray; saturated materials → porcelain white. Same as Pass 08.
- **Picking updated.** Raycasts the composition meshes, walks up the scene graph to find the named parent node tagged with the entry/cluster id. Clusters return via `onSelectCluster` callback; single entries via the existing `onSelectEntry`.
- **Tooltip updated.** Cluster buildings show label + project count. Single entries show the existing date + title + tags format.
- **GLB compressed via `scripts/optimize-glb.mjs --preserve-structure`.** Raw Dimensions export is 1.5GB (818 meshes); the pipeline (texture 2K WebP + simplify 50% + **Draco** geometry) shrinks it to **41.6MB (2.9%)** while keeping every named node intact. `--preserve-structure` is mandatory — it skips flatten()+join(), which would otherwise fuse buildings and destroy the click→entry mapping. The city is ~97% geometry / ~4MB textures, so geometry decimation + Draco are the levers (not texture compression). `--draco` needs `draco3d` (devDep) at build + `DRACOLoader` at runtime (wired in terrain.js, decoder from gstatic CDN). Full cmd: `--size 2048 --simplify 0.5 --draco --preserve-structure`. Two files: raw `public/models/main city composition.glb` (gitignored source) → compressed `public/city/city.glb` (LFS-tracked, loaded locally + uploaded to Vercel Blob for prod via `scripts/upload-city-blob.mjs`).

**Pass 08–09 (still active):**

- **Studio-IBL rendering.** `front_key_rear_panels.exr` HDRI via `EXRLoader → PMREMGenerator → scene.environment`. One `DirectionalLight` for shadow maps. Tone mapping: ACES Filmic, exposure 0.88. `scene.environmentIntensity = 0.18`.
- **Camera anchored to Dimensions composition.** Spherical orbit defaults: radius 123.5, polar 0.516π, azimuth -0.001, target Y 8.3, FOV 10°.
- **Bright lime-green plinth** (`#C5E03A`) and unified `#0F0F0F` background+floor.
- **Role filter pills** — right-side vertical stack with hover preview. `tweenMatProp` fades non-matching buildings.
- **Lighting debug panel** at `?cam=1`.

Earlier passes (still active where relevant):

**Pass 05 (this rev) shipped — the sculptural cluster + Year Window:**
- **Cluster layout** replaces the year×month grid. `terrain.js` adds `clusterLayout()` (phyllotaxis golden-angle spiral) + `classifyTier()` (3 tiers: Milestone center → significant mid-ring → routine perimeter). Each tier gets a height multiplier (1.55× / 1.18× / 1.0×) so the cluster has a clear pyramid silhouette. `CLUSTER_MODE = true` is the new default; the old grid logic stays gated behind `if (!CLUSTER_MODE)` for reference.
- **Circular plinth** replaces the rectangular box (`CylinderGeometry`, radius derived from cluster radius + margin).
- **Road / sidewalks / curbs / lane markings / crosswalks / kiosks / sidewalk benches all gated off** in cluster mode — chronology-axis infrastructure makes no sense without an axis. Lamp posts repurposed as a 16-lamp ring around the plinth perimeter.
- **Vegetation re-targeted** at the cluster: bushes / flowers / hedges / pixel crop fields now lay out radially on + around the plinth.
- **Year + month labels hidden** in cluster mode (no axis to label).
- **Camera defaults** retuned for the circular plinth — radius `PLINTH_RADIUS × 5.0`, polar `0.32π` (top-down 3/4 isometric).
- **Year Window range slider** (two-handle) in the side panel, replacing the old Depth slider. State in `app.js` is `state.yearWindow = { start, end }`. Calls `terrain.applyYearWindow(start, end)` on drag.
- **`applyYearWindow()`** walks each prism, traverses ALL child materials (body + podium + cornice + setback + spire), GSAP-tweens opacity to 0.10 + scale to 0.88 + emissive to 0 for out-of-window entries. `scheduleRender` fires on every tween tick.
- **Per-prism `year` metadata** stored on the prism for the filter to read.

**Pass 05 deferred (will layer on top of the cluster baseline):**
- Signage / LED boards on hero entries with brand-color emission (Anirudh to supply mockup geometry)
- Drones hovering in loops above the cluster
- Window-light flickering
- Video textures on LED screens
- Plant breeze animation (vertex shader sway)
- Film grain + handheld micro-shake postprocess
- Day / night mode toggle
- GSAP ScrollTrigger camera zoom-through

**Pass 04 shipped — the editor (still active in cluster mode):**
- **JSON is canonical now, not xlsx.** Run `node scripts/xlsx-to-json.mjs` once to migrate `data/anirudh-ledger-v4.xlsx → data/ledger.json`. The app reads JSON from then on. xlsx becomes archival.
- **Backend API.** `scripts/static-server.mjs` now exposes `GET /api/ledger`, `PUT /api/entries/:id`, `POST /api/entries`, `DELETE /api/entries/:id`, `POST /api/upload?entryId=N&filename=foo.jpg`. Binds to 127.0.0.1, no auth (local dev only). Writes back to `data/ledger.json`.
- **Editor mode (`?edit=1`).** Brutalist side modal grows EDIT/SAVE/CANCEL controls; every metadata field becomes an input/textarea, plus a media block with image/video upload + YouTube URL. Saves PUT to API and reload data in place.

**Pass 03 (now superseded by cluster):** procedural-facade skyscrapers in a year×month grid, glowing emissive road network, brutalist editorial side modal, tilt-shift miniature look. The shader-painted-window facade + side modal + per-prism architecture all survived into Pass 05 — only the chronological grid LAYOUT was replaced.

**Pass 02 / Pass 01:** historical context only — see `design.md` §0.

**Story Mode is not built yet.** §6 of this file is the spec; treat as future work (Pass 04+).

**Pass 04 (this rev) shipped — the editor:**
- **JSON is canonical now, not xlsx.** Run `node scripts/xlsx-to-json.mjs` once to migrate `data/anirudh-ledger-v4.xlsx → data/ledger.json`. The app reads JSON from then on. xlsx becomes archival.
- **Backend API.** `scripts/static-server.mjs` now exposes `GET /api/ledger`, `PUT /api/entries/:id`, `POST /api/entries`, `DELETE /api/entries/:id`, `POST /api/upload?entryId=N&filename=foo.jpg`. Binds to 127.0.0.1, no auth (local dev only). Writes back to `data/ledger.json`.
- **Editor mode (`?edit=1`).** Brutalist side modal grows EDIT/SAVE/CANCEL controls; every metadata field becomes an input/textarea, plus a media block with image/video upload + YouTube URL. Saves PUT to API and reload data in place.
- **Media schema.** Each entry has `evidence: Array<{ type: 'image'|'video'|'youtube', src?, url?, caption? }>`. Uploads land in `public/proof/<entryId>/` and are committed to git.
- **Nav tabs simplified.** Firsts + Throughlines removed. Added **Clients** alongside Roles. Both are now brutalist editorial **master pages** (typography.md + Layout & Grid System.md): massive uppercase display title, dense bordered group rows, click to expand to entry list, EDIT button per entry, ADD NEW MOMENT button in edit mode (POSTs to `/api/entries` and opens the editor on the new id).
- **2D view fixed.** Was 53-week × 18-year grid; now **calendar layout** — years as rows, 12 months as columns, matching the LOD-locked 3D scene.
- **Selection sync.** 2D cell activation keyed by `${year}-${month}` instead of weekKey.

**Pass 03 shipped:**
- **LOD locked to MONTH** — one building per month (no week/day rebuild during zoom). Weekly/daily drilldown lives inside the modal.
- **Compound buildings** — every month gets a podium + body + optional setback + optional spire. Footprint archetype (tower / wide / rectangle / square) chosen from dominant role + signals. Log-scaled height so silhouettes hold dramatic contrast.
- **Procedural window facade** — `MeshStandardMaterial.onBeforeCompile` injects a window-pattern shader. 5 role variants: Photography (sparse irregular), Design (dense regular grid), AV (vertical cinema strips), Branding (wide spaced + spire), IT (uniform tight grid). Per-building hash → unique variation. Lighting + shadows + env map intact.
- **Island environment** — outer floor darkened to read as void, lighter shore ring hugs the plinth, plinth itself sized up. Emissive cream/gold spine + cross-roads glow under bloom.
- **Brutalist side modal** — replaces the Pass 02 bottom drawer. Right ~67% of viewport, slams in (translateX 280ms ease-out, hard `-8px 0` box-shadow on left edge). Split into black ledger sidebar (uppercase mono metadata per `typography.md` + `Layout & Grid System.md`) and paper-cream mainboard (display title 8–12vw, ultra-bold uppercase, hard 2px borders, underlined section heads).
- **Camera offset for modal** — focused building lands in the left third of the viewport (camTarget shifts +X by `focusRadius × 0.14`) so it sits cleanly alongside the modal.
- Bloom retuned: threshold raised, strength lowered. Only emissive windows + roads bloom, not the whole bright environment.

**Pass 02** had: saturated frosted glass per role, slowed telephoto camera, tilt-shift post-pass, straight timeline spine + era cross-roads, 4-archetype tree variety with berries, building archetype variation. *Pass 02 buildings have since been replaced by Pass 03's procedural-facade skyscrapers — the glass-prism look is gone.*

**New design docs (Anirudh added before this pass):**
- `typography.md` — brutalist editorial type hierarchy (display ultra-bold uppercase, mono metadata, underlined sub-heads).
- `Layout & Grid System.md` — split-screen ledger pattern, visible-grid borders, no border-radius, snap-in transitions with hard shadows.

Both are honored by the Pass 03 modal. Touch them before changing any modal styling.

---

## 1. Project identity

**Cinematic personal portfolio web app for Anirudh Venkatesan ("Pixel Explorer").**

A two-mode narrative experience:
- **Story Mode** (`/`) — directed, scroll-locked cinematic film of his life 1991 → 2026. *Spec only; not built yet.*
- **Archive Mode** (everything else) — **sculptural 3D cluster of buildings on a circular plinth**, filterable by role + Year Window slider. *Built (Pass 05).*

Roles = building tint + facade pattern. Importance = central position + height. Time = a window the user drags through the cluster. Treat the cluster as **a living model of him**, not a chronological map.

---

## 2. The person

| Field | Value |
|---|---|
| Name | Anirudh Venkatesan |
| Alias | Pixel Explorer |
| Born | 23 Sep 1991, Khambhat, Gujarat (Tamil-Brahmin family already in Gujarat — **NOT Tamil Nadu**) |
| Raised | Anand, Gujarat |
| Based | Pondicherry (since late 2024) |
| Languages | English, Hindi, Tamil, Gujarati |
| Email | `1991anirudh@gmail.com` / `admin@pixelhaus.in` |
| Web | `pixelhaus.in` |
| Company | Haus of Pixels OPC Pvt Ltd · CIN `U72900GJ2022OPC131119` (registered Apr 2022, Anand) |
| Self-description | "15+ job roles played." Artist · Filmmaker · Cinematographer · Photographer · Designer · Founder · Researcher · Blockchain Expert · Computational Photography Expert |
| Status (May 2026) | Just laid off from Rabble Labs. Hunting next consulting role. Has a dog. |

---

## 3. North star

**Land the next consulting role before end of May 2026.**
The site is the pitch. Recruiters and businesses must see, in under 60 seconds, that hiring him = hiring a one-person studio across design / film / photo / web3 / animation / strategy.

**Hard deadline:** ~2 weeks from this writing (15 May → 31 May 2026).

---

## 4. Audience

| Tier | Audience | What they want |
|---|---|---|
| Primary | Recruiters + businesses hiring for design / film / consulting | Fast proof of breadth + depth. Skim, verify, contact. |
| Secondary | Peers, internet, fellow creatives | Story, craft, personality. Slow burn. |

**Implication:** Archive Mode is the deal-closer; Story Mode is the seduction. Story Mode must have a visible "Skip film → archive" exit at all times.

**Sell the pitch:** "Hire one operator. Get a studio's output across the creative spectrum."
Lead with film / ads / corporate / documentary work — that's where he has the most volume.

---

## 5. Site architecture

```
/                          → Story Mode (front door, cinematic)
/archive                   → Archive landing (already built in v1)
/firsts                    → Firsts ledger (41 milestones)
/roles                     → Roles index (27 roles, filterable)
/throughlines              → Cross-cutting relationship arcs
/ledger                    → Year-by-year master timeline
/now                       → Current availability + contact (consulting pitch surface)
```

**Persistent UI:**
- Mode toggle top-right (Story ↔ Archive) — never lose user position.
- Year ticker top-left (fixed in Story Mode, scrubs as user scrolls).
- "Skip film → archive" link bottom-right of Story Mode.

---

## 6. Story Mode — 11 scenes, one per era

Each scene = pinned background + 3-act content rail (hook line → context → proof artifact). ~3–6 viewports of scroll per scene.

| # | Era | Anchor visual | Hook line | Proof reveal |
|---|---|---|---|---|
| 01 | 1991 Khambhat | Map zoom Gujarat → Khambhat, sun flare | "Born in light." | Birth year, family note |
| 02 | 2009–2013 SEMCOM + AIESEC | Campus → OGX poster Nov 2010 | "First commercial pixel: November 2010." | Poster, LCP appointment letter |
| 03 | 2013–2014 NID drift | Empty Anand street, rejection slip | "The year that didn't take." | Pep & Joss film, Schoogle exit email |
| 04 | 2015 Chhello Divas | Film slate, view counter ticking to 539K | "One reference. One month. One movie." | YT clips, BTS stills |
| 05 | 2016–2018 Pondi + Tarikshir | Pondicherry sea, book cover unfurls | "First stamp: Dubai." | Tarikshir book, Hive posts, Displate prints |
| 06 | 2018–2021 Pixelate genesis | NEAR logo + hackathon trophy | "$15K, deposited Oct 14 — eleven years to the day." | Cert, grant doc, NEAR blog post |
| 07 | 2022 Haus of Pixels OPC | Studio render | "I gave the practice a building." | MCA filing, CIN U72900GJ2022OPC131119 |
| 08 | 2024 cliff | Calendar shredding Jul 25 → Aug 28 | "Six applications in one day." | Pixelate close email, Auroville accept emails |
| 09 | 2024–2026 Rabble | Karan's Nov 2 2021 DM → Sep 17 2024 offer | "Three years from message to job." | Trial offer, permanent offer, layoff |
| 10 | 2025 Shivanata | Buddy Tales frames, 72-day counter | "Born and shelved in seventy-two days." | Hire date → close date |
| 11 | 2026 May (now) | Empty desk, blinking cursor | "Open to consult." | CV, contact form |

---

## 7. Reusable primitives (build 5, use 11+ times)

| Primitive | Spec | Notes |
|---|---|---|
| `PinnedScene` | Sticky 300vh container; GSAP ScrollTrigger pin | Wrap every scene |
| `HookLine` | Kinetic type. Mask / kern / reveal on scroll progress 0 → 1 | One per scene |
| `ProofCard` | Artifact tile. Slides in at progress > 0.6 | Image, PDF, email screenshot, video frame |
| `YearTicker` | Fixed top-right. Scrubs era + year as user scrolls | One global instance |
| `Letterbox` | Top/bottom bars close on scene boundary | Cinematic punctuation |

---

## 8. Stack (as actually committed)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **None — vanilla JS + ES modules** | Confirmed. Do not propose React. |
| Bundler | **None** | Browser loads `app.js` + `terrain.js` as native modules via import map in `index.html`. |
| 3D | **Three.js 0.164** (CDN import map) | Used for the entire Archive view (city, prisms, vegetation, photons, tilt-shift). |
| Three addons | RoomEnvironment, EffectComposer (RenderPass + UnrealBloomPass + custom ShaderPass for tilt-shift), RoundedBoxGeometry | All from `three/examples/jsm`. |
| Animation | **GSAP 3.12** (CDN script tag) | Camera timelines, billboard anchor reveals, UI transitions. |
| Smooth scroll | **Not yet — deferred to Story Mode** | Lenis will join when Story Mode lands. |
| Server | `node scripts/static-server.mjs` on `:4173` | Plain static; no live-reload, hard-refresh required. |
| Data | `data/ledger-data.js` committed, generated from `data/anirudh-ledger-v4.xlsx` via `scripts/export-ledger.ps1` | Treat the xlsx as upstream; don't edit programmatically. |
| Asset gen | **Higgsfield + Freepik** (Anirudh's hands) | For Story Mode era plates when that lands. |

**Stack rules:**
- No React migration. Period.
- No CMS. Data is the xlsx → exported JS.
- Mobile must work but desktop-cinematic is the showcase.

---

## 9. Data — single source of truth

| File | Purpose |
|---|---|
| `/content/ledger.md` | The 954-line chronological ledger. Master narrative source. |
| `/data/eras.json` | 11 era objects (id, years, title, signal, summary). |
| `/data/events.json` | All ~110+ events from MASTER sheet. Schema below. |
| `/data/people.json` | 22 bridge people + arcs. |
| `/data/firsts.json` | 41 first-ever milestones. |
| `/data/throughlines.json` | 8 cross-cutting relationship arcs. |
| `/public/proof/` | Image/PDF/video proof artifacts. |
| `anirudh-ledger-workbook.xlsx` | Source spreadsheet (v3 currently; v4 in progress). Treat as upstream — never edit programmatically. |

### Field contract — which ledger fields are PUBLIC (rev 2026-07-27)

Read this before wiring any entry field into a view. Getting it wrong ships
Anirudh's private research trail to recruiters.

| Field | Public? | Notes |
|---|---|---|
| `title` `description` `role` `org` `location` `year`/`month`/`day` `tags` `roles` `evidence` | **YES** | The public record. `description` is the canonical prose for every entry — all 88 have one. |
| `evidenceSource` `evidenceDetail` | **NO — never render** | Research provenance: raw Gmail thread ids (`Thread 12babe13140de173`), `User-confirmed May 2026`, and `Inferred` (which advertises a fact as guesswork). Kept in data for Anirudh's own verification, editable via `?edit=1`. |
| `notes` | **NO — never render** | Working field. 21 internal notes (`CORRECTED: …`, `CRITICAL gap-fill`, `Sparse Gmail trail`) were deleted from the data 2026-07-27, plus 52 dead `"notes": ""` keys. The 15 that remain are genuine project detail (`Deliverables: … Key Challenge: …`), but 13 of those sit on entries that take the gallery render path where `notes` has never displayed. **If that copy should be public, promote it into `description` — do not re-enable a `notes` render.** |
| `identityTag` `status` `activityType` `weekKey` `clientGroup` | internal | Filtering/grouping metadata, not display copy. |

`notes` and `evidenceSource`/`evidenceDetail` are still read for keyword
matching (GenAI-tool and contact detection, search haystack). That is fine —
those match against the text and never display it.

### Schema (TypeScript)

```ts
type Era = {
  id: string;              // "08-cliff-2024"
  years: [number, number];
  title: string;
  signal: 'low' | 'mid' | 'high' | 'peak';
  summary: string;
  scene_number: number;    // 1-11
};

type Event = {
  id: string;
  date: string;            // ISO or "2024-Q2" or "2014" if year only
  title: string;
  era_id: string;
  roles: Role[];
  category: 'creative'|'design'|'photo'|'film'|'web3'|'startup'|
            'consulting'|'tech'|'paid'|'personal'|'education'|'volunteer';
  significance: 'first'|'turning-point'|'earning'|'grant'|'shift'|
                'project'|'milestone'|'collaboration';
  description: string;
  evidence: Evidence[];
  tentative?: boolean;     // memory-based, not document-backed
};

type Evidence = {
  type: 'image'|'pdf'|'video'|'url'|'email'|'screenshot';
  src: string;
  caption?: string;
};

type Role = 'designer'|'photographer'|'cinematographer'|'filmmaker'|
            'founder'|'consultant'|'researcher'|'faculty'|'marketer'|
            'animator'|'engineer'|'art-director'|'producer';
```

---

## 10. Anchor moments (these MUST land)

The narrative pivots on these dates. If a scene drops one, the scene is broken.

1. **23 Sep 1991** — Born, Khambhat, Gujarat.
2. **14 Oct 2010** — AIESEC induction. Day his structured public life begins.
3. **Nov 2010** — First commercial design: OGX Fair posters with Kunal Shah. *Predates "Pixel Explorer" alias by 5 years.*
4. **31 May 2012** — Elected Local Committee Coordinator (LCP-equivalent), AIESEC Vidyanagar.
5. **20 Nov 2015** — Chhello Divas releases. Asst Cinematographer + Unit Stills + BTS. ~539K combined YT views.
6. **Oct 2017** — Wins 54hr blockchain hackathon.
7. **Aug–Oct 2018** — Designs Tarikshir cover. Attends Dubai launch — first international travel.
8. **14 Oct 2021** — $15K NEAR Fast Grant deposited. **Exactly 11 years to the day after AIESEC induction.** Use this echo.
9. **Apr 2022** — Haus of Pixels OPC Pvt Ltd registered.
10. **25 Jul 2024** — Pixelate ends.
11. **28 Aug 2024** — Applies to 6 Auroville volunteer roles in one day. Two accepted same week.
12. **17 Sep 2024** — Rabble Labs offer. *Karan Aneja's first DM was 2 Nov 2021 — three-year incubation.*
13. **13 Oct 2025** — First time signs offer letters as employer (Shivanata animators).
14. **24 Dec 2025** — Shivanata shutdown. 72 days from first hire.
15. **May 2026** — Laid off from Rabble. *Site lives here.*

---

## 11. Cross-cutting threads (use in `/throughlines`)

Named arcs across years. These differentiate the site from a flat résumé.

| Thread | Arc | Years |
|---|---|---|
| Hardik Darji | AIESEC OC volunteer → Dubai book printer | 12 yrs (2012 → 2024) |
| Savan Barot | First contact → Shivanata co-founder | 11 yrs (2015 → 2025) |
| Khayaal Patel | Tarikshir → 3-book trilogy designer | 5+ yrs |
| Karan Aneja | NEAR DM → Rabble hire | 3 yrs (2021 → 2024) |
| Mitra Gadhvi | Chhello Divas lead actor → friend | 11+ yrs |
| Ronak Amin | Pixelate co-founder | 9+ yrs |
| SEMCOM | Student → Visiting Faculty (since 2016) | 17+ yrs |
| Anand (the town) | Born nearby → school → college → faculty → company HQ | 35 yrs |

---

## 12. Voice rules

**DO:**
- Specific dates over vague months. "14 Oct 2010" not "October 2010."
- Real artifacts over polished mockups. Show the actual Gmail screenshot.
- One-sentence hooks. Each scene gets ONE hook line. Nothing more.
- Numbers. "539K views" / "$15K grant" / "72 days" / "6 applications in one day."
- His own words where possible (from emails, posts, the original portfolio PDF).

**DON'T:**
- Generic portfolio language ("passionate," "creative," "innovative").
- Motivational filler.
- Stock photography. Every visual is either his or AI-generated to spec.
- Filling gaps by inventing. If evidence is missing, mark tentative or omit.
- Long paragraphs in Story Mode. Story Mode is image-led; copy is sparse.

---

## 13. Visual reference — what "cinematic" means here

Pattern language pulled from the inspo set Anirudh shared ([@shrshhez](https://x.com/shrshhez), [Artycoders](https://artycoders.com/), [@exploraX\_](https://x.com/exploraX_), Nidhi Singh, [Oluwaphilemon](https://x.com/Oluwaphilemon1)):

| Device | Function |
|---|---|
| Pinned hero + scroll-locked chapters | Fixed stage, content moves through |
| Type-as-protagonist | Headlines kern / mask / reveal on scroll progress |
| Image curtain reveals | Splits, wipes, slides between scenes |
| Year-as-scrubber | Numeric anchor doubles as timeline cursor |
| Cursor-as-spotlight / magnetic UI | Micro-signal that the surface is alive |
| Letterbox + audio sting on chapter change | Cinematic punctuation |

**Anti-patterns:** Parallax for parallax's sake. Bouncy spring animations. Gradient text. Glassmorphism. Emoji.

---

## 14. Non-negotiables

1. **Don't break the v1 archive.** It works (partially). Read it before touching it.
2. **Evidence-backed only.** Every fact in the site has a proof artifact in `/public/proof/` or a tentative flag.
3. **Anirudh writes the prompts; Claude Code writes the code.** Don't generate copy unless asked.
4. **Token-frugal.** Anirudh is rationing across Codex / Claude Code / others. Don't propose rebuilds. Don't regenerate working files. Ask before destructive ops.
5. **Mobile parity is required, but the showcase is desktop.** Don't over-optimize for mobile at desktop's expense.
6. **No login, no analytics, no popups, no cookie banner** unless legally required.

---

## 15. Open questions — ASK before assuming

| Q | Status |
|---|---|
| ~~Is the archive in React, vanilla JS, or something else?~~ | **Resolved:** vanilla JS + Three.js + GSAP. See §8. |
| Story Mode fork: pure vertical pinned (A) vs horizontal era rail (B) vs hybrid (C)? | Tentatively A (recruiter-safe, 3-week build). Confirm before starting Pass 03. |
| Audio in Story Mode — yes/no? Ambient score per era? | Unconfirmed. |
| Three.js scope in Story Mode — Scene 01 globe only, or more scenes? | Default to Scene 01 only. Expand only if requested. |
| Mobile design philosophy — same scenes condensed, or different IA? | Unconfirmed. Default to same scenes condensed. |
| Final domain — pixelhaus.in or new domain? | Unconfirmed. |
| Contact mechanism — form, email link, Calendly, all three? | Unconfirmed. |
| Tilt-shift band-center default 0.58 — should this shift per zoom level? | Open. Currently static; might want LOD-driven later. |

---

## 16. File map (actual repo state)

```
/
├── CLAUDE.md                          ← this file (Claude Code memory)
├── AGENTS.md                          ← Codex memory (twin of this)
├── README.md                          ← human-facing project overview
├── design.md                          ← visual/motion direction (form, not content)
├── index.html                         ← single entry point
├── app.js                             ← UI, state, filters, detail panel, cluster list, nav overlays
├── terrain.js                         ← all Three.js: scene, GLB city loader, picking, camera
├── styles.css                         ← daylit palette in r02 override block at the bottom
├── firsts.html, roles.html, throughlines.html   ← legacy stubs (nav overlays handled in JS now)
├── package.json
├── /public/city/
│   └── city.glb                       ← compressed 43.6MB city (PLAIN git, no LFS), served same-origin in every env
├── /data/
│   ├── anirudh-ledger-v4.xlsx         ← upstream master spreadsheet
│   ├── ledger-data.js                 ← exported JS module loaded by index.html
│   └── ledger-data-static.js          ← fallback if the above fails
└── /scripts/
    ├── export-ledger.ps1              ← xlsx → ledger-data.js
    ├── optimize-glb.mjs               ← raw GLB → compressed (texture/meshopt; use --preserve-structure)
    ├── blob-upload-optimized.mjs      ← bin/blob-opt/** → Blob proof/** (needs BLOB_READ_WRITE_TOKEN; PENDING store un-suspension)
    └── static-server.mjs              ← local dev server on :4173
```

Story-Mode-specific paths (`/content/scenes/`, `/src/components/`, `/public/proof/`) are **planned but not yet created.** Don't reference them as if they exist.

---

## 17. Session start checklist for Claude Code

When opened in a new session, before doing anything:

1. Read this file (`CLAUDE.md`) — auto-loaded.
2. Read `README.md` for the operational overview (how to run, what each file does).
3. Read `design.md` if touching anything visual — it governs form.
4. If touching the 3D scene: read `terrain.js` top-to-bottom before editing. Material constants live at the top; the LOD switch in `ensureLOD()` rebuilds prisms when zoom thresholds cross.
5. If touching UI: read `app.js` — state lives in `state` object, mutations go through filter functions.
6. If a fact about Anirudh isn't in `data/ledger-data.js` or in design.md, **ask** — never invent.
7. Before destructive changes (deleting components, rewriting modules), confirm with Anirudh. Token frugality matters.

---

## 18. Quick reference: where the heaviest narrative weight sits

| Era | Weight | Why |
|---|---|---|
| 1991 (birth) | High | The opening shot. Sets cinematic tone. |
| Oct 2010 (AIESEC) | Critical | Origin of structured creative life. |
| 2015 (Chhello Divas) | Critical | Most-viewed work. Recruiter-visible. |
| 2018 (Tarikshir Dubai) | High | First international, first published. |
| 14 Oct 2021 (NEAR grant) | Critical | The 11-year echo. Pure narrative gold. |
| Aug 2024 (cliff + pivot) | Critical | The human moment. Real, vulnerable, decisive. |
| May 2026 (now) | Critical | The CTA. Where consulting happens. |

Eras 03 (NID drift) and 10 (Shivanata) are valuable but lower-weight. Compress on mobile if needed.

---

---

## 19. Study material & design references

Key references used for visual direction and interaction pattern language:

| Reference | URL | What it informed |
|---|---|---|
| @shrshhez (Shrushti) | <https://x.com/shrshhez> | Daily design/motion/3D inspiration feed |
| Artycoders | <https://artycoders.com/> | Cinematic web design + brand-elevation visuals |
| @exploraX_ | <https://x.com/exploraX_> | AI + design content curation |
| Nidhi Singh | Design inspo — portfolio UX patterns |
| Oluwaphilemon | <https://x.com/Oluwaphilemon1> | Portfolio construction + agency-level design patterns |
| Indrajaal | Inline codex pattern in Gallery | Infinite big-type scroll-list (codex view) |
| Nicola Romei | Inline gallery cursor | Magnetic cursor + floating preview pattern |
| Three.js examples | <https://threejs.org/examples/> | GLB city loading, DRACOLoader, EXRLoader, PMREMGenerator, Reflector, EffectComposer |
| GSAP docs | <https://gsap.com/docs/> | All camera choreography, card slide-ups, stagger animations |
| Adobe Dimensions | — | Main city composition (35-building GLB) |
| sharp | <https://sharp.pixelplumbing.com/> | Gallery photo optimization (raw → webp) |
| exifr | <https://github.com/MikeKovarik/exifr> | EXIF extraction for gallery titles/dates |

*Last updated: 9 Jun 2026.*
*Maintained by Anirudh + Claude. Update this file when project state changes — don't rely on chat memory.*
