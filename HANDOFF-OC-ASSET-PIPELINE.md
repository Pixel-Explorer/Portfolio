# HANDOFF-OC: Proof/Gallery asset optimization + entry wiring

**Author:** Claude (architect) · **Executor:** OpenCode · **Date:** 2026-06-09
**Branch:** create `asset-pipeline` off current HEAD before any commit (NOT the default branch).

Autonomous asset-pipeline task (NOT Story Mode). Anirudh dumped ~1.6 GB of raw proof
material into folders (some named by entry-id, some by project name) and reorganized the
gallery into subfolders. Optimize the images to WebP, wire the folders into
`data/ledger.json` per the **exact mapping in §4** (attach to existing entries OR create new
ones — no duplicates), fix the gallery optimizer the reorg broke, regenerate
`data/gallery.json` safely, then commit + push **without** any raw/oversized file entering git.

---

## 0. Locked decisions (do NOT relitigate)

1. **Proof images → WebP** via a new sharp compressor; rewrite evidence `src` to the webp paths.
2. **Videos → "YouTube upload pending"** — never compress/upload. Each video becomes an
   evidence item flagged `youtubePending:true`, `src` = current local path. (20 videos:
   15 `.mp4` + 5 `.mov`; two exceed 100 MB — `Pasoori.mp4` 286 MB, `Comp.mp4` 191 MB — these
   can NEVER go to plain git.)
3. **Gallery optimizer → fix for subfolders + re-run** (it reads flat, now finds 0 photos).
4. **Folder→entry wiring is FIXED by the §4 table.** Do not fuzzy-match or guess. Attach to
   existing entries where specified; create new entries only where marked NEW.

---

## 1. HARD GUARDRAILS (violations = task failure)

