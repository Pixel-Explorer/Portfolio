# STORY-PASS-04 — Polish + hard isolation spec for OpenCode

> Read `STORY-PASS-01-TASKS.md` §1–§2 and `STORY-PASS-03-TASKS.md` §0–§1 first —
> all guardrails, invariants, and the "current state" notes still bind.
> This is a SMALL polish pass (~8 commits, ~10 min). Pass-03 fixed camera framing
> (every hero building now projects on-screen) — DO NOT regress that. This pass
> makes the framings *pretty*, tones the plinth, removes a stray orb, enforces
> hero-only reveal, and is wrapped in a hard isolation guard because pass-02 AND
> pass-03 both edited `data/` despite explicit bans.
>
> Branch `story-mode-preloader`. Commit per task. Bump `?v=story-pass-03` →
> **`story-pass-04`** everywhere (index.html + app.js).

---

## 0. HARD ISOLATION — non-negotiable, self-policing

Pass-02 fabricated all 269 gallery photo locations; pass-03 wrote `_recover.mjs` to
**re-apply that fabrication after it was reverted.** Prose bans did not hold. So:

1. **You may ONLY create/modify files under:** `story/**`, and edit `app.js`,
   `terrain.js`, `styles.css`, `index.html`. Nothing else. Full stop.
2. **`data/`, `public/`, the GLB, the ledger, the gallery are OFF LIMITS.** Do not
   read-then-rewrite them, do not "recover" them, do not write scripts that touch
   them. There is no scenario in this pass where editing them is correct.
3. **P0 snapshots them; P7 verifies they are byte-identical and auto-reverts any
   change.** If P7 finds a diff, that is YOUR bug — revert it and note it.
4. Do not create top-level scratch files (`_recover.mjs`, etc.). Temp files go in
   `story/` and are removed before the final commit.

(The operator is also running you in an isolated worktree this time. Both walls
apply.)

## 1. Don't regress pass-03's wins

- `_findBuildingNode` matches by `node.name` (building parents are Object3D).
- `STAGER_BUILDING_ENTRY` assigned to `__storyRefs` AFTER its declaration (no TDZ).
- `frameBuilding()` + per-beat camera tuning put every hero building on-screen.
- Verify all of the above still hold at the end (P7).

## 2. TASKS

### P0 — Snapshot off-limits trees (self-policing guard)
Add `story/_guard-snapshot.json` recording the git blob hashes (or sha256) of every
file under `data/` and `public/` at the start of this pass (use `git ls-files -s
data/ public/` output, committed). This is the baseline P7 checks against.
**Commit:** `story-pass4 P0: snapshot data/ + public/ hashes for end-of-pass integrity check`

### P1 — Baseline verification (no code change beyond cache bump)
Bump cache tags to `story-pass-04`. Confirm `?story` loads with zero console errors
and `?story&selftest` building-resolution + framing checks are green BEFORE you
change anything. Record the baseline in `story/PASS-04-NOTES.md`.
**Commit:** `story-pass4 P1: cache bump story-pass-04 + baseline selftest green`

### P2 — Lift hero framings into the upper-middle, clear of the caption
Today hero buildings project low (NDC.y ≈ −0.3 to −0.64) — several sit in or near
the caption's lower-third. Adjust `frameBuilding()` (and re-bake BEAT_TUNING) so a
single hero building lands at **NDC.y ≈ −0.15 to +0.30** (upper-middle, room for the
caption below and sky above) and **|NDC.x| < 0.4** (roughly centered). Do this by
lowering camera height and/or raising `lookHeight` and tuning distance — keep FOV
~40. DoD: re-run the framing projection; every single-building beat sits in that
window.
**Commit:** `story-pass4 P2: lift hero framings to upper-middle, clear of caption`

### P3 — Multi-building beats fit all subjects
`film` (Movies/Corporate Filims/Schoogle), `studio` (Haus of Pixels at -5.7,4.4 +
Haus work block at -13.1,14.4 — ~13 units apart), `europe` (Buddy Tales/KH): frame
the **bounding center** of the beat's buildings and pull the camera back enough that
ALL of them land within **|NDC| < 0.7**. (Studio currently spreads to ±0.6 — widen
distance or recenter.) DoD: framing projection shows every building of these beats
within ±0.7.
**Commit:** `story-pass4 P3: multi-building beats frame all subjects within bounds`

### P4 — Tone the plinth during story mode
The lime archive plinth (`#C5E03A`) reads radioactive-green under the story grade
(esp. birth/cream). During story init, lerp the plinth material color toward a warm
neutral (e.g. desaturate ~70% toward `#1a1814`/a warm grey), and **restore the
original on `_complete()`/`destroy()`** so archive mode is unchanged. Read the target
tint from `tuning.js`. DoD: birth plinth is a calm warm ground, not nuclear green;
`?archive` plinth is still the original lime.
**Commit:** `story-pass4 P4: desaturate plinth in story mode, restore on handoff`

### P5 — Remove the stray second orb
A faint second cyan dot appears (e.g. upper-right at the birth beat). Find its source
— a duplicate orb mesh, a leftover `PointLight`, a selftest-scrub artifact, or the
orb's trail/halo rendering twice — and remove it so exactly ONE orb renders. DoD:
only one orb visible at every beat; `scene` contains a single orb group.
**Commit:** `story-pass4 P5: remove stray duplicate orb/light`

### P6 — True hero-only reveal (accumulation intact)
At a hero beat, only the **active** building(s) + already-**reached** (docked, dim)
ones should be visible; all other city buildings stay hidden until reached.
Currently other buildings show faintly at birth. Make `hideAllBuildings` hide every
named building node except active/reached (decorative trees/cars may stay or be
hidden — your call, but be consistent). Keep `revealAllBuildings` for the arrival
beat (matches Object3D parents). DoD: at birth only the Hospital + orb render; by
arrival the whole city is up.
**Commit:** `story-pass4 P6: enforce hero-only reveal; accumulation preserved`

### P7 — Final gate + integrity check
1. `?story&selftest` → resolution + framing ALL PASS (framing now also asserts the
   upper-middle window from P2 and the ±0.7 bound from P3 — tighten the assertion).
2. `?story` → scrub all 18 beats → zero console errors; each hero beat frames its
   subject in the new window; one orb; toned plinth; hero-only reveal.
3. `?archive` → pixel-identical to cold load (plinth restored, FOV 10°, handoff
   parity).
4. **Integrity:** recompute `data/` + `public/` hashes and compare to
   `story/_guard-snapshot.json`. They MUST match. If anything differs, revert it
   (`git checkout -- <path>`) and record it in PASS-04-NOTES.md as a caught
   violation. Remove any temp/scratch files.
5. Update `CLAUDE-STORY-MODE.md` + `story/PASS-04-NOTES.md`. Confirm all `?v=` tags
   are `story-pass-04`.
**Commit:** `story-pass4 P7: final gate — framing window, one orb, toned plinth, hero-only, data/public integrity verified`

## 3. After OpenCode finishes (operator)
- `?story&selftest` → all green (now incl. tightened framing window).
- Scrub `?story` → buildings sit higher, plinth calm, one orb, only hero visible.
- `?story&tune` for any final aesthetic nudge.
- Confirm `git status` shows **no changes under `data/` or `public/`** — if it does,
  P7's integrity check failed and OpenCode broke isolation again.
