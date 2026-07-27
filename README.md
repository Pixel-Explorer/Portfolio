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

## Credits

Built by Anirudh Venkatesan with Claude Code as pair-programmer. Data sourced
from 15+ years of his own emails, contracts, and project files.

License: not specified. Ask before reusing.
