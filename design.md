# design.md — Archive View: "The Time Machine"

> Revision 02 · Visual direction for the chronological archive of Anirudh Venkatesan (Pixel Explorer).
> Spine = chronology · Overlays = roles · Proof = artifacts.
> Companion to `data/ledger-data.js` (data) — this file governs **form**, not content.

---

## 0. What changed

### Pass 05 (2026-05-22 — current build state)

**The chronological grid is dead.** Pass 05 rebuilds Archive Mode as a sculptural cluster — a living model of Anirudh, not a chronological map. Reference brief was "a single dense cluster, like glass slabs in a gallery installation, with a year slider that fades out-of-window entries."

| Was (Pass 04) | Now (Pass 05 built) |
|---|---|
| Year×month grid (12 rows × N year columns) | **Phyllotaxis cluster** — golden-angle spiral packing, all entries in one dense composition |
| Building position encoded year (X) + month (Z) | Position now encodes **importance**. 3-tier hierarchy: Tier 1 (Milestone tag) packs to center, Tier 2 (significant tags or ≥3-entry months) fills the mid-ring, Tier 3 spreads to the perimeter |
| Height = log-scaled entry count + milestone bonus | Same height calc + a **tier multiplier** (1.55× / 1.18× / 1.0×) so the cluster reads as a clear pyramid silhouette |
| Linear "spine road" through grid + era cross-roads + sidewalks + curbs + lane markings + kiosks + benches | All removed in cluster mode. There's no chronological axis to support a road. |
| Rectangular plinth | **Circular plinth** (`CylinderGeometry`, radius = cluster radius + 2.0) |
| 16 lamps along the road | **16-lamp perimeter ring** around the plinth edge |
| Vegetation scattered in a rectangular grid, avoiding road | **Radial vegetation**: bushes/flowers/hedges/pixel-crops scatter on + around the circular plinth |
| Depth slider (camera zoom proxy) | **Year Window two-handle range slider** — picks `[startYear, endYear]`. Out-of-window prisms fade opacity → 0.10, scale → 0.88, emissive → 0 via GSAP tween |
| Camera framing tuned to grid bounds | Camera framing tuned to `PLINTH_RADIUS`: radius 5×, polar 0.32π (top-down 3/4 isometric) |
| Year/month axis labels on the floor | Hidden in cluster mode (no axis to label) |

**Survived from Pass 03/04:** procedural-facade shader, brutalist side modal, editor mode, JSON-canonical data, role buckets, tier-based building geometry archetypes, porcelain materials, tilt-shift post-pass, hero glass silo at 2021 anchor, pixel crop fields, drone, signage.

**Pass 05 deferred (queued for next iteration):**
1. **Signage / LED boards** on hero entries — light-emitting mockups in brand colors, swappable brand designs per entry
2. **Drones** in animated loops over the cluster
3. **Window-light flicker** (per-building random pulses)
4. **Video textures** on LED screens (HTML `<video>` → `THREE.VideoTexture`)
5. **Plant breeze animation** (vertex shader sway on vegetation instances)
6. **Film grain + handheld micro-shake** post-pass (additive on top of existing tilt-shift)
7. **Day / night mode toggle**
8. **GSAP ScrollTrigger camera** — scroll = zoom-through cluster

The new metaphor (replaces §1 below): **the archive is a single sculptural model of Anirudh.** Roles are tinted skins on the buildings. Importance is location and height. Time is a window the user drags through — not an axis to walk along. The whole thing reads like a gallery installation, not a city plan.

### Pass 04 (2026-05-20 — superseded by Pass 05's layout, editor still active)

The editor (JSON canonical, backend API, `?edit=1` mode, evidence schema, Roles/Clients master pages, 2D calendar view) is unchanged. Only the 3D layout architecture moved from grid → cluster.

### r02 (initial design pass — superseded by built state below)

| Was | Now |
|---|---|
| Dark-mode default | **Bright, daylit 3D room** as the canonical mode |
| Reference-green frosted glass | Glass recolored to **CV palette** (cream / acid / red); green demoted to vegetation only |
| Flat timeline bars | **Towers in a city, on a platform, inside a room** — Prezi-style zoom |
| Loose color usage | Locked token set sampled from the 2-page CV |

### Pass 02 (2026-05-20 — superseded by Pass 03)

