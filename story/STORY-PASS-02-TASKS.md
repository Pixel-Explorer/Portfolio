# STORY-PASS-02 — Autonomous build spec for OpenCode

> **Read `story/STORY-PASS-01-TASKS.md` first** — its §1 Guardrails and §2 Creative
> invariants still bind. Do not violate them. This pass FIXES the bugs found when
> a human ran pass-01 in a real browser, and BUILDS the infrastructure that lets a
> human tune the visuals fast (because you, the model, cannot see the screen).
>
> Branch: `story-mode-preloader`. Commit after every task. One task = one commit.
> Bump every `?v=story-pass-01` cache tag to **`story-pass-02`** (grep all of
> index.html + app.js; keep them consistent).

---

## 0. Why this pass exists — read this or you will repeat the same mistakes

Pass-01 shipped 12 commits of structurally-correct code. Then a human opened it in
Chrome and found it **did not run at all**: a single `const` referenced before its
declaration threw a `ReferenceError` that bricked both story mode and the 3D
archive. After that one-line fix, the film ran — but almost every *visual* value
(camera framing, orb size, the climax shot) was an unchecked guess, because the
model that wrote them never rendered a frame.

**The lesson, and the law for this pass:**

1. **A task is NOT done until `?story` loads in a browser with ZERO console
   errors and ZERO exceptions during a full scripted scrub through all beats.**
   You will build a `?selftest` harness (Group C) precisely so this can be checked
   in seconds. If you cannot run a browser yourself, you MUST still (a) build the
   harness, (b) statically reason about module load order and call-site/signature
   agreement, and (c) leave the harness green-by-construction.
2. **You cannot see. So stop hard-coding values that need eyes.** Every spatial /
   visual / timing number moves into `story/tuning.js` (Group B). A human will
   scrub them with the `?tune` panel. Your job is the machinery, not the
   aesthetics.
3. **Blind errors compile.** The pass-01 bug, a pivot-vs-node mixup, an
   `undefined → NaN`, a value-before-declaration — all pass a syntax check and die
   only at runtime. See §1 Known Pitfalls and check every one.

## 1. Known pitfalls — verify each before committing any task that touches them

- **Temporal dead zone:** never reference a `const`/`let` (e.g.
  `STAGER_BUILDING_ENTRY`) above its declaration. The pass-01 showstopper.
  (Already fixed in `terrain.js` — the map is assigned to `window.__storyRefs`
  AFTER its declaration. Do not move it back up. Do not re-introduce the pattern.)
- **pivot vs node:** reveal/rise/veer animate the **pivot** (`pivot.scale`,
  `pivot.position`). After `pivot.attach(node)`, the node's local transform is
  rewritten by Three.js to preserve world appearance. So "reset to original" must
  reset the **pivot** to scale (1,1,1), NOT push `node.scale` to the stored world
  scale. `dockBuilding` currently animates `node.scale` — a no-op at best; make it
  operate on the pivot.
- **undefined → NaN:** any `orig.<field> * k` where the field might be missing
  yields `NaN`, which silently corrupts a material/transform. Guard with `?? 0`.
- **view axis vs world axis:** the dolly-zoom currently dollies along world `+Z`.
  Camera motion must be along the **camera→target view axis**
  (`target.sub(pos).normalize()`), not a hard-coded world direction.
- **stage directions:** `[laughs]`, `[cough]`, `[soft]`, `[beat]` etc. are voice-
  actor cues. They must be stripped from BOTH TTS **and** on-screen subtitles
  (`/\s*\[[^\]]*\]\s*/g` → ' '). They are currently printed as captions.
- **hideAllBuildings reality:** pass-01 sets `node.visible=false` but the human saw
  the full city present at every beat. Verify it actually hides (the named nodes
  are `Object3D` with the mesh as a child — confirm the flag propagates, or hide
  the children too), or the "one hero at a time" reveal never happens.
- **subtitle occlusion:** the caption box is large and bottom-centered; at the
  arrival beat it covers the entire city reveal. Captions must never occlude the
  hero subject.

