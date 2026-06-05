# STORY-PASS-03 — Focused corrective spec for OpenCode

> Read `STORY-PASS-01-TASKS.md` §1–§2 (guardrails + creative invariants) and
> `STORY-PASS-02-TASKS.md` §1 (known pitfalls) first — they still bind.
> This is a SMALL, targeted pass (~8–12 commits, ~10–15 min). The architecture,
> the fixes, and the tooling already exist. The film is one real problem away from
> watchable: **the cameras don't point at the buildings.** Fix that, wire the 4
> new beats, and verify.
>
> Branch `story-mode-preloader`. Commit per task. Bump every `?v=story-pass-02`
> cache tag to **`story-pass-03`** (grep index.html + app.js, keep consistent).

---

## 0. HARD GUARDRAILS — read before touching anything (pass-02 broke these)

When left unsupervised, pass-02 went out of scope and destroyed data. Do NOT repeat:

1. **Touch ONLY these paths:** `story/**`, `app.js`, `terrain.js`, `styles.css`,
   `index.html`. **NEVER** edit anything under `data/` (especially
   `data/gallery.json` — pass-02 fabricated locations for all 269 photos; it was
   reverted). **NEVER** edit `public/`, the GLB, or the ledger.
2. **NEVER install git hooks** or any persistent local config (`.git/hooks/*`,
   husky, etc.). Pass-02 installed a `pre-commit` hook; it was removed.
3. **NEVER invent facts** about Anirudh or his work. No new copy, no invented
   places/dates/titles. The VO in `beat-data.js` is approved and final.
4. A task is **not done** until `?story` loads with **zero console errors** and the
   affected beat visibly frames its subject. Use `?story&selftest` to check.
5. Commit messages must be accurate — pass-02's said "proof images" but added none.
   Describe exactly what changed.

## 1. Current state (verified in a real browser by the design lead)

**Already fixed in the working tree (DO NOT regress these):**
- `terrain.js`: `STAGER_BUILDING_ENTRY` assigned to `window.__storyRefs` AFTER its
  declaration (TDZ fix). Keep it after the declaration.
- `story/beat-buildings.js` `_findBuildingNode`: the guard is now
  `if (!node.name) return;` (was `if (!node.isMesh && !node.isGroup) return;`).
  The building parent nodes are **Object3D**, not Mesh/Group — the old guard made
  every hero building fail to resolve. Keep matching by name. (Apply the same
  reasoning anywhere else that filters nodes by `isMesh/isGroup` — e.g.
  `revealAllBuildings` around line ~267 has the same guard and should also match
  Object3D building parents.)

**Working:** orb (additive photon halo), clean captions (stage directions
stripped), level letterbox, toned grade, `tuning.js`, `?story&tune` panel,
`?story&selftest` harness, 18 beats, zero console errors on load.

**Broken / incomplete (this pass fixes):**
- **Cameras point at empty space.** Beat cameras are still hand-guessed and do not
  match building world positions. Example: birth targets `(-4,3,-8)` but the
  Hospital is at `(2.55, 0, 3.91)`. Every hero beat frames wrong. THIS IS THE MAIN
  TASK.
- New beats `photon`, `aiesec`, `rabble`, `cta` are missing `audio-manifest`
  entries and `tuning` entries (the node selftest WARNs about exactly these).
- Ledger entry `id:86` resolves to `title: undefined` → one blank explode card.
- `?selftest` building-resolution checks were failing due to the (now-fixed)
  finder bug; re-run should pass — update/confirm.

## 2. GROUND TRUTH — real building world positions (measured live from the GLB)

Use these to compute camera framing. Units are world units; the whole city is
small (~25 units across) and sits at **Y≈0** (NOT the Y≈3–8 the old beats assumed).

| Beat | Building (key) | World pos (x, y, z) |
|---|---|---|
| birth | `Hospital_Building_n3d` | 2.55, 0.00, 3.91 |
| graduation | `BBA-ITM` | 3.95, 0.00, 2.11 |
| aiesec | `AIESEC` | 2.24, 0.00, 2.18 |
| veer | `Schoogle` | 12.89, 0.00, -5.54 |
| film | `Movies` | 0.58, 0.00, -0.95 |
| film | `Corporate Filims` | 5.40, 0.00, -2.96 |
| pixelate | `Pixelate` | 2.36, **-6.69**, -5.62 (tall-tower origin offset — see note) |
| studio | `Haus of Pixels` | -5.67, 0.00, 4.43 |
| studio | `Haus work block` | -13.14, 0.00, 14.44 |
| europe | `Buddy Tales` | -4.17, 0.00, 1.63 |
| europe | `KH` | -7.78, 0.00, 3.31 |
| rabble | `Rabble building` | -3.66, 0.00, -3.51 |
| pondi | `Remote Stations-Homes` | -7.09, 0.00, -3.10 |
| arrival/cta | (whole city) | center ≈ 0.3, 0, -3.0; spans X[-13,13] Z[-6,14] |

**Pixelate Y note:** its node origin is below ground (-6.69) because of how the
tall tower was authored. Do NOT target Y=-6.69 (aims underground). Target the
building's **bounding-box center**, or clamp target Y to `max(0, nodeY) + halfHeight`.

## 3. TASKS

### P1 — Confirm the two applied fixes; same-class audit
Verify the TDZ fix and the `_findBuildingNode` name-match fix are present and not
regressed. Grep all of `story/**` + `terrain.js` for `isMesh && !node.isGroup`
guards that filter building parents and relax them to match Object3D-by-name where
they're used to find/reveal hero buildings (esp. `revealAllBuildings`). DoD:
`?story&selftest` shows every beat's `building '<name>' resolves` as **PASS**.
**Commit:** `story-pass3 P1: confirm finder/TDZ fixes; relax Object3D guards in reveal paths`

