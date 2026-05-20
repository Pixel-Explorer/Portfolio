# design.md — Archive View: "The Time Machine"

> Revision 02 · Visual direction for the chronological archive of Anirudh Venkatesan (Pixel Explorer).
> Spine = chronology · Overlays = roles · Proof = artifacts.
> Companion to `anirudh-chronological-ledger.md` (data) — this file governs **form**, not content.

---

## 0. What changed in this revision

| Was | Now |
|---|---|
| Dark-mode default | **Bright, daylit 3D room** as the canonical mode |
| Reference-green frosted glass | Glass recolored to **CV palette** (cream / acid / red); green demoted to vegetation only |
| Flat timeline bars | **Towers in a city, on a platform, inside a room** — Prezi-style zoom |
| Loose color usage | Locked token set sampled from the 2-page CV |

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