## 2. The pass-01 audit findings (what the human saw) — your fix targets

| # | Sev | Finding |
|---|-----|---------|
| 1 | fixed | TDZ ReferenceError bricked story + archive (already patched) |
| 2 | High | Camera framing untuned per beat: birth/graduation aim at empty black sky, hero building out of frame; film happens to frame well |
| 3 | High | Arrival (the climax) camera `[0,40,45]` is so far back the city is a distant speck, and the subtitle box covers it. The most important beat is the weakest. |
| 4 | Med | Orb is a huge plastic "beachball"; glow halo is a flat dark-navy disc (opacity 0.15, normal blend) = ugly dark donut on black. Not a photon/firefly. |
| 5 | Med | `hideAllBuildings` not hiding — full city present at all beats; staged reveal never happens |
| 6 | Med | Subtitles print raw stage directions `[LAUGHS]` `[SOFT]` `[BEAT]` `[CLEARS THROAT]` |
| 7 | Med | Letterbox bars skewed/tilted parallelogram, asymmetric, bottom often missing |
| 8 | Low | Color grade radioactive: `cream`/`acid_yellow` + lime plinth = nuclear green even at birth |
| 9 | Low | Blown-out white hotspot on plinth (orb point light clipping) |

## 3. How a human will verify your work (build for this)

Local: `node scripts/static-server.mjs` → `:4173`. Test URLs:
`?story`, `?archive`, `/` (mode select), and the NEW `?story&tune` and
`?story&selftest` you will build. Hard-refresh (Ctrl+F5).

Every task's **DoD** ends with: *"`?story` loads, plays through the affected
beat(s), zero console errors; `?archive` still boots identically."*

---

# TASKS

> Groups A–G. Do them in order within each group; groups can interleave only where
> noted. Aim: ~35 commits. This is sized for a 20–30 minute run — do the work
> fully, do not stub.

## GROUP A — Fix the 9 audit findings

### A1 — Make `hideAllBuildings` truly hide; verify staged reveal
Ensure future-beat buildings are actually invisible and only the active hero (plus
docked/reached past buildings) render. Hide children if the parent flag doesn't
propagate. Re-hide after the city GLB finishes loading (the load can re-show
nodes). DoD: at the birth beat only the hospital (and nothing else) is visible.
**Commit:** `story-pass2 A1: hideAllBuildings actually hides; staged reveal verified`

### A2 — Orb: from beachball to photon/firefly
In `orb.js`: shrink the core (~0.35 radius), replace the flat navy glow sphere with
an **additive** soft halo — a `SpriteMaterial` with `blending: THREE.AdditiveBlending`,
`depthWrite:false`, a radial-gradient canvas texture — sized ~3× the core, plus a
gentle pulsing scale. Tie point-light intensity to tuning (A6). Igniculus feel:
small bright core, soft additive bloom, slight drift wobble. DoD: orb reads as a
glowing particle on both black sky and in front of buildings — no dark disc.
**Commit:** `story-pass2 A2: orb additive halo sprite, smaller core, firefly feel`

### A3 — Strip stage directions from subtitles
In `ui.js showSubtitle` (and anywhere captions render), strip `/\s*\[[^\]]*\]\s*/g`.
Keep the TTS strip too. DoD: no `[...]` ever appears on screen.
**Commit:** `story-pass2 A3: strip stage directions from on-screen captions`

### A4 — Letterbox bars fixed & symmetric
Rebuild the letterbox as two `position:fixed` bars (top/bottom), full width,
animating **height** (CSS transition), never a transform that can skew. Equal
height top and bottom. DoD: level, symmetric bars that close on transitions and
ease open during a beat.
**Commit:** `story-pass2 A4: letterbox bars fixed, level, symmetric (height transition)`

