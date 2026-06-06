# STORY-PASS-01 — Autonomous build spec for OpenCode

> **You (OpenCode) are the implementer. This file is your contract.**
> Architecture, sequencing, and acceptance criteria were set by the project's
> design lead (Claude/Anthropic) with the owner Anirudh. Execute the tasks in
> order. Do not skip the discovery task. Commit after every task so a long
> unattended run stays bisectable.
>
> Branch: `story-mode-preloader`. Do all work here. Do NOT merge to master.

---

## 0. How to use this document

- Work tasks **T0 → T11 in order**. Each task lists: **Why → Files → Steps →
  Self-check → Commit**.
- **Commit after each task** with the exact message given. One task = one commit.
- If a step is genuinely ambiguous, take the **fallback** written in that step.
  Never stall waiting for input — this is an unattended run.
- After each task, run the **Self-check**. If it fails, fix before committing.
- Read these three repo files once before starting and obey them:
  `CLAUDE.md` (project law), `design.md` (visual/motion law),
  `CLAUDE-STORY-MODE.md` (current story architecture).
- Cache-busting: this app has no bundler; browser loads modules with `?v=` query
  strings. When you touch `app.js`, `terrain.js`, `styles.css`, or the dynamic
  `story-engine.js` import, bump **every** `?v=time-machine-r15` /
  `?v=story-pass-01` occurrence to a single consistent tag: **`story-pass-01`**.
  Grep for `time-machine-r15` and replace all. (index.html has 3, app.js has 2-3.)

## 1. Non-negotiable guardrails (from CLAUDE.md §14)

1. **Do not break Archive Mode.** `?archive` and the post-story handoff into the
   3D cluster must keep working exactly as today. Story code is additive.
2. **No React. No bundler. No new heavy deps.** Vanilla JS + ES modules +
   Three.js 0.164 (import map) + GSAP only. If you need a helper, write it.
