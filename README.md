# Pixel Explorer — Portfolio Archive

A cinematic personal portfolio for **Anirudh Venkatesan** (alias *Pixel Explorer*).

88 ledger entries spanning 1991 → 2026, rendered as a 3D city: every named
building maps to a project or a cluster of related work. Visitors filter by
role or client, search, and click through to full entry pages with evidence.

Live at **[anirudh.website](https://anirudh.website)** (Vercel, deploys from `master`).

---

## Quick start

```bash
node scripts/static-server.mjs
```

Serves at `http://127.0.0.1:3000`. No build step, no bundler, no watcher —
hard-refresh after editing.

---

## Stack

Vanilla JavaScript + ES modules. **No React, no bundler, no TypeScript** —
intentional, and not up for renegotiation.

| Layer | Choice |
|---|---|
| 3D | Three.js 0.164 via CDN import map in `index.html` (GLTFLoader, DRACOLoader, EXRLoader, PMREMGenerator) |
| Animation | GSAP 3.12, `<script>` tag |
| Styling | **`carbon.css`** — single stylesheet on IBM Carbon (IBM Plex, `--cds-*` tokens, `[data-theme]` light/dark) |
| Data | `data/ledger.json` |
| Server | `scripts/static-server.mjs` (static + ledger API) |

---

## Layout

```
index.html          single entry point; CDN import map
app.js              UI, state, filters, search, nav overlays, entry pages
terrain.js          all Three.js: scene, GLB city loader, picking, camera
carbon.css          the only stylesheet
landing.html/.js    separate landing page

data/
  ledger.json               canonical entry data — the app reads this
  anirudh-ledger-v4.xlsx    upstream spreadsheet, archival only
  case-studies.json         the 5 long-form case studies
  gallery.json              269 photos + EXIF

public/
  city/city.glb       43.6MB compressed city, served same-origin
  proof/              evidence per entry
  gallery/            optimized photo webp (thumb + display)

scripts/
  static-server.mjs   dev server + ledger API
  optimize-glb.mjs    raw GLB → compressed (use --preserve-structure)
  xlsx-to-json.mjs    re-seed ledger.json from the xlsx
  optimize-gallery.mjs / extract-exif.mjs / enrich-gallery.mjs
```

**Never LFS-track anything Vercel must serve.** Vercel deploys LFS pointers as
133-byte text files, so an LFS-tracked asset is broken on production by
construction. `.gitattributes` enforces this. `city.glb` is plain git for
exactly this reason.

---

## Editing the data

`data/ledger.json` is canonical; the xlsx is archival.

```bash
node scripts/static-server.mjs
```

Then open `http://127.0.0.1:3000/?edit=1`. Every field becomes editable and
writes back through the local API (`PUT /api/entries/:id`, `POST /api/entries`,
`POST /api/upload`). Uploads land in `public/proof/<entryId>/`.

**Which fields are public** — read the field contract in `CLAUDE.md` §9 before
wiring any ledger field into a view. `notes`, `evidenceSource` and
`evidenceDetail` are internal research fields and must never render;
`description` is the canonical public prose and every entry has one.

To re-seed from the spreadsheet (rare, overwrites pending in-app edits):

```bash
node scripts/xlsx-to-json.mjs
```

---

## Testing

```bash
npx playwright test
```

Headless runs must block `*.glb` and `*.exr` — headless WebGL stalls the
compositor and screenshots come back as stale frames. Pair every screenshot
with a DOM assertion.

```bash
npx eslint app.js terrain.js landing.js story/
```

---

## State

- **Archive Mode** — built and live. Carbon design system; the manila/fluent
  and brutalist-editorial eras are gone.
- **Story Mode** — specified in `CLAUDE.md` §6, not built.
- **Known issue** — the Vercel Blob store is over its Hobby cap and suspended,
  so proof/evidence images 403 on production. The city is unaffected (it is
  served same-origin). See `CLAUDE.md` §0.

`CLAUDE.md` is the working project memory and the source of truth for current
state. This README is the operational overview; when the two disagree,
`CLAUDE.md` is newer.

---

## How this started

Before a line of it was written, the archive had to be excavated. Anirudh mined
his own **Gmail history and hard drives** — 15+ years of emails, contracts,
invoices, project files and exports — using **Claude Projects** and **ChatGPT
Projects** to read, cross-reference and date the material until a coherent
timeline emerged. That reconstruction became the master ledger
(`data/anirudh-ledger-v4.xlsx` → `data/ledger.json`), which is what this site
renders. Every entry traces back to something real he found in his own records.

---

## Credits

Built by **Anirudh Venkatesan**.

Written with four AI pair-programmers, each on a different part of the build:

| | |
|---|---|
| **Claude Code** (Anthropic) | Primary pair-programmer — architecture, 3D scene, UI, data pipeline |
| **Codex** (OpenAI) | Second agent on the same repo; `AGENTS.md` is its entry point |
| **Antigravity** (Google) | The Carbon design-system rewire — `styles.css` + `fluent.css` → single `carbon.css` |
| **OpenCode** | Agentic coding via `@omniroute/opencode-provider` |

Archive excavation (see above) ran on **Claude Projects** and **ChatGPT Projects**.

### Libraries

Runtime, loaded from CDN — no bundler:

| Library | License | Used for |
|---|---|---|
| [Three.js](https://threejs.org/) 0.164.1 | MIT | The entire 3D city — GLTFLoader, DRACOLoader, EXRLoader, PMREMGenerator |
| [GSAP](https://gsap.com/) 3.12.5 | GreenSock standard (free tier) | Camera choreography, overlay transitions, staggers |
| [D3](https://d3js.org/) v7 | ISC | The force-directed case-study relations graph (case studies → `relations` toggle) |
| [Draco](https://google.github.io/draco/) decoder (gstatic) | Apache-2.0 | Decompresses the city geometry at runtime |
| [IBM Plex](https://www.ibm.com/plex/) via Google Fonts | SIL OFL 1.1 | Sans, Sans Condensed, Serif, Mono |
| [IBM Carbon Design System](https://carbondesignsystem.com/) | Apache-2.0 | The design language `carbon.css` implements |
| [Icons8](https://icons8.com/) "Stickle" 3D icons | Free w/ **attribution required** | Role stickers and entry marks |

Build and tooling (npm, dev-only — none of this ships to the browser):

| Package | License | Used for |
|---|---|---|
| `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions` | MIT | GLB compression pipeline (`scripts/optimize-glb.mjs`) |
| `meshoptimizer` | MIT | Mesh simplification |
| `draco3d` | Apache-2.0 | Draco geometry compression at build time |
| `obj2gltf` | Apache-2.0 | OBJ → glTF conversion |
| `sharp` | Apache-2.0 | Gallery + evidence image optimisation |
| `exifr` | MIT | EXIF extraction for gallery titles and dates |
| `ffmpeg-static` | **GPL-3.0-or-later** | Video re-encoding for the blob diet |
| `playwright` | Apache-2.0 | End-to-end tests and headless UI audits |
| `eslint` · `@eslint/js` · `globals` | MIT | Linting |
| `@vercel/blob` | Apache-2.0 | Uploading evidence to Vercel Blob |
| `http-server` | MIT | Alternate static server |
| `@omniroute/opencode-provider` | MIT | OpenCode agent gateway |

Two notes worth keeping straight. **`ffmpeg-static` is GPL-3.0-or-later**, but
it is a build-time binary that never ships with the site, so it imposes no
copyleft obligation on this repo's output. **Icons8's free tier requires
visible attribution** — that obligation is live wherever the Stickle icons
render, and this listing is where it is discharged.

### Content

All photography, film work, design work and written entries are Anirudh's own.
Evidence artifacts under `public/proof/` are his originals.

License: not specified. Ask before reusing.