### A5 — Caption never occludes the hero
Move the subtitle to a safe zone (lower third, max-width ~46ch, semi-opaque) and at
wide-establishing beats (arrival) anchor it to a corner or shrink it so the city
reveal is fully visible. Add a per-beat `subtitlePos` option read from tuning.
DoD: at arrival the full city is visible with the caption out of the way.
**Commit:** `story-pass2 A5: caption safe-zone + per-beat subtitle position`

### A6 — Tame lighting hotspot + tone the grade/plinth
Reduce orb point-light intensity/distance (into tuning), clamp so no blown
hotspot. Re-tune `ERA_COLORS`/`BG_COLORS` so `cream` reads warm-cream (not green)
and `acid_yellow` is ambitious-but-not-radioactive. Optionally desaturate the lime
plinth during story mode (lerp its material toward a neutral warm tone, restore on
handoff). DoD: birth reads warm and soft; no white hotspot; plinth not nuclear.
**Commit:** `story-pass2 A6: tame hotspot, warm grade, plinth toned for story`

### A7 — `dockBuilding` operates on pivot; fix dim
Rewrite `dockBuilding` to reset `pivot.scale → (1,1,1)` and lerp emissive to
`(_originalStates.emissiveIntensity ?? 0) * 0.15` guarded against NaN. Verify
reached buildings stay put and dim, never distort. DoD: scrub forward then back —
docked buildings are correctly sized and dimmed.
**Commit:** `story-pass2 A7: dockBuilding pivot-based reset + NaN-safe dim`

## GROUP B — Tuning infrastructure (the human's fast loop)

### B1 — `story/tuning.js` single source of tunable values
Create `story/tuning.js` exporting a `TUNING` object: per-beat
`{ camPos:[x,y,z], camTarget:[x,y,z], fov, establishMs, subtitlePos }`, plus global
`orb:{coreSize,haloScale,lightIntensity,lightDistance,falloffRadius,emissiveBoost,
lerpSpeed}`, `camera:{chaseLerp,microShake}`, `grade` overrides, `plinth:{tint}`.
Refactor `beat-data.js` + `story-engine.js` + `orb.js` + `camera-rig.js` to READ
from `TUNING` (fall back to existing beat values if a key is absent). Do not delete
beat-data's camera fields — `tuning.js` overrides them.
**Commit:** `story-pass2 B1: tuning.js central constants; modules read from it`

### B2 — Discovery v2: dump building WORLD positions
Extend the `?story&dumpnodes` dumper to also record each node's world position and
bounding-box size, and write them into `story/_glb-nodes.json` (`{name, pos:[x,y,z],
size:[w,h,d]}`). This gives camera framing real spatial data instead of guesses.
**Commit:** `story-pass2 B2: discovery dumps building world positions + bbox`

### B3 — Auto-seed camera framing from world positions
Add a helper `frameBuilding(worldPos, size)` → a sensible `{camPos,camTarget,fov}`
(offset back/up by a multiple of building size, target at building center). Seed
`tuning.js` defaults for every hero beat from B2's data so NO beat aims at empty
sky out of the box. Arrival/handoff get a wide framing that shows the whole city
large and centered (NOT pulled to a speck). DoD: birth, graduation, and arrival
all frame their subject without manual tuning.
**Commit:** `story-pass2 B3: auto-seed per-beat camera framing from world positions`

### B4 — `?story&tune` live panel
Build a desktop-only overlay (gated behind `?tune`): for the current beat, sliders/
number inputs for camPos x/y/z, camTarget x/y/z, fov, establishMs, plus the global
orb params; changes apply live to the scene. Buttons: **Copy this beat** (JSON to
clipboard) and **Copy all TUNING** (the whole object). Brutalist styling per
`typography.md`. This is how the human bakes good values back into `tuning.js`.
DoD: open `?story&tune`, drag a slider, see the camera move, copy JSON.
**Commit:** `story-pass2 B4: live ?tune panel with copy-to-clipboard`

## GROUP C — Self-verification harness (catch blind bugs)