- **NEVER fabricate data.** Gallery locations come only from (a) EXIF GPS, (b) the
  **subfolder name** the user filed the photo under (e.g. `Gallery/Singapore/` → "Singapore"
  — user's own labeling, USE it), else (c) `"Unknown"`. For new ledger entries, set
  description/role/org/date **blank** — Anirudh fills them in the front end. Invent nothing.
- **NEVER commit a file > 95 MB.** Run the §6 gate; if it trips, abort the push and report.
- **NEVER `git add` raw sources** (`.jpg/.jpeg/.png/.tif/.mp4/.mov`) under `public/proof/`.
  They're gitignored in §3. Only `.webp` and `.pdf` (≤95 MB) get committed.
- **Do NOT delete raw originals** — just gitignore them.
- **Do NOT install git hooks.** Do NOT touch `app.js`, `terrain.js`, `styles.css`,
  `index.html`. Allowed writes ONLY: `scripts/optimize-proof.mjs` (new),
  `scripts/optimize-gallery.mjs`, `data/ledger.json`, `data/gallery.json`, `.gitignore`,
  `PROOF-LINKING-TODO.md` (new).
- **CONCURRENCY:** Anirudh edits `ledger.json` live via `?edit=1`. Before starting, snapshot
  `data/ledger.json` + `data/gallery.json` to `*.prepipeline.bak`, then **re-read
  `ledger.json` fresh immediately before writing** and compute ids/targets from that live
  copy (entry count and max-id may have grown since this doc was written). Validate JSON
  parses after every write. If you detect the file changed mid-run, re-read and re-apply.

---

## 2. Current state (facts — RE-VERIFY against the live file, it's changing)

- `ledger.json` had **85 entries, max id 135** at write time (Anirudh is actively adding
  entries: 127 Petved, 128 Armoise, 129 Surat Municipal, 130 Abad Bread, 131 Computational
  Photography, 132 "COntact" (blank), 133 GenAi, 134 "New moment" (blank), 135 Weddings-CMW).
  **Re-read live; do not hardcode 85.**
- Raw proof (tracked, excludes gitignored `public/proof/Gallery/`): ~1.6 GB —
  **161 jpg · 65 png · 15 mp4 · 8 pdf · 5 mov**.
- **Numbered proof folders** map to same-id entries (confirmed exist): `78, 79, 83, 98,
  126, 127`. Wire each into entry `<id>` (§4).
- Entry **98** already has evidence `[{type:"pdf", src:"public/proof/98/Solsavi_work.pdf"}]`
  — preserve, don't duplicate.
- `public/gallery/{thumb,display}/` already holds **269** optimized webp (idempotent skip).
- `public/proof/Gallery/` is already fully gitignored (3.7 GB raw source) — leave that intact.
  It now contains **10 subfolders** (Auroville, Europe, Family, Gujarat, Himachal, Istanbul
  Airport, Malaysia, Odisha, Singapore, …) with **0 loose top-level images**.

---

## 3. Task A — gitignore raw, keep derivatives committable

Append to `.gitignore` (keep the existing `public/proof/Gallery/` line):

```gitignore
# Raw proof source material — only .webp derivatives (+ PDFs ≤95MB) get committed.
public/proof/**/*.[Jj][Pp][Gg]
public/proof/**/*.[Jj][Pp][Ee][Gg]
public/proof/**/*.[Pp][Nn][Gg]
public/proof/**/*.[Tt][Ii][Ff]
public/proof/**/*.[Tt][Ii][Ff][Ff]
public/proof/**/*.[Mm][Pp]4
public/proof/**/*.[Mm][Oo][Vv]
```

(Does not untrack the ~77 raw images already committed in earlier folders — fine, leave them.)

---

## 4. Task B — compress proof + wire folders (THE deterministic mapping)

**Compressor — new `scripts/optimize-proof.mjs`** (mirror `optimize-gallery.mjs` style):
- Recurse `public/proof/`, **skip** `Gallery/`. For each `.jpg/.jpeg/.png/.tif/.tiff`:
  `sharp(input).rotate().resize({ width:2000, height:2000, fit:"inside",
  withoutEnlargement:true }).webp({ quality:82 })` → `<samePath>.webp`. Idempotent (skip if
  webp exists unless `--force`). PDFs/videos untouched. Print per-folder + total size report.

**Evidence builder** — for each folder, build evidence items (preserve existing, dedupe by `src`):
- image → `{ "type":"image", "src":"<folder>/<name>.webp", "caption":"" }`
- pdf (≤95 MB) → `{ "type":"pdf", "src":"<folder>/<file>.pdf", "caption":"" }`
- video → `{ "type":"video", "src":"<folder>/<file>", "caption":"▶ YouTube upload pending",
  "youtubePending":true }`
- **Write NO descriptions/titles/dates.**

### 4a. Numbered folders → same-id entry (MERGE evidence)
`public/proof/78` → entry 78 · `79` → 79 · `83` → 83 · `98` → 98 (keep Solsavi PDF) ·
`126` → 126 · `127` → 127.

### 4b. Named folders → ATTACH to existing entry (MERGE evidence, do NOT create new)
| Folder (exact name) | Attach to entry |
|---|---|
| `Chello Divas` | **42** (Chhello Divas – Stills + BTS) |
| `Diana` | **117** (Diana rescued) |
| `Iti music video` | **65** (The Other Woman ft. Iti) |
| `Jadi Duty` | **70** (Jadi Duty Brand Identity) |
| `Khyaal` | **60** (Tarikshir / Khayaal Patel) |
| `Kind Health` | **90** (KindHealth) |
| `Sameer Movie bts` | **121** (Sameer Movie BTS) |
| `Serena music video` | **84** (Miss Serena Nanawati music video) |
| `WOW` | **77** (Workshop on Wheels brand identity) |
| `Weddings` | **36** (Wedding shoots / Various clients) |
| `Haus Studio Aesthetics` | **76** (Haus of Pixels OPC) — home-studio build/work images |

### 4c. Named folders → CREATE NEW entry (ids = max(existing id)+1, sequential, computed live)
Create one new entry per folder below. Scaffold = the FULL field set every entry shares
(copy field names from any existing entry), with **only** `id`, `title`, `status`,
`evidenceSource`, `evidence` populated; everything else blank/zero/`[]` for Anirudh to fill:
```json
{
  "id": <next>, "year": <see note>, "date": "", "era": "", "eraName": "",
  "activityType": "", "title": "<from folder>", "role": "", "org": "", "location": "",
  "description": "", "evidenceSource": "Drive", "evidenceDetail": "",
  "earningsAmount": 0, "currency": "", "identityTag": "", "status": "Draft",
  "roleTags": [], "notes": "", "tags": [], "weekKey": "", "evidence": [ ...§4 items... ]
}
```
| Folder (exact name) | New title | year |
|---|---|---|
| `Dell TVC ad` | Dell TVC ad | "" |
| `Home Halt - brand and web development` | Home Halt — brand & web development | "" |
| `My village tea branding` | My Village Tea branding | "" |
| `Passport movie bts` | Passport (film) — BTS / unit stills | "" |
| `Swach Bharat Abhiyam - Documentation` | Swachh Bharat Abhiyan — documentation | "" |
| `Travel film - kalarigram mahashivratri celebration 2025` | Kalarigram Mahashivratri 2025 — travel film | 2025 |

> `status:"Draft"` flags these 6 as needing detail. **Note for Anirudh:** new entries won't
> appear in the 3D city until they're added to a building/cluster in `terrain.js`
> `STAGER_BUILDING_ENTRY` — that's a separate step (terrain.js is off-limits to this pass).

---

## 5. Task C — fix `scripts/optimize-gallery.mjs` for subfolders + regenerate

- Replace flat `readdirSync(SRC_DIR)` with a **recursive** walk of `public/proof/Gallery/**`
  collecting `.jpg/.jpeg/.png/.tif`. Keep id = lowercased basename; if basenames collide
  across subfolders, prefix the subfolder slug. Outputs stay in `public/gallery/{thumb,display}/`.
- Re-run `node scripts/optimize-gallery.mjs` (idempotent — only new photos encode).
- Regenerate `gallery.json` for new photos via the existing pipeline order:
  `extract-exif.mjs` → `enrich-gallery.mjs`. Set `location` = EXIF GPS else subfolder name
  else `"Unknown"`; add `collection` = subfolder name. **Merge** by basename — preserve the
  existing 269 entries' fields (esp. optimized `src`/`thumb`). Fabricate nothing (§1).

---

## 6. Task D — commit + push (with gate)

1. `git checkout -b asset-pipeline`.
2. Stage ONLY: `public/proof/**/*.webp`, `public/proof/**/*.pdf`, `public/gallery/**`,
   `data/ledger.json`, `data/gallery.json`, `scripts/optimize-proof.mjs`,
   `scripts/optimize-gallery.mjs`, `.gitignore`, `PROOF-LINKING-TODO.md`.
   Do NOT stage: dedup cruft scripts, `data/ledger-deduped.json`, `data/ledger.backup.json`,
   `*.prepipeline.bak`, any `*.md` handoff/plan docs, any raw source/video.
3. **PRE-PUSH GATE (mandatory):** abort if any staged blob > 95 MB, or any staged path under
   `public/proof/` matches `\.(jpe?g|png|tiff?|mp4|mov)$`.
4. Validate both JSON parse; `ledger.json` entry count = (live count) **+6 new**, all have `id`.
5. Commit message:
   ```
   Optimize proof → WebP, wire proof folders to entries (+6 new), fix gallery optimizer

   - scripts/optimize-proof.mjs (sharp → 2000px webp); raw sources gitignored
   - Numbered 78/79/83/98/126/127 + named folders attached per mapping; 6 new draft entries
   - Videos flagged youtubePending (local link kept; YouTube upload later)
   - optimize-gallery.mjs recurses the 10 gallery subfolders; gallery.json regenerated
     (locations from EXIF/subfolder only — none fabricated)
   - PROOF-LINKING-TODO.md summarizes wiring

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```
6. `git push -u origin asset-pipeline`. If the §6.3 gate tripped, do NOT push — report.

---

## 7. Acceptance criteria (NOT done until all pass)

- [ ] `node scripts/optimize-proof.mjs` runs clean; every raster proof image (excl Gallery)
      has a sibling `.webp`; prints before/after sizes.
- [ ] `node scripts/optimize-gallery.mjs` reports a photo count **> 0** (recursion fix proven).
- [ ] `gallery.json` has **zero invented locations** (spot-check 5 un-GPS'd → subfolder name
      or "Unknown").
- [ ] Numbered + named folders attached per §4 to the EXACT entries listed; entry 98 PDF kept;
      **no duplicate entries created** for attached folders.
- [ ] Exactly **6 new entries** exist (Dell TVC ad, Home Halt, My Village Tea, Passport BTS,
      Swachh Bharat, Kalarigram 2025), each `status:"Draft"`, blank description, evidence wired.
- [ ] Videos carry `youtubePending:true` with local `src`.
- [ ] `git diff --cached --stat` shows only webp/pdf/json/scripts/gitignore/md — **no raw
      image, no video, no file > 95 MB**.
- [ ] `data/ledger.json` + `data/gallery.json` parse; all entries have `id`.
- [ ] Branch `asset-pipeline` pushed (only if the gate passed).
- [ ] **Human verify (Anirudh):** `http://127.0.0.1:4173/?edit=1` → open entries 84/126 and a
      new draft → confirm webp renders and videos show "YouTube upload pending".

---

## 8. Surface back to Anirudh after the run

> 1. **20 videos** left as local `youtubePending` links → upload to YouTube, then set each
>    evidence `src` to the URL + `type:"youtube"`. The two >100 MB MUST go to YouTube/Blob.
> 2. **6 new draft entries** (status "Draft") need year/era/role/org/description filled in
>    `?edit=1`, and need adding to a building in `terrain.js STAGER_BUILDING_ENTRY` to appear
>    in the 3D city.
> 3. Defaults you may want to move: `Chello Divas`→42 (not the release 46), `Kind Health`→90
>    (not 91), `Weddings`→36 (not the new 135). Reassign in `?edit=1` if you meant the other.
