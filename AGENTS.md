# AGENTS.md

> Persistent project memory for Codex. Auto-loaded at session start.
> Keep this under 400 lines. Anything that bloats it costs context every session.

---

## 0a. Code knowledge graph (graphify) — consult BEFORE scanning files

`graphify-out/` holds a pre-built knowledge graph of this repo (994 nodes · 1199 edges · 77 named communities). Orienting from it is cheaper than re-grepping the codebase:

- `graphify-out/GRAPH_REPORT.md` — community map, god nodes (`BeatBuildings`, `StoryEngine`, `AudioManager`, `StoryUI`, `Orb`…), surprising cross-file connections. **Read this first when orienting on unfamiliar code.**
- Terminal queries against `graphify-out/graph.json`: `graphify explain "X"`, `graphify path "A" "B"`. CLI lives at `C:\Users\Anirudh\AppData\Local\Python\pythoncore-3.14-64\Scripts\graphify.exe` (not on PATH).
- **After code changes:** run `graphify update .` — pure tree-sitter rebuild, zero LLM/API cost. Curated community names persist in `graphify-out/.graphify_labels.json`; don't regenerate them.

---

## 0. Where we are (rev 2026-06-09)

**Folder overlay evolution — elastic pop → cinematic slide-up → physical tab movement (6 iterations since Pass d2):**

1. **Pass d2 baseline:** Full-viewport transparent overlay + bubble-pop (elastic.out scale pop) + scene cleanup (plinth removed). `makeSpaceForCluster('right')` + `cameraImpulse()` per card. Dead drag controller purged.

2. **Cinematic slide-up:** Elastic pop → GSAP `yPercent: 100 → 0` slide-up (power3.out, 0.6s) + content stagger. `makeSpaceForBody()` added (radius×1.35, polar×0.88). Evidence fan-out cards with rotation hover.

3. **Tab font & sizing:** Tabs 14px→22px→**26px**, `gap:0`, `flex-wrap: wrap`, `white-space: normal`. Tab bar flex-wrap (min-h 40px / max-h 150px).

4. **Hover peek tooltip:** Fixed `.folder-tab-tooltip` replaces clipped CSS peek-bubble. GSAP fade-in/out. Being upgraded for evidence thumbnails.

5. **Duplicate heading removed:** `.folder-card-heading` purged. Card title styled as heading (26px, `—` prefix). Tab button fades to opacity 0 during card slide-up.

6. **Physical tab movement (current — WIP):** Tab DOM element physically moves from tab bar to card top via spacer + GSAP `position:fixed`. No duplicates, no hiding. Camera push upgraded: 1.55× radius, 0.82× polar, +3.5 y-target.

**New terrain API:** `makeSpaceForBody()` / `restoreCamera()` / `animateCameraTo()`. Camera state saved on activate, restored on minimize.

**Stack unchanged:** vanilla JS + ES modules + Three.js 0.164 (CDN import map) + GSAP. **No React.** No bundler. `node scripts/static-server.mjs` on `:4173`.

**Archive Mode is now a pre-composed city GLB** from Adobe Dimensions — `public/models/main city composition.glb`. Every building is named and mapped to either a single ledger entry or a **cluster** of related work. The old procedural phyllotaxis cluster is hidden when the composition is active.

**Story Mode is not built yet.**

**Pass 11 (this rev) shipped — photography gallery + cinematic motion:**

