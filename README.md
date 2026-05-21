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
terrain.js                 — all the Three.js: scene, prisms, trees, photons, tilt-shift, camera
styles.css                 — UI styling. The "r02" override block at the bottom
                             holds the canonical daylit palette; the top of the file
                             is dead dark-mode tokens kept around for reference.

data/
  anirudh-ledger-v4.xlsx   — upstream master spreadsheet (treat as read-only)
  ledger-data.js           — exported JS module loaded by the app
  ledger-data-static.js    — fallback if the above fails to load

scripts/
  export-ledger.ps1        — regenerates ledger-data.js from the xlsx
  static-server.mjs        — local dev server

CLAUDE.md / AGENTS.md      — persistent project memory for Claude Code / Codex
design.md                  — visual + motion direction (the *form* spec)
```

The site is **vanilla JavaScript + ES modules**. Three.js, RoomEnvironment, EffectComposer, bloom, and a custom tilt-shift `ShaderPass` are all loaded via the CDN import map in `index.html`. GSAP is a `<script>` tag.

---

## What you'll see when you open it

- A warm terracotta horizon with a **cream circular plinth** at center.
- A **sculptural cluster of buildings** packed on the plinth via a phyllotaxis (golden-angle) spiral. Milestones tower at the center, significant entries form a mid-ring, routine entries fill the perimeter.
- **Each building is one month** of Anirudh's life. Height encodes how packed that month was, plus a tier multiplier so the cluster has a clear pyramid silhouette.
- **A perimeter ring of 16 lamps** marks the plinth edge. Trees + flowers + pixel-crop fields scatter on and around the plinth.
- A **hero glass-domed silo** sits in the cluster at the 2021 NEAR-grant anchor.
- The whole thing is bathed in a soft cinematic light with a tilt-shift "miniature" feel.

Every building is a compound mass: **podium + body + optional setback + optional spire**. Its archetype (tower / wide / rectangle / square) is chosen from the dominant role of that month. Height is log-scaled from the moment count plus milestone bonuses, multiplied by the importance tier.

### Role-driven facades

Each role bucket has its own **procedural window pattern** rendered in a GLSL shader injected into the building material. Click a building and the side modal also colour-codes by bucket.

| Role bucket | Color | Facade pattern |
|---|---|---|
| Photography | cream white | sparse irregular windows, wide low buildings |
| Graphic Design | acid yellow | dense regular window grid, narrow towers (often with spire) |
| Audio-Visual | signal red | tall vertical cinema-strip windows, setback masses |
| Branding / Studio / Strategy | gold | wide-spaced windows, tower with antenna spire |
| IT & Web3 | graphite | perfectly uniform tight window grid, monolithic |

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
