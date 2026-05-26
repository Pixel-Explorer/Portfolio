# Pixel Explorer — Portfolio Archive

A cinematic personal portfolio for **Anirudh Venkatesan** (alias *Pixel Explorer*).

It renders ~120 ledger moments from his life (1991 → 2026) as a **sculptural 3D cluster** on a circular plinth: each month-of-life is a building, milestones cluster to the center, routine entries spread to the perimeter. Visitors filter by role, drag a year-range window to fade in/out parts of his life, and click any building to dive into that moment.

This repo is the **Archive Mode** of a planned two-mode site. A separate **Story Mode** (scroll-locked cinematic narrative) is specified in `design.md` and `CLAUDE.md` but not yet built.

---

## Quick start

```bash
node scripts/static-server.mjs
# serves the site at http://127.0.0.1:4173
```

Open `http://127.0.0.1:4173`. There's no build step. No bundler. No watcher.

Refresh the browser after editing files (the server doesn't live-reload).

---

## What's in here

```
index.html                 — single entry point; loads three.js via CDN import map
app.js                     — UI, state, filters, search, detail drawer, nav overlays
terrain.js                 — all the Three.js: scene, prisms, custom hero models,
                             HDRI IBL, Reflector floor, picker, lighting debug panel
styles.css                 — UI styling. The "r02" override block at the bottom
                             holds the canonical palette tokens.

data/
  anirudh-ledger-v4.xlsx   — upstream master spreadsheet (treat as read-only)
  ledger.json              — canonical entry data (read by the app + backend API)
  ledger-data.js           — exported JS module loaded by the app
  ledger-data-static.js    — fallback if the above fails to load

public/
  lighting/                — EXR HDRIs used as scene.environment
    front_key_rear_panels.exr   (Adobe Dimensions studio HDRI)
  materials/               — reference MDL files + previews (porcelain etc.)
  models/                  — custom hero buildings (OBJ + MTL, future GLB)
    hospital-1991/         — first hero (1991 Birth entry)
  proof/                   — image/video/PDF evidence per entry

scripts/
  export-ledger.ps1        — regenerates ledger-data.js from the xlsx
  static-server.mjs        — local dev server + ledger backend API

CLAUDE.md / AGENTS.md      — persistent project memory for Claude Code / Codex
design.md                  — visual + motion direction (the *form* spec)
```

The site is **vanilla JavaScript + ES modules**. Three.js core, `EXRLoader`, `EffectComposer`, `RenderPass`, `Reflector`, `RoundedBoxGeometry`, `OBJLoader`, `MTLLoader`, and `GLTFExporter` are loaded via the CDN import map in `index.html`. GSAP is a `<script>` tag.

As of Pass 08, **all post-processing has been stripped** — no bloom, no tilt-shift, no vignette. Lighting is pure HDRI IBL + ACES tone mapping to match Adobe Dimensions's render output. One supplementary `DirectionalLight` exists only to cast defined shadow maps (Three.js can't ray-trace HDRI shadows in real-time).

---

## What you'll see when you open it

- A dark `#0F0F0F` studio background with a **bright lime-green circular plinth** at center.
- A **sculptural cluster of porcelain buildings** packed on the plinth via a phyllotaxis (golden-angle) spiral. Milestones tower at the center, significant entries form a mid-ring, routine entries fill the perimeter.
- **Each building is one month** of Anirudh's life. Height encodes how packed that month was, plus a tier multiplier so the cluster has a clear pyramid silhouette.
- **A hospital model** (`public/models/hospital-1991/`) stands in the foreground replacing the procedural prism for the 1991 Birth entry — first of several Kitbash hero models that will replace key milestones.
- **The dark glossy floor reflects the cluster** at ~40% opacity with a soft 35% roughness blur — true planar reflection via Three.js's `Reflector`.
- Lighting is **pure HDRI IBL** from Adobe Dimensions's `front_key_rear_panels.exr` studio HDRI, ACES tone-mapped. One supplementary directional light casts defined shadows on the plinth (Three.js can't ray-trace HDRI shadows in real time).

Every procedural building is a compound mass: **podium + body + optional setback + optional spire**. Its archetype (tower / wide / rectangle / square) is chosen from the dominant role of that month. Height is log-scaled from the moment count plus milestone bonuses, multiplied by the importance tier.

### Role-driven facades

Each role bucket has its own **procedural window pattern** rendered in a GLSL shader injected into the building material. After the Pass 08 porcelain pivot, **building bodies are all white** — role identity is now expressed solely through window pattern density. Click a building and the side modal still colour-codes by bucket.