### C1 — `?story&selftest` assertion mode
Build a mode that scripts a fast scrub through ALL beats (advance progress
programmatically, no waiting on audio) and asserts, logging a PASS/FAIL table to
console AND `window.__storySelftest`:
- every beat's `buildings[]` resolves to a real GLB node;
- `beat.explodeBuilding` (where set) resolves and has ≥1 entry via the entry map;
- no `NaN` in camera position/target/fov or any animated material after each beat;
- no orphaned pivots after the veer→return sequence;
- `dollyZoom` fires exactly once across a full run;
- the reached-set matches the beats visited;
- ZERO exceptions thrown during the whole scrub.
DoD: `?story&selftest` prints an all-PASS table.
**Commit:** `story-pass2 C1: ?selftest scripted assertion harness`

### C2 — Load-order & call-site static audit
Do a static pass: grep for any `window.__storyRefs.<field>` referenced before it's
assigned; verify every method the engine calls exists with a matching signature in
its module (list them); verify no `const`/`let` used above declaration in the files
you touched. Write findings into `story/PASS-02-NOTES.md`. Fix anything found.
**Commit:** `story-pass2 C2: static load-order/call-site audit + fixes`

## GROUP D — Beat expansion (14 → ~20 hero beats)

> The treatment called for 18–22 hero beats; pass-01 shipped 14. Add beats WITHOUT
> rewriting the approved VO — split existing VO at natural breaks and/or add short
> connective beats. Do NOT invent biographical facts (CLAUDE.md §14).

### D1 — Add beats & re-balance pacing
Propose and implement ~6 new beats, e.g.: split `graduation` into *first-paid-work*
and *photon-philosophy*; add a distinct *AIESEC/origin* beat (entry data exists);
add a *Rabble* beat (`Rabble building`, entry 100) between europe and pondi; add a
*now / empty-lot CTA* beat before `handoff` (the clean hire-me ask — NO profanity,
per invariant). Each new beat gets the FULL 5-layer schema (camera, orbState,
transitionIn, scoreCue, colorGrade, year, buildings). Recompute all
`progressRange` values so 2015–2021 stays dense and the ending LANDS (strong dwell
at now). Keep total ≈1200vh.
**Commit:** `story-pass2 D1: expand to ~20 beats, rebalance pacing, clean CTA beat`

### D2 — Year ticker + audio manifest for new beats
Add `year` labels and `VO_FILES` manifest entries for every new beat id (so the
human knows exactly which MP3s to render). Update `story/audio/README.md` list.
**Commit:** `story-pass2 D2: year labels + audio manifest entries for new beats`

## GROUP E — Motion & feature polish (the unverified stuff)

### E1 — Dolly-zoom along the true view axis
Rewrite `dollyZoom` to dolly along `(target − pos).normalize()` while FOV
counter-tweens; pull back along the view axis by a tuning distance. Fire-once guard
stays. Only on `film_fall`. DoD (human): on film_fall the background warps while
the subject stays roughly fixed — a real Vertigo.
**Commit:** `story-pass2 E1: view-axis dolly-zoom (true Vertigo) on film_fall`

### E2 — Transition grammar timing
Verify/repair: `flow` seamless; `veer` carries camera motion (no flash); `drain`
desaturates via ColorGrader before the fall; `break` = instant hard black + score
to 0 + hold + reveal; `bloom` whiteout. Ensure the `drain → break` two-step at
film_fall sequences correctly with the dolly. DoD: break is a true hard cut with
silence; everything else flows.
**Commit:** `story-pass2 E2: transition grammar timing (drain→break, hard-cut silence)`

### E3 — Explode-view real rendering at hero rests
Verify panels explode from the building's world anchor at the rest, show real
ledger fields (title/role/org/date/tags), and collapse (disposing geo/material)
before the next beat. Add the image slot: if `entry.evidence[0].src` is an image,
use it as the panel texture. DoD: at the pixelate/studio/film rests, readable cards
spill out and clean up; no mesh leak (check via selftest orphan count).
**Commit:** `story-pass2 E3: explode-view real ledger cards + image slot + leak-free`