| Was (r02 design) | Pass 02 built |
|---|---|
| Wide-angle perspective, normal opacity glass | **Telephoto 12 FOV**, saturated frosted glass (opacity 0.78–0.86, transmission 0.32–0.58) — readable from far |
| No tilt-shift | **Custom GLSL tilt-shift post-pass** after bloom — sells the miniature illusion |
| Identical box towers | **3 building archetypes**: standard / stepped / L-plan — from data signals |
| Sine-curve random path | **Straight timeline spine** + perpendicular era cross-roads |
| 160 identical dodecahedron trees | **4 archetypes** × scale variation × red berry instances |
| Fast wide-angle camera drag | **Slowed orbit + pan** (~3× heavier) for telephoto |

The Pass 02 frosted-glass-prism look has since been **replaced by Pass 03's procedural-facade skyscrapers.** Pass 02 is retained here for historical context only.

### Pass 03 (2026-05-20 — current build state)

| Was (Pass 02) | Now (Pass 03 built) |
|---|---|
| Stacked frosted-glass prisms (one segment per role bucket) | **Procedural-window skyscrapers**. Each month = one compound building (podium + body + optional setback + optional spire). `MeshStandardMaterial.onBeforeCompile` injects a GLSL window-pattern shader; 5 per-role facade variants + per-building hash. |
| Three building archetypes via geometry tweaks | **Footprint archetypes** (tower / wide / rectangle / square) chosen from dominant role + milestone signal. Photography → wide low museum; Design → narrow tower w/ spire; AV → setback cinema block; Branding → tall tower w/ spire; IT → uniform monolith. |
| Linear height = entry count | **Log-scaled height** (`log2(1 + n×1.8) + milestone bonus`) → dramatic skyline silhouettes without runaway outliers. |
| LOD ladder (month → week → day on zoom) | **LOD locked to MONTH.** Weekly/daily detail lives inside the modal, not the 3D scene. |
| Cream floor, no surround contrast | **Island environment.** Outer floor darkened (`#BDB39D`) to read as void; shore ring `#D6CDB7` hugs the plinth; plinth itself sized up and raised. |
| White matte spine | **Emissive cream/gold road network**. Spine `#FFF3C8` + emissive `#FFB85C` at 0.4 intensity — picked up by bloom for the glow seen in references. |
| Bottom-drawer detail page | **Brutalist editorial side modal** per `typography.md` + `Layout & Grid System.md`. Right ~67% of viewport, slams in (`translateX(100%) → 0` in 280ms), hard `-8px 0` box-shadow on left edge, sharp 90° corners, no border-radius. Split into **black ledger sidebar** (mono uppercase metadata) + **paper-cream mainboard** (`Inter 900` display title clamped 56–124px uppercase, underlined section heads, hard 2px-bordered tag strip, brutalist prev/next panel). |
| Camera centers focused prism | **Camera offsets focused building to LEFT 1/3 of viewport** (`camTarget.x += focusRadius × 0.14`) so the building sits cleanly alongside the modal. |
| Bloom strength 0.045 / threshold 0.88 | Bloom retuned: **strength 0.14 / threshold 0.92** — only emissive windows + roads bloom; bright cream environment stays unaffected. |

---

## 1. Core metaphor

| Layer | Visual form | Meaning |
|---|---|---|
| Chronology (spine) | A street running through the city, front (1991) → back (present) | Time is the ground you walk |
| Year | One building / tower | A unit of life |
| Signal of a year | Building **height** | High-signal years tower; low-signal years are slabs |
| Roles (overlay) | Frosted-glass **tint** of the building | Which identity dominated that year |
| Earnings / grants / wins | **Amber-gold** building or marker among the glass | The rare warm-metal structure in a glass city |
| Artifacts (proof) | Objects docked at a building's base | Tappable evidence |
| Creative/visual output | **Floating glass spheres ("photons / pixels")** drifting through the city | Your signature — light, photons, pixels |
| Personal evolution / life | **Vegetation** (grass, bushes, trees) growing between structures | Living years vs. pure-work years |
| Chapters (eras) | **Arches / thresholds** you pass under | The 11 eras |

The viewer is **inside a room looking at a model of a life** (ref. images 5, 7). The arches frame the platform; landscape is visible beyond. You are inside the observer — inside *someone*. Zooming in = entering a year.