3. **GSAP rule (hard-won bug, see CLAUDE.md Pass 11):** animate **transform
   only, never opacity**, with GSAP on overlays/reveals. Opacity is owned by CSS
   `.visible` / inline style transitions. A stalled GSAP opacity tween strands
   overlays see-through. For scene-object material fades, GSAP on material props
   is fine (that's how archive does year-window).
4. **Evidence-backed only.** Do not invent facts about Anirudh. All copy already
   exists in `story/beat-data.js` (the approved VO). Do not rewrite the VO.
5. **Token/scope discipline:** don't rebuild working modules from scratch; extend
   them. Don't regenerate `data/`, the GLB, or the gallery.
6. Desktop ≥1024px is the showcase; mobile gets the teaser (T9), not the 3D film.

## 2. Creative invariants — the soul. Do NOT sand these off.

These are *why* the piece works. If an implementation choice conflicts with one,
the invariant wins.

- **Light is the theme.** The viewer's cursor is a photon (the orb / Igniculus).
  A man who chased light built a city of light; the viewer *becomes* the light
  moving through it. Every system (orb, score, color) hangs off this nail.
- **The orb is silent; the narrator is the voice.** Never give the orb speech.
- **Transitions are grammar, not novelty** (see T6). Invisible transitions for
  continuity (a life feels continuous); visible ruptures ONLY at the falls.
- **Score the sincere, mute the jokes.** Music swells under the sincere lines
  (photon monologue, the compiled-city landing); jokes ride near-silence so the
  comic timing lands; the falls go fully silent.
- **Hard cut + silence is reserved for the two falls** (`break`, `film_fall`).
  Everything else dissolves/flows.
- **The dolly-zoom (Vertigo push) is used exactly ONCE** — on `film_fall`. Once
  is devastating; repeated it's a gimmick.
- **The arc builds toward NOW.** The arrival at the city is the loudest quiet
  moment and the hire-me ask. The ending lands clean — no profanity, no joke at
  the final beat.
- **Accumulation:** buildings you've passed stay part of the city (dimmed), they
  don't vanish. The city assembles as you scroll; your light keeps it lit.
- **Deviation geography:** the non-linear career is rendered as a building that
  physically leaves the city spine and returns (the NID/freelance veer).

## 3. Verify-as-you-go

Local dev: `node scripts/static-server.mjs` serves on `:4173`. No live reload —
hard-refresh (Ctrl+F5). Test URLs:

- `http://127.0.0.1:4173/?story`   → straight into story mode
- `http://127.0.0.1:4173/?archive` → straight into archive (must still work)
- `http://127.0.0.1:4173/`         → mode-select overlay

For anything you cannot verify visually in an unattended run, your Self-check is
code-level: module imports resolve, no thrown errors on load, the function/field
exists, grep confirms the wiring. Where a browser is available to you (headless
or Claude Preview), load `?story` and assert **zero console errors** and that
`window._storyEngine` exists after boot.

---

# TASKS

## T0 — Discovery + safety net  *(do this first, always)*

**Why:** Every downstream task depends on knowing the real GLB node names and on
a baseline that proves story + archive both boot. The biggest failure mode of a
long run is building beat logic against building names that don't exist.

**Files:** new `story/_glb-nodes.json` (gitignored is fine, but commit it — it's
small and useful), read-only on `terrain.js`.

**Steps:**
1. Add a one-shot debug dump: when `?story&dumpnodes` is in the URL, after the
   city GLB loads, traverse `stagerCityComposition` and `console.log` + download
   a JSON array of every node `{name, type, isMesh, childCount}`. Save the output
   to `story/_glb-nodes.json`. (If you can run a headless browser, capture it
   programmatically; otherwise add the dumper, run the server, and fetch it.)
2. Reconcile `story/beat-data.js` `buildings:[]` arrays against the **canonical
   keys** in `terrain.js` `STAGER_BUILDING_ENTRY` (lines ~3392-3428) AND against
   the dumped node names. Note GLTF sanitizes spaces→underscores; the existing
   fuzzy matcher in `beat-buildings.js _findBuildingNode` handles that, but the
   names in beat-data should still be real keys. Fix any that don't resolve.
   - Known-good keys you will use: `Hospital_Building_n3d`, `BBA-ITM`, `Movies`,
     `Corporate Filims` (sic), `Pixelate`, `Haus of Pixels`, `Haus work block`,
     `Buddy Tales`, `KH`, `Remote Stations-Homes`, `Schoogle`.
   - The `veer`/NID beat currently has `buildings:[]`. It needs the
     deviation building — wire it to **`Schoogle`** (entry 37, the NID-era exit
     per CLAUDE.md scene 03). T5 animates the veer; here just verify the node
     exists. Fallback if `Schoogle` not in GLB: leave `[]` and T5 spawns a
     placeholder prism.
3. Expose data the story modules will need (T3/T7 depend on this):
   - In `terrain.js`, attach the building→entry map to story refs:
     `window.__storyRefs.buildingEntryMap = STAGER_BUILDING_ENTRY;`
   - In `app.js`, attach an entry lookup so story modules can resolve proof
     content: `window.__storyRefs.getEntryById = (id) => entriesById.get(id)`
     (build a `Map` from the loaded `entries` once). Fallback: attach the whole
     `entries` array as `window.__storyRefs.entries`.

**Self-check:** `?archive` still boots to the cluster with no console errors.
`?story` boots, the city loads, and a quick log confirms each hero-beat building
name resolves to a node (add a temporary `[story] resolved <name>` log in
`_findBuildingNode`; remove before commit or gate behind `?debug`).

**Commit:** `story-pass T0: GLB node discovery, beat-data name reconciliation, expose building/entry refs`

---

## T1 — Audio: per-beat MP3 manifest + AudioManager rewrite

**Why:** Browser TTS reading `[cough]`/`[burp]` aloud is the #1 thing keeping
this a tech demo. Decision locked: **per-beat 11Labs MP3s**, TTS as dev fallback.

**Files:** new `story/audio-manifest.js`, new `story/audio/` dir (with a
`README.md` naming the expected files), rewrite `story/audio-manager.js`, edit
`story/story-engine.js` (rest trigger now keys off audio end).

**Steps:**
1. Create `story/audio-manifest.js` exporting:
   ```js
   export const VO_FILES = {
     boot: 'story/audio/boot.mp3', meta: 'story/audio/meta.mp3',
     birth: 'story/audio/birth.mp3', graduation: 'story/audio/graduation.mp3',
     veer: 'story/audio/veer.mp3', break: 'story/audio/break.mp3',
     film: 'story/audio/film.mp3', film_fall: 'story/audio/film_fall.mp3',
     pixelate: 'story/audio/pixelate.mp3', studio: 'story/audio/studio.mp3',
     europe: 'story/audio/europe.mp3', pondi: 'story/audio/pondi.mp3',
     arrival: 'story/audio/arrival.mp3', handoff: 'story/audio/handoff.mp3',
   };
   export const SCORE_BED = 'story/audio/score-bed.mp3'; // optional ambient loop
   ```
   Add `story/audio/README.md`: "Drop 11Labs renders here, named `<beatId>.mp3`
   (14 files, ids from beat-data.js). Optional `score-bed.mp3` = looping ambient
   music bed. Missing files fall back to browser TTS automatically."
2. Rewrite `AudioManager`:
   - `speakBeat(beatId, beat, { onStart, onEnd })`: if `VO_FILES[beatId]` loads
     (HTMLAudioElement; `canplaythrough` or successful `play()`), play it; fire
     `onStart` on `playing`, `onEnd` on `ended`. If the file 404s or errors,
     **fall back to the existing `speak(beat.voText)` TTS path** so the run is
     always testable without assets. Keep `[ ... ]` stage directions OUT of TTS
     by stripping `/\[[^\]]*\]/g` from `voText` before TTS (they're for the human
     voice actor, not the robot).
   - Score bed: load `SCORE_BED` into the existing Web Audio `_bgGain` (loop). If
     missing, silent — fine. Keep `duckScore()`/`swellScore()`.
   - **Score-the-sincere / mute-jokes:** add `setScoreMood(cue)` mapping
     `beat.scoreCue` → bed gain target: `silence`→0 (the falls),
     `piano|acoustic|cinematic|full`→swell (sincere), everything else→low duck
     (jokes ride near-silence). Ramp over ~0.6s.
   - First user gesture must unlock audio (autoplay policy): resume `AudioContext`
     and kick playback on the first `pointerdown`/`wheel`/`keydown` (the
     mode-select "Play Film" click already counts — wire the unlock there).
3. In `story-engine.js _enterBeat`: replace the `this.audio.speak(...)` block with
   `this.audio.speakBeat(beat.id, beat, { onStart, onEnd })`. The `onEnd` still
   decides rest (but rest UX is rebuilt in T2). Drive `setScoreMood(beat.scoreCue)`
   on enter.

**Self-check:** With no MP3s present, `?story` runs end-to-end on TTS with stage
directions stripped. Drop one real file (or a silent test mp3) named `birth.mp3`
and confirm it plays at the birth beat instead of TTS. No console errors.

**Commit:** `story-pass T1: per-beat MP3 manifest + AudioManager (HTMLAudio VO, TTS fallback, score-mood ducking)`

---

## T2 — Scroll pacing rebuild (~1200vh) + scroll-gated rests

**Why:** Current scroll height is `3×innerHeight` for 14 beats — a speedrun. The
brief calls for ~1100-1300vh with dwell at the rests. Rests should be an exhale
the user controls, not a 3s auto-timer.

**Files:** `story/scroll-manager.js`, `story/story-engine.js`, `story/ui.js`,
`styles.css` (rest indicator).

**Steps:**
1. In `ScrollManager.init`, set total scroll height to **`12 * window.innerHeight`**
   (≈1200vh). Recompute on resize (debounced). Keep progress = scrollY/maxScroll.
2. Add light scroll smoothing: lerp the reported progress toward raw scroll in the
   RAF tick (factor ~0.08) so camera/orb motion reads like film, not a jump-cut.
   Expose the smoothed value to `onProgress`. (This is the deferred-Lenis feel,
   hand-rolled — do NOT add the Lenis dependency.)
3. **Soft scroll-gated rests** (robust for unattended build; do NOT hard-lock
   window scroll mid-scroll — that's fragile):
   - The rest beats already have wide `progressRange` bands. On a rest beat, when
     VO `onEnd` fires, show the rest indicator ("↓ scroll to continue") AND
     gently resist forward progress: clamp the *consumed* beat-local progress so
     the camera holds its framing through the rest band even as the user keeps
     scrolling a little (i.e., the hold occupies real scroll distance). Release
     naturally when the user scrolls past the band.
   - The score drops and the orb calms during a rest (wire via existing state).
   - Keep beat 0 `boot` as the only true `scroll.lock()` (auto-advance handoff).
4. Rest indicator polish in `ui.js` + `styles.css`: subtle, bottom-center, mono
   caps per `typography.md`, fades in after VO ends, fades out on scroll. Remove
   the 3000ms `setTimeout` auto-release in `_startRest` — rest ends on scroll, not
   a timer (but keep a long safety timeout ~12s so it can never deadlock).

**Self-check:** Total page scroll is ~12 viewports. Scrolling through plays all 14
beats with visible dwell at rest beats; the camera holds during a rest then
resumes. `?archive` unaffected (story scroll height is only applied in story mode;
ensure `ScrollManager` cleanup restores `body.minHeight`).

**Commit:** `story-pass T2: 1200vh scroll, progress smoothing, scroll-gated rests`

---

## T3 — Building model: accumulation (dock, don't throw) + 3-tier visibility

**Why:** Current `moveToSkyline` flings the previous hero to radius 80 and shrinks
it — that fights the "city assembles + accumulates" invariant. Buildings the user
has passed must stay, dimmed, in their true city positions.

**Files:** `story/beat-buildings.js`, `story/story-engine.js`.

**Steps:**
1. Replace `moveToSkyline(name)` usage with **`dockBuilding(name)`**: animate the
   hero pivot from its dramatic framing back to its **original archive transform**
   (you already store `_originalStates`), and lower its material emissive /
   nudge toward desaturated-dim (a "reached but resting" look). Keep `visible`.
   No radius-80 throw, no shrink-to-0.3. The building stays as part of the city.
2. Formalize 3-tier visibility, applied on every `_enterBeat`:
   - **Future** (buildings of beats not yet reached): `visible = false` (preserve
     the dramatic first reveal).
   - **Active** (current beat's `buildings`): hero animation (reveal/rise/veer),
     bright.
   - **Reached** (any hero building from a past beat): visible + docked + dimmed
     (T4 lets the orb re-brighten them on proximity).
   Track reached buildings in a `Set` on the engine.
3. Fix `revealAllBuildings` (it has a real bug: `Object.keys(... children?.[0]
   ?.children || {})` treats a Three.js children array as an object). Rewrite to
   traverse `stagerCityComposition`, collect named building nodes (skip
   `Tree`/`Car`/`Contact`/composition root), and scale-in any not-yet-revealed
   ones with stagger. At the arrival beat this completes the city.
4. Ensure `dockBuilding`/reveal use GSAP on **transform + material emissive**
   (allowed for scene objects), never on a CSS overlay's opacity.

**Self-check:** Scroll forward through several hero beats, then back — passed
buildings remain in the city (dimmed), not flung away. Arrival reveals the
remaining city. No NaN transforms in console.

**Commit:** `story-pass T3: building accumulation (dock not throw), 3-tier visibility, fix revealAllBuildings`

---

## T4 — Orb lights the city (the payoff mechanic)

**Why:** This is the thesis made interactive — the viewer's photon illuminates the
work. Right now the orb is a roaming PointLight over hidden buildings, so nothing
lights up.

**Files:** `story/orb.js`, `story/story-engine.js`, optionally `terrain.js`
(only if you need a readable ambient floor — prefer adding a low hemisphere/ambient
inside story init and removing it on `_complete`).

**Steps:**
1. **Readable ambient base:** add a low ambient/hemisphere light during story mode
   so the city is never pitch black (a hiring manager must never hunt for the work
   in the dark). The orb is *additive* on top. Remove/restore on `_complete`.
2. **Proximity brighten:** in the engine `_tick`, for each **reached/active**
   building pivot (small set — do not iterate the whole GLB), compute distance
   from `orb.group.position` to the pivot world position. Within a falloff radius,
   raise that building's material `emissiveIntensity` (and a subtle specular kick
   — bump `metalness`/`envMapIntensity` or emissive only if simpler) proportional
   to closeness; ease back out when the orb leaves. Cache the building's base
   emissive so you can lerp to/from it. This is the "specular-on-glass as the
   light passes" demonstration of his craft.
3. **Filings-to-magnet (optional, cheap):** nearby decorative nodes (or the orb's
   own trail) drift slightly toward the cursor. Keep it subtle; skip if it costs
   frames.
4. **Falls = the light struggles:** at `break` and `film_fall` (orb states
   `flicker`/`dim`), suppress the proximity-brighten (the photon can't fully
   illuminate) and let the world stay grey. Recover at the next win beat.
5. **Accumulated light feeds the arrival:** track how many buildings the user
   lit; at `arrival`, the more they explored, the brighter/faster the full reveal
   (scale the reveal intensity or stagger by the explored count). Even at zero
   exploration it must still resolve fully.
6. **Reduced-motion + mobile:** if `prefers-reduced-motion`, disable orb roam,
   micro-shake, and proximity flicker (steady light only). On touch/no-cursor,
   bind the orb target to scroll progress along the beat path instead of mouse
   (T9 mobile teaser also relies on this fallback).

**Self-check:** Moving the cursor near a revealed building visibly brightens it
and fades back; at the two falls the brighten is suppressed; `prefers-reduced-
motion` yields steady light, no shake. 60fps holds (proximity loop only iterates
the reached set).

**Commit:** `story-pass T4: orb-lights-the-city (ambient base, proximity brighten, falls struggle, accumulation, reduced-motion)`

---

## T5 — Deviation geography (the veer that no résumé can do)

**Why:** The single best idea in the treatment: the non-linear career rendered as
a building leaving the spine and returning. Make it literal at the NID beat.

**Files:** `story/beat-buildings.js`, `story/story-engine.js`, `story/beat-data.js`.

**Steps:**
1. At the `veer` beat: take the `Schoogle` building (the NID-era node) and animate
   it **off the city spine** — a curved path away from the cluster center while
   the camera gets *seduced off-axis* to follow it (the camera, a character, loses
   the city). Then at the `break` beat it sits out there, dim, alone (the crater).
2. At the `film` beat (return): the deviated building **swerves back** and docks
   near `Movies`/`Corporate Filims` as the career re-enters the spine — the loop
   off the main avenue closes. This is the visible non-linearity.
3. Generalize lightly: add an optional `veerPath` field to beats so other
   wandered-and-returned eras (e.g., the Europe stall in `europe`) can reuse the
   same off-spine-and-back motion. Wire `europe` to a smaller veer (plane arcs to
   Europe, stalls, turns back — represented by `KH`/`Buddy Tales` drifting out and
   returning).
4. Fallback if `Schoogle` is absent in the GLB: spawn a simple emissive placeholder
   prism at the spine edge, veer it out and back, dispose it after `film`.

**Self-check:** At the veer beat a building visibly leaves the cluster and the
camera follows it off-axis; at the film beat it returns and docks. No orphaned
pivots left after the sequence (check `_pivots`).

**Commit:** `story-pass T5: deviation geography — veer off-spine and return (NID→film, Europe stall)`

---

## T6 — Transition grammar + the single dolly-zoom

**Why:** Transitions must mean something. Build the 5-part grammar; reserve the
visible ruptures for the falls. Use the Vertigo push exactly once.

**Files:** `story/transitions.js`, `story/story-engine.js`, `story/camera-rig.js`,
`story/color-grader.js`.

**Steps:**
1. Implement the grammar cleanly (overlay = transform/visibility per guardrail #3;
   for fades use the inline-style opacity-transition pattern already in
   `transitions.js`, which is CSS-driven, not GSAP — that's allowed):
   - **flow** — dissolve/no-op, the continuous through-line (default).
   - **veer** — match-on-motion: carry camera motion across the join (pairs with
     T5). No overlay flash; the cut is hidden by movement.
   - **drain** — desaturation wipe BEFORE a decline: ramp `ColorGrader` saturation
     toward grey over the run-up (this is the color leaving before the break).
     Used on `film_fall`.
   - **break** — true hard cut → black → **silence**: instant black (no ease),
     hold, score to 0, then reveal. Used on `break`. This is the period.
   - **bloom** — whiteout flood for birth/comeback/arrival.
2. **Two-step at the falls** (brief): the run-up is `drain`, then the fall lands as
   `break`. Sequence them so decline approaches, then ruptures.
3. **Dolly-zoom, exactly once, on `film_fall`:** simultaneously dolly the camera
   along its view axis while tweening FOV the opposite way (Vertigo). Add a
   `dollyZoom(beatCamera, {fovFrom, fovTo, duration})` to `CameraRig`. Guard it
   so it can only fire once per run (a boolean). Do NOT add it to any other beat.
4. Confirm `break`/`film_fall` also cut the score to silence (T1 `setScoreMood`).

**Self-check:** `break` produces a hard black + silence; `film_fall` shows the
desaturate-then-rupture with a single dolly-zoom; all other transitions are
seamless dissolves/motion. The dolly-zoom fires only once.

**Commit:** `story-pass T6: transition grammar (flow/veer/drain/break/bloom) + single Vertigo dolly-zoom on film_fall`

---

## T7 — Explode-view wired to hero-beat rests (proof spills out)

**Why:** "Building opens, the proof spills out, hangs while you read, collapses
back." Turns the rests into evidence. Decision locked: **placeholder cards from
ledger data now**, clean slot for real images later.

**Files:** `story/explode-view.js`, `story/story-engine.js`, `story/beat-data.js`,
`styles.css`.

**Steps:**
1. Add `explodeBuilding` to the hero rest beats in `beat-data.js`: the building
   whose entries should spill — `film`→`Movies`, `pixelate`→`Pixelate`,
   `studio`→`Haus work block`, `europe`→`Buddy Tales` (and/or `KH`). Resolve the
   entry ids via `window.__storyRefs.buildingEntryMap[key].entryIds` (exposed in
   T0), then look up each entry via `getEntryById` (T0).
2. In `story-engine.js`: when a beat with `explodeBuilding` reaches its **rest**,
   call `explodeView.explode(entries, {anchor: <building world pos>})`; on leaving
   the beat (or scrolling past the rest), `explodeView.collapse()` BEFORE the
   building docks. Panels hang during the rest only.
3. Upgrade `explode-view.js` panels: render real ledger fields (title, role, org,
   date, tag pills) onto the canvas/DOM panel — not just `title`. Anchor the
   explosion to the building's world position (pass it in) instead of world
   origin. Leave a clearly-commented **image slot**: if
   `entry.evidence?.[0]?.src` (an image) exists, load it as the panel texture;
   else draw the text card. (No proof images exist yet — text cards are the
   expected output of this pass.)
4. Style per `typography.md`/`Layout & Grid System.md`: paper-cream card, hard
   edges, mono metadata, no border-radius.

**Self-check:** At the Pixelate/studio/film rests, panels explode out from the
building, show real entry text, and collapse before the next beat. No leaked
meshes (collapse disposes geometry/material). Works with zero proof images.

**Commit:** `story-pass T7: explode-view wired to hero rests, real ledger text, image slot for later`

---

## T8 — Persistent cinematic UI (year ticker, letterbox, skip, mode toggle)

**Why:** CLAUDE.md §5 + the brief: a year ticker that scrubs, letterbox bars as
cinematic punctuation, an always-visible skip, and a mode toggle so the user never
loses position.

**Files:** `index.html`, `styles.css`, `story/ui.js`, `story/story-engine.js`,
`story/beat-data.js` (add a `year`/`era` label per beat for the ticker).

**Steps:**
1. Add a `year` (or short era label) to each beat in `beat-data.js` (e.g. boot/meta
   → "", birth → "1991", graduation → "2009–13", veer → "2013–14", film → "2015",
   pixelate → "2017–21", studio → "2022", europe → "2023–24", pondi → "2024→",
   arrival → "today"). Match CLAUDE.md timeline; do not invent dates.
2. **Year ticker** top-left, fixed, mono caps; updates on beat enter, optionally
   interpolating within a beat. Hidden on boot/meta and after handoff.
3. **Letterbox bars:** top/bottom black bars that close in on scene boundaries
   (transitions) and ease open during a beat — cinematic punctuation. CSS height
   transition (not GSAP opacity). Subtle (~6-8vh closed).
4. **Skip link** already exists — ensure it's always visible during story and
   routes to `skipToArchive()`. **Mode toggle** top-right (Story ↔ Archive) per
   §5; in story it just calls skip-to-archive.
5. All overlays must be removed/hidden in `_complete()` and `destroy()` so archive
   mode is clean.

**Self-check:** Year ticker advances with beats; letterbox pulses on transitions;
skip + toggle work at any point; nothing persists into archive after handoff.

**Commit:** `story-pass T8: persistent cinematic UI (year ticker, letterbox, skip, mode toggle)`

---

## T9 — Mobile teaser (tease horizontal → push to desktop → 2D archive)

**Why:** Decision locked: no 3D film on mobile. A lightweight 2D animation-loop
teaser plays the fattest jokes, then pushes the user to open on a PC, with a
fallback into the 2D archive list.

**Files:** new `story/mobile-teaser.js`, `app.js` (route mobile here instead of
straight `init()`), `index.html` + `styles.css` (teaser DOM).

**Steps:**
1. In `app.js showModeSelect`, when `isMobile`, **do not** go straight to archive.
   Launch the mobile teaser. (Keep `?archive` honoring the direct skip.)
2. `mobile-teaser.js`: a 2D (DOM/CSS or 2D-canvas) sequence — NO Three.js, keep it
   light. Orb = a CSS/canvas glowing-blue particle bound to scroll/tap (not
   cursor). Play a **condensed VO subset** using the same MP3 manifest (T1):
   `boot` (cold open) → `birth` (Tamil-typo) → `graduation` (photon bit) →
   device-roast. (Reuse the real clips; TTS fallback if absent.)
3. End on a **landing card**: "Built for a big screen. Open this on your computer."
   with a **Copy link** button (clipboard) and a small "continue to the archive
   anyway" link that calls `init()` into the existing 2D archive. The device-roast
   VO from `handoff`/the gate covers this beat. Final beat stays clean per the
   invariant (no profanity on the ask).
4. Respect `prefers-reduced-motion` (static frames, no loop).

**Self-check:** At <1024px width (or touch + narrow), `/` shows the teaser, not the
3D film; the copy-link button works; "continue to archive" lands in the working 2D
archive. Desktop path unchanged.

**Commit:** `story-pass T9: mobile teaser (2D animation-loop, condensed VO, push-to-desktop, archive fallback)`

---

## T10 — Reduced-motion, performance, integration hardening, docs

**Why:** Make the whole pass robust and self-consistent before sign-off.

**Files:** across `story/*`, `styles.css`, update `CLAUDE-STORY-MODE.md`.

**Steps:**
1. **Reduced-motion:** one central check; gate orb roam/shake, letterbox motion,
   parallax, auto-advance. Provide a calm static version that still tells the story
   (VO + crossfades only).
2. **Performance:** ensure the `_tick` proximity loop only touches the reached set;
   no per-frame allocations in hot paths (reuse Vector3 scratch objects); throttle
   `scheduleRender` correctly. Confirm no GSAP timelines leak across beats (kill
   on `_enterBeat`).
3. **Handoff integrity:** re-verify `_complete()` restores FOV (10°), scene
   background, all buildings visible, removes orb + ambient + color-grader pass +
   all story overlays, and lands archive at the documented orbit (radius 123.5,
   polar 0.516π, az -0.001, targetY 8.3). Archive must be pixel-identical to a
   cold `?archive` load.
4. **No-asset resilience:** the entire film must run with zero MP3s and zero proof
   images (TTS + text cards). Confirm.
5. Update `CLAUDE-STORY-MODE.md` to reflect everything built this pass (audio
   manifest, 1200vh pacing, accumulation, orb-lights-city, deviation geography,
   transition grammar + dolly-zoom, explode-view, persistent UI, mobile teaser).
   Update the "Known issues / gaps" list.

**Self-check:** `?story` → full run → handoff → `?archive` parity. `prefers-
reduced-motion` run is calm but complete. No console errors anywhere. FPS steady.

**Commit:** `story-pass T10: reduced-motion, perf hardening, handoff parity, docs`

---

## T11 — Final self-audit

**Why:** Last pass to catch regressions a long run accumulates.

**Steps:**
1. Re-read the **Creative invariants (§2)** and verify each is honored in code:
   light theme, silent orb, transition grammar, score-the-sincere, falls = hard
   cut + silence, single dolly-zoom, build-toward-now clean ending, accumulation,
   deviation geography.
2. Grep for leftover debug logs / temporary `?debug` dumpers from T0; remove or
   gate them.
3. Confirm all `?v=` cache tags are the single consistent `story-pass-01`.
4. Run `?archive` one final time — must be untouched.
5. Write a short `story/PASS-01-NOTES.md`: what shipped, what's stubbed (proof
   images, real MP3s), and the exact list of asset files Anirudh still needs to
   drop in (`story/audio/<14 ids>.mp3`, optional `score-bed.mp3`, proof images per
   entry). This is the handback to the owner.

**Commit:** `story-pass T11: final self-audit, cleanup, PASS-01 handback notes`

---

## Appendix A — Beat → building → behavior quick map

| Beat | id | Building(s) (canonical key) | Orb | Transition | Score |
|---|---|---|---|---|---|
| 1 | boot | — | blinking | — (locked) | silence |
| 2 | meta | — | curious | flow | low/jokes |
| 3 | birth | Hospital_Building_n3d | gentle | bloom | piano (sincere) |
| 4 | graduation | BBA-ITM | bright | flow | rhythmic; photon bit = swell |
| 5 | veer | **Schoogle** (veers off) | dim | veer | uncertain |
| 6 | break | Schoogle (alone, dim) | flicker | **break (hard cut+silence)** | silence |
| 7 | film | Movies, Corporate Filims (Schoogle returns) | bright | veer | cinematic |
| 8 | film_fall | — | dim | **drain → (single dolly-zoom)** | thinning→silence |
| 9 | pixelate | Pixelate | bright | bloom | electronic |
| 10 | studio | Haus of Pixels, Haus work block | bright | flow | full |
| 11 | europe | Buddy Tales, KH (veer + stall) | gentle | veer | uncertain |
| 12 | pondi | Remote Stations-Homes | gentle | bloom | acoustic |
| 13 | arrival | (full city reveal) | bright | bloom | full (theme complete) |
| 14 | handoff | (orb → cursor, into archive) | handoff | flow | ambient, clean ask |

Explode-view rests: film, pixelate, studio, europe.
Dolly-zoom: film_fall only. Hard cut + silence: break, film_fall.

## Appendix B — Owner asset handback (fill in PASS-01-NOTES.md)

Anirudh must supply, after this pass:
- `story/audio/{boot,meta,birth,graduation,veer,break,film,film_fall,pixelate,studio,europe,pondi,arrival,handoff}.mp3` — 11Labs renders of the approved VO (the persona: burnt-out cosmic genius, Rick's mouth + Rogen's heart; throw away the jokes, lean into the sincere; final beat clean).
- optional `story/audio/score-bed.mp3` — looping ambient music bed.
- proof images per hero entry (drop into `public/proof/<entryId>/`, then they auto-appear in explode panels via the image slot).