### E4 — Deviation veer visible & clean
Verify Schoogle veers off-spine at `veer`, sits dim at `break`, returns and docks at
`film`; the camera is seduced off-axis to follow it. No orphaned pivot afterward
(selftest checks). DoD (human): a building visibly leaves the cluster and returns.
**Commit:** `story-pass2 E4: deviation veer (Schoogle off-spine→return) verified`

### E5 — Orb-lights-the-city + accumulation payoff
Now that hiding works (A1), verify proximity-brighten visibly lights revealed
buildings as the orb passes, suppressed at the two falls, and that explored count
scales the arrival reveal. Use tuning falloff/boost. DoD (human): moving the cursor
near a building brightens it; arrival is brighter the more you explored.
**Commit:** `story-pass2 E5: orb proximity-brighten + accumulation feeds arrival`

## GROUP F — Mobile teaser + audio

### F1 — Mobile teaser hardening
Verify the `?` mobile path runs the 2D teaser (no Three.js), condensed VO subset
from the manifest, particle-orb bound to scroll/tap, ends on a clean
"open on desktop" + copy-link card and an "enter 2D archive" fallback. Respect
reduced-motion. DoD: at <1024px the teaser plays; copy-link works; archive fallback
lands.
**Commit:** `story-pass2 F1: mobile teaser hardening (no-3D, copy-link, archive fallback)`

### F2 — Audio robustness
Confirm per-beat MP3 → plays; missing → TTS with stage directions stripped; score
bed loops & ducks per `scoreCue` (silence at falls, swell at sincere). No autoplay
lock (unlocked on the Play Film click). DoD: full run with zero MP3s is watchable;
dropping one beat's MP3 makes that beat use real audio.
**Commit:** `story-pass2 F2: audio robustness (manifest, ducking, no-asset fallback)`

## GROUP G — Final

### G1 — Reduced-motion + perf + handoff parity
Central reduced-motion gate (orb roam/shake, letterbox motion, auto-advance,
parallax). Hot path: no per-frame allocations (reuse scratch Vector3s), proximity
loop bounded to reached set, GSAP timelines killed on beat change. Re-verify
`_complete()`/`destroy()` restore FOV 10°, scene bg, all buildings visible, remove
orb/ambient/hemi/color-grader/overlays, land archive at radius 123.5 / polar
0.516π / az -0.001 / targetY 8.3. DoD: post-story `?archive` is pixel-identical to
a cold `?archive`; reduced-motion run is calm but complete; steady FPS.
**Commit:** `story-pass2 G1: reduced-motion, perf, handoff parity`

### G2 — Docs
Update `CLAUDE-STORY-MODE.md` (new beats, tuning.js, ?tune, ?selftest, all fixes).
Update `story/PASS-02-NOTES.md`: what shipped, what's stubbed, and the exact asset
list the owner must drop in (now ~20 MP3s — list every beat id, optional
score-bed, proof images per hero entry).
**Commit:** `story-pass2 G2: docs + PASS-02 handback notes`

### G3 — Final self-audit (the gate)
Run `?story&selftest` → must be ALL PASS. Load `?story` → scrub all beats → ZERO
console errors. Load `?archive` → parity. Re-read pass-01 §2 invariants and confirm
each in code. Remove/gate any temporary debug logs. Confirm all `?v=` tags are
`story-pass-02`. Record the green selftest output in PASS-02-NOTES.md.
**Commit:** `story-pass2 G3: final self-audit — selftest green, zero console errors, archive parity`

---

## Appendix — sizing note for the operator (Anirudh)
This is ~35 tasks/commits across 7 groups (vs pass-01's 12) — roughly 4× the
volume, which should keep the model busy ~20–30 min. The first thing to check when
it finishes is **`?story&selftest`** (all-PASS table) and **`?story` with the
console open** (zero errors) — those two catch the blind-bug class in seconds.
Then use **`?story&tune`** to scrub any beat that still frames poorly and paste the
copied JSON back into `story/tuning.js`.