---

## 2. Spatial concept

- **The platform**: a clean plinth in the center of a softly-lit room. The whole life sits on it as a scale model (images 3, 4, 6).
- **The room**: warm-white walls, arches, daylight pouring from one side, a horizon/landscape beyond the openings (images 5, 7). Gives the "inside something" feeling and the towering-skyscraper scale shift on zoom.
- **The city**: dense at high-signal eras, sparse + green at quiet years. Streets are the timeline; cross-streets can separate the 11 chapters.
- **Default camera**: elevated 3/4 isometric-ish look across the model. **On zoom**: camera drops to street level so a tall year *towers* over you.

---

## 3. References → decisions

| Ref images | What they govern | Decision |
|---|---|---|
| 1, 2, 5 | Bars + environment material/mood | Frosted-glass towers, whitish bg, sun-like key light, subsurface glow, vegetation present |
| 3, 4, 6 | Composition | City-on-platform, room-scale, immersive zoom; vegetation woven between blocks; floating spheres |
| 5, 7 | Framing | Arches + visible landscape = the "inside a room / inside someone" device; thresholds = eras |
| 8 (your CV) | **Color + type only** | Glass recolored to cream/acid/red; fonts mapped per §11 |

**Key reconciliation:** references are green-glass; your CV is cream/acid/red. Resolution → **material stays, color migrates**. Glass takes acid + red tints; green survives **only as living vegetation**. This keeps the serene daylit-architecture feel while making the palette unmistakably yours.

---

## 4. Color theory (sampled from CV — verify exact hex against the source file)