### P2 — Real `frameBuilding()` and bake correct camera framing (THE main task)
In `story/tuning.js` (or a helper it imports), implement:
```
frameBuilding(worldPos, {azimuthDeg=35, distance=14, height=6, lookHeight=3}) →
   { camTarget:[x, max(0,worldPos.y)+lookHeight, z],
     camPos:[ x + distance*sin(az), max(0,worldPos.y)+height, z + distance*cos(az) ],
     fov: 40 }
```
i.e. target the building (at a sane height above ground), place the camera a fixed
distance back/up at a cinematic azimuth. Then set BEAT_TUNING camera values for
**every hero beat** from the §2 positions via this helper. Vary azimuth/distance
per beat for visual interest (don't make them identical), but each MUST keep its
building comfortably on-screen. Multi-building beats (film, studio, europe) frame
the midpoint of their buildings with enough distance to fit both. DoD: birth,
graduation, aiesec, veer, film, pixelate, studio, europe, rabble, pondi each show
their building(s) clearly centered-ish. No empty-sky beats.
**Commit:** `story-pass3 P2: frameBuilding() + correct per-beat camera framing from real world positions`

### P3 — Arrival & CTA wide framing of the whole city
`arrival` and `cta` must frame the WHOLE city, large and centered (pass-01/02 pulled
it to a distant speck). Compute from the city center (≈0,0,-3) and span (~15 radius):
camera back ~28–34 and up ~16–20 at FOV ~40, target the city center at ~y4. The
caption must NOT occlude the city (use the `subtitlePos`/corner mode from pass-02
A5). DoD: at arrival the glowing city fills the frame and the caption is clear of it.
**Commit:** `story-pass3 P3: arrival/cta wide city framing, caption clear of subject`

### P4 — Wire the 4 new beats (audio + tuning)
Add `VO_FILES` manifest entries for `photon`, `aiesec`, `rabble`, `cta` (paths
`story/audio/<id>.mp3`) and update `story/audio/README.md`'s file list. Add
BEAT_TUNING entries for any new beat missing one (`photon` at minimum). `photon`
and `cta` have no building — give them a sensible framing (photon: a contemplative
push on the orb over the city; cta: the clean wide city + CTA, no profanity). DoD:
the node selftest (`node story/selftest-precommit.js`) prints **no WARN** about
missing manifest/tuning entries.
**Commit:** `story-pass3 P4: wire photon/aiesec/rabble/cta into audio manifest + tuning`

### P5 — Fix the blank explode card (entry id:86)
In `explode-view.js`, when an entry field is missing (e.g. id:86 `title:undefined`),
fall back gracefully (use `role`/`org`/`"Project"` and skip empty lines) so no blank
card renders. Do NOT edit `data/` to fix the entry — handle it in the view. DoD:
the film-beat explode shows no blank/empty card.
**Commit:** `story-pass3 P5: explode-view graceful fallback for missing entry fields`

### P6 — Re-verify hide/reveal across all beats
Now that the finder works and hiding is real, confirm: future buildings are hidden,
the active hero reveals, past buildings stay docked+dim (accumulation). Walk every
beat. Fix any building that fails to appear or fails to hide. DoD: scrub all 18
beats — each hero building appears only from its beat onward; no building is missing
at its own beat.
**Commit:** `story-pass3 P6: verify hide/reveal/accumulation across all 18 beats`

### P7 — Add an automated framing assertion to `?selftest`
Add a check that, for each hero beat, projects the building's world position through
a camera set to that beat's tuning and asserts it lands on-screen (NDC |x|<0.85 and
|y|<0.85, and z in front). This catches "camera points at empty sky"
**automatically** — the exact failure that needed a human this pass. Log PASS/FAIL
per beat. DoD: `?story&selftest` framing checks are all PASS after P2/P3.
**Commit:** `story-pass3 P7: selftest framing assertion (building projects on-screen per beat)`

### P8 — Orb lights revealed buildings; final tone
Confirm the orb's proximity-brighten visibly lifts a building's emissive as it
passes (pass-02 A-series + tuning falloff/boost). Ensure the orb's point light
actually reaches buildings (distance/intensity from tuning) without the blown
hotspot. Keep the plinth subtle but not invisible. DoD: moving the cursor near a
revealed building brightens it; no blown hotspot; plinth readable.
**Commit:** `story-pass3 P8: orb proximity-brighten verified + final light/plinth tone`

### P9 — Final gate
`?story&selftest` → ALL PASS (resolution + framing). `?story` → scrub all beats →
zero console errors, every hero beat frames its subject. `?archive` → pixel-identical
to a cold load (handoff parity). Re-read pass-01 §2 invariants; confirm the clean
(no-profanity) CTA landing. Remove temporary debug logs. Confirm all `?v=` tags are
`story-pass-03`. Update `CLAUDE-STORY-MODE.md` + `story/PASS-03-NOTES.md` (what
shipped; the asset list: ~18 MP3s by beat id + optional score-bed; proof images per
hero entry). Record the green selftest output in the notes.
**Commit:** `story-pass3 P9: final gate — selftest green, framing correct, archive parity, docs`

## 4. After OpenCode finishes (for Anirudh + the design lead)
1. Open `?story&selftest` → expect all-PASS (resolution AND framing).
2. Open `?story`, scroll through → each hero beat should show its building.
3. Use `?story&tune` to nudge any beat whose framing is technically on-screen but
   aesthetically off; copy the JSON back into `tuning.js`. P2 gets framing correct;
   the panel makes it beautiful.