| Role bucket | Window pattern |
|---|---|
| Moving Images / Photography | sparse irregular windows |
| Visual Systems / Graphic Design | dense regular window grid |
| Computational Culture / IT | perfectly uniform tight window grid |
| Documentation & Research / Branding | wide-spaced windows |
| Leadership & Education / Audio-Visual | tall vertical cinema-strip windows |

Per-building randomness shifts each window pattern so no two buildings look identical even within a role.

### What happens when you click a building

The camera arcs to put the building in the **left third of the viewport**, then a brutalist editorial modal slams in from the right (~67% width). Inside:

- **Left column (black, ~30%)** — the *ledger sidebar*. Mono uppercase metadata: date, week, role, org/client, location, era, evidence, productivity, money.
- **Right column (cream paper, ~70%)** — the *mainboard*. Massive ultra-bold display title, hard-bordered tag strip, underlined sub-heads (Notes / Same month / Navigation), brutalist prev/next panel.

Sharp 90° corners. No border-radius. Hard offset box-shadow on the close button. The layout follows `Layout & Grid System.md` and the type follows `typography.md`.

---

## Controls

| Gesture | Action |
|---|---|
| Left-drag | Pan the model (deliberate, telephoto-friendly speed) |
| Right-drag or Shift+drag | Orbit around the model |
| Scroll wheel | Zoom in/out |
| Click a building | Camera anchors to it; brutalist side modal slides in from the right |
| **Year Window slider** (side panel) | Two-handle range — drag to set `[startYear, endYear]`. Out-of-window buildings fade + scale down via GSAP. |
| Role pills at top | Filter the cluster by role bucket; matching buildings stay vivid, others dim |
| Tag pills in the left sidepanel | Filter by individual tag |
| Search box | Isolate matching moments (non-matches dim) |
| Reset button (bottom toolbar) | Return camera to cluster overview |
| `←` / `→` | Step to previous / next moment chronologically |

---

## Updating the data

### Pass 04: JSON is canonical

The app reads `data/ledger.json`. The xlsx (`data/anirudh-ledger-v4.xlsx`) is archival only.

**Editor mode (the easy way):**

```bash
node scripts/static-server.mjs    # if not already running
# then open http://127.0.0.1:4173/?edit=1
```

In the URL, `?edit=1` flips on the editor:

- The brutalist side modal grows EDIT / SAVE / CANCEL controls. Every field becomes editable.
- The Roles and Clients tabs become **master pages** — click into a role or client, expand to see all moments under it, hit EDIT on any row to fix it.
- A `+ ADD NEW MOMENT` button on each master page creates a new entry server-side (with today's date as default) and drops you straight into the editor for it.
- Images, videos, and YouTube links can all be attached per entry. Uploads land in `public/proof/<entryId>/`.

Edits write back to `data/ledger.json` immediately via the local API (`scripts/static-server.mjs` handles `PUT /api/entries/:id`, `POST /api/entries`, `POST /api/upload`).

### Re-seeding from xlsx (rare)

If you ever need to regenerate JSON from the xlsx (e.g., you did a big edit in Excel and want to overwrite the JSON):

```bash
node scripts/xlsx-to-json.mjs
```

⚠️ This overwrites `data/ledger.json` — any pending in-app edits not yet reflected in the xlsx will be lost.

---

## Project state (May 2026)

- **Archive Mode** — built, working. This is **Pass 03** (procedural-facade skyscrapers + brutalist side modal). Pass 02's frosted-glass-prism look has been replaced.
- **Story Mode** — designed (`design.md` §§5–10, `CLAUDE.md` §6), not built yet.
- **Live deployment** — not yet. Local dev only. Eventual domain undecided (`pixelhaus.in` is one candidate).

Recent work is summarised in the **§0 "What changed"** block at the top of `design.md`. The two governance docs added in May 2026 — `typography.md` and `Layout & Grid System.md` — define the brutalist editorial direction the side modal now follows.

---

## Tech notes

- No React, no bundler, no TypeScript. Intentional — keeps the repo legible and the iteration loop tight.
- Three.js version is pinned via the import map (currently `0.164.1`). If you upgrade, test the `RoundedBoxGeometry` and `RoomEnvironment` examples — paths change between versions.
- The tilt-shift shader lives at the top of `terrain.js`. The three tuning knobs are its uniforms: `bandCenter` (where the sharp zone sits vertically), `bandWidth` (how tall it is), and `blurStrength` (max pixel radius at the extremes).
- The custom drag speeds (orbit ≈ 0.0016, pan ≈ radius × 0.00035) are calibrated for the telephoto 12° FOV. If you change the FOV, expect to retune these.

---

## Credits

Built by Anirudh Venkatesan with Claude Code (Anthropic) and Codex (OpenAI) as pair-programmers. Data sourced from 15+ years of Anirudh's own emails, contracts, project files, and the master ledger.

License: not yet specified. Ask before reusing.