### Base
| Token | Hex | Use |
|---|---|---|
| `--room` | `#F7F4EC` | Room walls / sky / hero background |
| `--paper` | `#EDE4CE` | UI surfaces, cards, panels (the CV cream) |
| `--ink` | `#1A1714` | Text, annotations, hairlines (warm near-black, never pure #000) |

### Signal accents (the CV's punch)
| Token | Hex | Use |
|---|---|---|
| `--acid` | `#E1FA3C` | Primary highlight; active year; key CTA glass tint |
| `--signal` | `#F23B21` | Headers, hot markers, "now", alerts |
| `--gold` | `#C8923B` | **Earnings / grants / wins** buildings + markers |

### Environment
| Token | Hex | Use |
|---|---|---|
| `--leaf` | `#5B8C3E` | Vegetation base |
| `--leaf-hi` | `#7FB04A` | Vegetation highlights |
| `--sun` | `#FFF3D6` | Directional light color / warm bloom |
| `--glass-white` | `rgba(255,255,255,0.55)` | Untinted / neutral years |

**Tint logic for glass towers (role overlays):**
- Moving images / film → `--signal` tint
- Visual systems / design → `--acid` tint
- Computational / Web3 → cool desaturated `--ink`-tinted glass (graphite glass)
- Documentation / research → `--glass-white` (neutral)
- Leadership / education → `--gold` edge-lighting
- Earnings/grant year → solid `--gold` building (the warm-metal anomaly)

---

## 5. Material system — frosted glass

Target the look of images 1, 2, 5: translucent, internally lit, soft.

| Property | Value (R3F / `MeshPhysicalMaterial`) |
|---|---|
| `transmission` | 0.85–0.95 |
| `roughness` | 0.45–0.6 (frosted, not clear) |
| `thickness` | scaled to building mass |
| `ior` | 1.3 |
| `attenuationColor` | the role tint token |
| `attenuationDistance` | tuned per height (taller = more saturated core) |
| `clearcoat` | 0.2 |
| Inner glow | faint emissive core in role tint, low intensity |

CSS fallback (cards / 2D mode): `backdrop-filter: blur(18px)`, `background: color-mix(in srgb, var(--acid) 18%, transparent)`, 1px `--room` inner border, soft drop shadow.

---

## 6. Lighting & environment

- **Key**: single warm directional `--sun`, low-ish angle → long soft shadows (image 1's mood). One clear light direction = legible city.
- **Fill**: high soft ambient from `--room`; subtle HDRI for glass refraction.
- **Shadows**: contact + soft cast; this is what makes glass read as glass.
- **Bloom**: gentle, on emissive cores and `--acid`/`--gold` edges only.
- **Vegetation**: clustered, not uniform. Density = a *personal-life* signal (travel, relationships, moves) so the model reads as a life, not a CV.

---

## 7. Signature element — photons / pixels

The floating glass spheres in refs 2, 3, 6 become **your photons** (light → pixels → your whole identity).
- Drift slowly along the streets, denser around high-output years.
- Tinted faintly by the building they pass.
- On hover of a year, photons converge toward it.
- Optional: each sphere can carry a 1px refracted thumbnail of an artifact — literally "pixels" of work floating through time.

---

## 8. Data → form mapping

| Ledger field | Visual property |
|---|---|
| `year` | Position along the street (depth) |
| `signal_score` (compression) | Building height + LOD detail |
| `dominant_role` | Glass tint (§4) |
| `era_id` (1–11) | Street segment + arch threshold + ground treatment |
| `artifacts[]` | Docked objects at base; count = cluster size |
| `earnings / grant / win` flag | `--gold` material + a beacon photon column |
| `firsts` / turning points | A taller spire or a break in the street (a "corner" you turn) |
| `personal_evolution` | Vegetation density around the block |
| `tentative` evidence | Lower opacity glass + dashed contact shadow |

> Compress low-signal years into short slabs (a quiet block you pass quickly); expand high-signal years into towers that force a zoom.

---

## 9. Composition & camera (Prezi zoom)

- **Overview**: full model on platform, room visible, all 11 eras readable as skyline silhouette.
- **Era**: camera glides under an arch into one street segment; siblings dim and lose LOD.
- **Year**: drop to street level — the tower *looms*; photons converge; artifacts surface from the base.
- **Artifact**: tower face becomes a frosted vitrine; the proof (image/film/link/doc) renders behind glass; metadata in Cascadia Code.
- **Back out**: reverse zoom; never a hard cut — always continuous travel (the "time machine" promise).

Scroll = travel through time. Click = descend a level. Esc / back = ascend.

---

## 10. Motion

| Element | Motion |
|---|---|
| Camera | Eased, weighty (it's a heavy model); 600–900ms transitions |
| Photons | Continuous slow drift; converge on focus |
| Glass | Subtle internal light shift as camera moves (refraction) |
| Vegetation | Faint idle sway only |
| Year reveal | Tower "grows" up from platform on first entry to its era |
| Hairlines / labels | Fade + 8px rise, staggered |

No bounce, no playful easing — this is architectural and cinematic, not bouncy.

---

## 11. Typography

| Font | Role |
|---|---|
| **Climate Crisis** | Giant year numerals on the spine; weight decays oldest→newest |
| **Inthacity** | Name lozenge, chapter/era titles |
| **Cascadia Code** | All metadata, coordinates, role tags (`2015_first_movie`), artifact captions, UI labels |
| **Saithik** | Handwritten margin annotations, pull-quotes ("keep experimenting…") — *flagged: confirm this is the script face* |

Hierarchy: Climate Crisis (scale) → Inthacity (identity) → Cascadia (truth/data) → Saithik (voice/human).

---

## 12. Implementation notes

- **Stack**: React + React-Three-Fiber + drei (`MeshTransmissionMaterial`, `Environment`, `ContactShadows`), Framer Motion for 2D overlays.
- **Asset pipeline**: Higgsfield / Nano Banana for hero plates & artifact stills; real geometry kept low-poly (glass blocks + instanced vegetation + instanced photon spheres).
- **Performance**: instance vegetation and photons; LOD by era distance; cap transmission samples; bake what you can.
- **Fallback**: 2D mode = the same palette + frosted CSS cards on a `--room` background, vertical scroll, no 3D — for low-power devices and SEO/crawlable content.
- **Data source**: drive everything from the ledger JSON so visuals regenerate when content changes.

---

## 13. Open decisions / flags

1. **Saithik font role** — confirm script vs. body (see §11).
2. **Dark mode** — recommend dropping as default; if kept, make it a *twilight* version of the same room (warm-night), not a separate aesthetic. Decide.
3. **Exact hex** — sample `--acid`, `--signal`, `--gold`, `--paper` directly from the CV file; values above are close reads, not pixel-exact.
4. **Era count on the street** — 11 eras across one straight street vs. a bend per era (the "turning point = turn a corner" idea). Pick before modeling.
5. **Photon thumbnails** — confirm whether spheres carry artifact previews (cost vs. payoff).
