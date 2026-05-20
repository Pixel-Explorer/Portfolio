# Pixel Explorer — Portfolio Archive

A cinematic personal portfolio for **Anirudh Venkatesan** (alias *Pixel Explorer*).

It renders ~120 ledger moments from his life (1991 → 2026) as a **daylit 3D miniature city** on a platform: each year is a column of saturated-glass buildings, each building is a stack of role-coded segments, and visitors can scrub through the timeline, filter by role, and click any prism to dive into that moment.

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

- A bright cream room with three soft arches in the background.
- A **cream island plinth** sits above a darker void surround. The city stands on it.
- **Time runs along the X axis** (oldest left, today right). Each building is **one month** of Anirudh's life.
- A **glowing cream/gold road** runs through the centre (timeline spine) plus perpendicular cross-roads at the boundaries between Anirudh's 11 life eras.
- **Trees** cluster between the buildings (4 archetypes, scale variation, red berries on ~30% of them).
- **Floating glass photons** drift along the spine — the "pixels" of Pixel Explorer.
- A telephoto **tilt-shift blur** softens the far distance to read as a miniature.

Every building is a compound mass: **podium + body + optional setback + optional spire**. Its archetype (tower / wide / rectangle / square) is chosen from the dominant role of that month. Height is log-scaled from the moment count plus milestone bonuses.

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
| Scroll wheel | Zoom in/out — LOD switches between months → weeks → days as you go deeper |
| Click a prism | Camera anchors to it; project drawer slides up from the bottom |
| Click a year label | Zoom to that year |
| Role pills at top | Filter the city by role bucket (path turns that role's color) |
| Tag pills in the left sidepanel | Filter by individual tag |
| Search box | Isolate matching moments (non-matches dim) |
| Reset button (bottom toolbar) | Return camera to overview |
| `←` / `→` | Step to previous / next moment chronologically |

---

## Updating the data

The master is the xlsx in `data/`. When you edit it:

```powershell
# Windows / PowerShell
./scripts/export-ledger.ps1
```

That regenerates `data/ledger-data.js`. Hard-refresh the browser.

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