- **Gallery** opens from the "Travel & Gallery" building (`openClusterPage` special-cases that label → `openGalleryOverlay`). Full-screen overlay: GRID (masonry) + CODEX (LIST) tabs + single-photo artifact view (split media/metadata + EXIF). Data: `data/gallery.json` (269 photos; EXIF via `scripts/extract-exif.mjs` + `exifr`).
- **Photos optimized** by `scripts/optimize-gallery.mjs` (sharp): raw 2.1GB (`public/proof/Gallery/`, gitignored) → `public/gallery/thumb/*.webp` (500px) + `public/gallery/display/*.webp` (1600px). **67MB committed as PLAIN GIT, not LFS** (Vercel doesn't serve LFS — same lesson as city.glb; webp are small enough to serve directly + deploy automatically). gallery.json `src`→display, `thumb`→thumb. Optimizer matches on `basename(src)`, not id (ids are normalized/underscore-stripped); idempotent.
- **Titles + day/night from EXIF** (`scripts/enrich-gallery.mjs`): photos aren't named, so titles = capture time + date ("Morning, 1 Jul 2024") + `timeOfDay`/`dayNight`/`date`/grounded `story`. Merges into gallery.json (keeps optimized webp paths); matches on `basename(src)`. 2/269 GPS-tagged → location mostly Unknown.
- **CODEX = indrajaal-style big-type infinite list** (`initCodexScroller`): big type = `timeOfDay` (day/night), meta = year·camera·location — no file names. `.codex-track` ×2 for seamless loop; drag + wheel + momentum. Centered `#codexStageImg` bleeds behind titles, swaps to hovered photo. Hover is real-time via `elementFromPoint` in the RAF tick (works while scrolling under a still cursor). Don't `setPointerCapture` (steals the row click). `codexJustDragged`/`gridJustDragged` suppress click after a drag. GRID has drag-to-scroll (`initGridDrag`).
- **Artifact = centered hero** (title left · image centered over ambient `.artifact-bg` · story+EXIF right). Single × (a `←`) = back to gallery; gallery × = exit. No separate back button.
- **Motion (GSAP):** magnetic "VIEW" cursor + Codex floating preview (one RAF lerp loop, `initGalleryMotion`); scale-in gallery open; split-reveal artifact; Ken Burns + parallax on the hero image.
- **GSAP rule:** reveal staggers + ALL opens/closes animate **transform only, never opacity**; CSS `.visible` owns opacity (with a `transition`). Close paths just remove `.visible` (no `gsap.to(opacity,onComplete)` — a stalled tween stranded the overlay = the "back is broken" bug).

**Pass 10 shipped — new city composition + cluster buildings:**

- **Full city composition from Dimensions.** 35 named buildings in one GLB. `STAGER_BUILDING_ENTRY` maps each name to a **number** (single entry) or **cluster object** `{ cluster: true, label, entryIds }` (work group). Decorative nodes map to `null`.
- **Cluster list modal.** `openClusterPage()` renders a bordered entry list; clicking a row drills into the single-entry detail. Styled as brutalist editorial rows matching the existing modal.
- **Smooth opacity transitions.** Non-matching buildings fade to 8% opacity via `tweenMatProp` (600ms easeOutCubic) for role filters AND year window — never hidden entirely.
- **Picking.** Raycasts composition meshes, walks up scene graph to find named parent with entry/cluster id. Clusters dispatch `onSelectCluster`; singles use `onSelectEntry`.
- **GLB compressed via `scripts/optimize-glb.mjs --preserve-structure`.** Raw 1.5GB Dimensions export → **41.6MB** via `--size 2048 --simplify 0.5 --draco --preserve-structure` (texture 2K WebP + 50% triangle decimation + Draco geometry). `--preserve-structure` is mandatory (skips flatten()+join() so named nodes survive for click mapping). The city is ~97% geometry / ~4MB textures → simplify+Draco are the levers, not textures. `--draco` needs `draco3d` (devDep) + `DRACOLoader` at runtime (wired in terrain.js, gstatic CDN decoder). Raw `public/models/main city composition.glb` is gitignored source; compressed `public/city/city.glb` is LFS-tracked + the Blob-upload source (`scripts/upload-city-blob.mjs`, needs `BLOB_READ_WRITE_TOKEN`). Re-upload after every recompress.

**Pass 08–09 (still active):**

- **Studio-IBL rendering.** `front_key_rear_panels.exr` via `EXRLoader → PMREMGenerator`. One `DirectionalLight` for shadow maps. ACES tone mapping, exposure 0.88. `scene.environmentIntensity = 0.18`.
- **Camera anchored to Dimensions:** radius 123.5, polar 0.516π, azimuth -0.001, target Y 8.3, FOV 10°.
- **Lime-green plinth** (`#C5E03A`) + `#0F0F0F` background+floor.
- **Role filter pills** with hover preview via `tweenMatProp`.
- **First hero model:** `public/models/hospital-1991/Hospital_Building.obj` for 1991 Birth. OBJ+MTL loaded, transform from Dimensions, materials force-converted to MeshStandardMaterial with `map: null` (MTL textures missing), `side: DoubleSide`. Hover/click works via picker integration — custom model attaches to its hidden procedural prism.
- **Scene decorations gated off** via `SHOW_SCENE_EXTRAS = false` (no lamps, trees, bushes, hedges, photons, rooftop AC/tanks).
- **Lighting debug panel** at `?cam=1` — sliders for Key/Env intensity, exposure, shadow radius, key position. Copy-values clipboard. Also: `EXPORT CLUSTER AS GLB` button, shift-click building identifier.
- **Role filter pills moved to right side, vertical, rectangular cards with role-color icon chips + labels.** Hover triggers smooth live preview filter (custom `tweenMatProp` RAF helper — GSAP tweens were unreliable on MeshPhysicalMaterial.opacity in this scene). Click locks the filter. Facade shader's window emissive now scaled by `* opacity` so dim-cascade actually fades the bright windows.

Earlier passes (still active where relevant):

**Pass 05 (this rev) shipped — sculptural cluster + Year Window:**
- **Cluster layout** in `terrain.js`: `clusterLayout()` (golden-angle phyllotaxis spiral) + `classifyTier()` (3 tiers: Milestone → significant → routine). Tier height multipliers 1.55× / 1.18× / 1.0× → pyramid silhouette. `CLUSTER_MODE = true` is default; old grid logic stays gated behind `if (!CLUSTER_MODE)`.
- **Circular plinth** (`CylinderGeometry`, radius = cluster radius + 2.0).
- **Road / sidewalks / curbs / lane markings / crosswalks / kiosks / sidewalk benches** gated off in cluster mode (chronology-axis infra makes no sense without an axis). Lamp posts repurposed as a 16-lamp perimeter ring.
- **Vegetation re-targeted radially** at the cluster (bushes, hedges, flower clusters, pixel crop fields).
- **Year + month labels hidden** in cluster mode.
- **Camera** retuned: radius `PLINTH_RADIUS × 5.0`, polar `0.32π` (top-down 3/4 isometric).
- **Year Window two-handle range slider** in side panel replaces the Depth slider. `state.yearWindow = { start, end }`. Drives `terrain.applyYearWindow(start, end)`.
- **`applyYearWindow()`** traverses every prism's group, GSAP-tweens opacity → 0.10 + scale → 0.88 + emissive → 0 for out-of-window prisms. `scheduleRender` on every tick.
- **Per-prism `year` metadata** stored on the prism for the filter.

**Pass 05 deferred (will layer on the cluster baseline):** signage/LED boards with brand emission, drones, window-light flicker, video textures, plant breeze, film grain + handheld micro-shake, day/night mode, GSAP ScrollTrigger camera.

**Pass 04 (still active):** JSON canonical, backend API (`scripts/static-server.mjs`), editor mode `?edit=1`, brutalist side modal with EDIT/SAVE/CANCEL, evidence schema, Roles/Clients master pages, 2D calendar view.

**Pass 03 (mostly superseded by cluster):** Procedural-facade skyscrapers + brutalist side modal SURVIVED into Pass 05. Only the year×month GRID layout was replaced.

**Design docs:** `typography.md` and `Layout & Grid System.md` govern modal styling. Touch them before changing any modal styling.

---

## 1. Project identity

**Cinematic personal portfolio web app for Anirudh Venkatesan ("Pixel Explorer").**

A two-mode narrative experience:
- **Story Mode** (`/`) — directed, scroll-locked cinematic film of his life 1991 → 2026. *Spec only; not built yet.*
- **Archive Mode** (everything else) — **sculptural 3D cluster on a circular plinth**, filterable by role + Year Window slider. *Built (Pass 05).*

Chronology = spine. Roles = overlays. Artifacts = proof. Treat eras as chapters.

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
- No CMS. Data lives in JSON/MDX in repo.
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
3. **Anirudh writes the prompts; Codex writes the code.** Don't generate copy unless asked.
4. **Token-frugal.** Anirudh is rationing across Codex / Codex / others. Don't propose rebuilds. Don't regenerate working files. Ask before destructive ops.
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
├── CLAUDE.md                          ← Claude Code memory
├── AGENTS.md                          ← this file (Codex memory)
├── README.md                          ← human-facing project overview
├── design.md                          ← visual/motion direction (form, not content)
├── index.html                         ← single entry point
├── app.js                             ← UI, state, filters, detail panel, nav overlays
├── terrain.js                         ← all Three.js: scene, prisms, trees, photons, tilt-shift, camera
├── styles.css                         ← daylit palette in r02 override block at the bottom
├── firsts.html, roles.html, throughlines.html   ← legacy stubs (nav overlays handled in JS now)
├── package.json
├── /data/
│   ├── anirudh-ledger-v4.xlsx         ← upstream master spreadsheet
│   ├── ledger-data.js                 ← exported JS module loaded by index.html
│   └── ledger-data-static.js          ← fallback if the above fails
└── /scripts/
    ├── export-ledger.ps1              ← xlsx → ledger-data.js
    └── static-server.mjs              ← local dev server on :4173
```

Story-Mode-specific paths (`/content/scenes/`, `/src/components/`, `/public/proof/`) are **planned but not yet created.** Don't reference them as if they exist.

---

## 17. Session start checklist for Codex

When opened in a new session, before doing anything:

1. Read this file (`AGENTS.md`) — auto-loaded.
2. Read `README.md` for the operational overview (how to run, what each file does).
3. Read `design.md` if touching anything visual — it governs form.
4. If touching the 3D scene: read `terrain.js` top-to-bottom before editing. Material constants live at the top; the LOD switch in `ensureLOD()` rebuilds prisms when zoom thresholds cross.
5. If touching UI: read `app.js` — state lives in `state` object, mutations go through filter functions.
6. If a fact about Anirudh isn't in `data/ledger-data.js` or in design.md, **ask** — never invent.
7. Before destructive changes, confirm with Anirudh. Token frugality matters.

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
*Maintained by Anirudh + Codex. Update this file when project state changes — don't rely on chat memory.*
