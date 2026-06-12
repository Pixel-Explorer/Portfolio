# OC CODEMAP — where everything lives (Manila v2)

> Read this before touching code. Line numbers are approximate (current build
> `manila-stack-d17`). Search by symbol if drifted.

## app.js

| Symbol | ~Line | Notes |
|---|---|---|
| `window.ARCHIVE_APP_DEBUG.openCluster(label, entryIds)` | 5 | Debug hook — drives cluster open without raycasting. **Keep it.** |
| `state` object | ~27 | `state.modalView` = `'cluster' \| 'entry' \| null`; `state.clusterContext` = `{label,entryIds}` for ← back; `state.editMode`. |
| projectPageClose handler | ~521 | × / ← logic. modalView 'entry' + clusterContext → reopen cluster; else close + reset camera. **Reuse for codex→artifact→codex.** |
| Escape handler | ~575 | Closes artifact → gallery → projectPage → navPage in order. |
| `openProjectPage(entry)` | ~617 | **Single-entry artifact view.** Renders `.folder-tab`+`.folder-body` with hero media carousel, meta chips, evidence, related, prev/next. **Reuse this from CODEX row-click.** Sets `state.modalView='entry'`. Don't rewrite. |
| `openClusterPage(clusterInfo)` | ~823 | **REWRITE THIS.** Currently: manila pile of full-width cards w/ Win98 max/min. Replace with v2 drawer. Keeps: gallery special-case (`label==="Travel & Gallery"` → `openGalleryOverlay()`), `closeProjectPage()` first, clusterEntries sort, masterBucket calc. |
| `buildClusterCardContent(entry)` | ~987 | Returns folder body HTML (meta + evidence fan + notes). **Extend** to full artifact body (port hero/chips from openProjectPage), or factor a shared `buildArtifactBody(entry)`. |
| `refreshProjectBack()` | ~1699 | Sets × vs ← glyph from modalView+clusterContext. |
| `closeProjectPage()` | ~1712 | Removes `.visible`, clears clusterContext/modalView. CSS fades it. |
| `openLightbox(src, caption)` | ~1731 | Evidence image lightbox. |
| Gallery / CODEX engine | ~1188+ | `galleryData`, `galleryContext`, `initCodexScroller`, `initGridDrag`, `openGalleryOverlay`, `switchGalleryTab`, `closeGalleryOverlay`. **The indrajaal codex lives here.** For cluster CODEX mode, build a codex over the cluster's entries (not the 269 photos). `galleryContext` already supports `{mode:"cluster", clusterInfo, items, label}` per the comment — wire it. |
| `selectEntry(id, opts)` | ~2801 | Selects/zooms a building + opens its entry. Sets clusterContext when drilling from a cluster. |
| `findBucketForTags(tags)` | search | Maps tags→role bucket `{key,label,color,modalBg,ink}`. Drives `--fill`/`--ink`. |
| `escapeHtml`, `formatDate`, `extractYouTubeId`, `renderEvidenceReadOnly` | search | Helpers for body content. |
| terrain API | terrain.js | `terrain.makeSpaceForBody()` (push city aside on open), `terrain.restoreCamera()` (on close), `terrain.resetView()`, `terrain.selectEntry(id,opts)`, `setCityFocus`. Call makeSpaceForBody on first folder open, restoreCamera on cluster close. |

## index.html

- `#projectPage` (line ~202): `.project-back`, `.project-page-close` (× / ←), `.project-page-inner` (#projectPageInner — innerHTML gets the drawer). The × and ← live OUTSIDE inner, styled by `.folder-sheet .project-page-close`.
- Cache query at lines 13 (styles.css) + 295 (app.js): bump to `?v=manila-v2-01`.
- Gallery overlay markup (`#galleryOverlay`, codex track, `#codexStageImg`) exists — reuse for cluster codex or clone a scoped instance.

## styles.css

- `.project-page.folder-sheet` (~4994): full-viewport transparent overlay; `.visible` owns opacity (transition 0.36s). Inner is `position:absolute; inset:0`.
- `.folder-sheet .project-page-close` (~5044): the × (fixed top-right, z70). **Bump z or keep deck below it** (current deck uses `isolation:isolate; z-index:1`).
- **Folder block to REPLACE: line ~5503 → EOF.** Currently `.folder-deck`/`.folder-stack`/`.folder-card`/`.folder-card-tab`/`.folder-card-content`/`.folder-card-body`/`.fcw-*`/`.folder-peek-tip`/mobile/theme-glass. Replace wholesale with v2.
- Single-entry styles `.folder-tab` / `.folder-body` / `.folder-peek` / `.folder-hero` / `.folder-chip` (~5117–5300) — **used by openProjectPage; do NOT remove.**
- `body.project-open` hide rule (~505 + dup ~2658): hides `.topnav/.filter-bar/.timeline-bar/.sidepanel/...` while overlay open. Keep.
- `body.theme-glass` = cream chrome variant. Provide overrides for new classes.

## GSAP safety rule (critical — from CLAUDE.md)

Animate **transform only, never opacity** on overlay-level elements. CSS
`.visible`/`.is-open` owns opacity via transitions. A stalled GSAP opacity tween
strands the overlay see-through (this caused the gallery "back is broken" bug).
GSAP may tween a custom property (e.g. `--rise`, `--enter`) that a CSS transform
`calc()` consumes — that's safe and avoids clobbering compound transforms.

## Data shape (entry)

`{ id, title, year, month, role, org, location, description|notes,
   tags[], roleTags[], evidence:[{type:'image'|'video'|'youtube', src?, url?, caption?}] }`

## Cluster map (terrain.js STAGER_BUILDING_ENTRY)

`Haus of Pixels`=[76,77,78,79,81,82,83,85,92,103,127]; `Movies & Film`=[42,46,121,122,84,65,86,20];
`Pixelate`=[53,54,57,59,71,74,97]; `Blockchain & Web3`=[59,57,71,74]; etc.
`Travel & Gallery`=[56] → routes to the full photo gallery, not folders.
